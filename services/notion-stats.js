const axios = require('axios');
const config = require('../config');

const api = axios.create({
  baseURL: 'https://api.notion.com/v1',
  headers: {
    Authorization: `Bearer ${config.notion.apiKey}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  },
});

/**
 * Query leads database with a filter.
 * Handles pagination automatically.
 */
async function queryLeads(filter, sorts = []) {
  const allResults = [];
  let cursor = undefined;

  do {
    const body = { filter, sorts, page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await api.post(`/databases/${config.notion.leadsDbId}/query`, body);
    allResults.push(...res.data.results);
    cursor = res.data.has_more ? res.data.next_cursor : undefined;

    // Rate limit safety
    await new Promise(r => setTimeout(r, 350));
  } while (cursor);

  return allResults;
}

/**
 * Get all leads that became "Sold" on or after a given date.
 * Uses "Initial Paid Date" to detect when the sale actually closed.
 */
async function getNewSales(since) {
  const dateOnly = since.toISOString().split('T')[0]; // YYYY-MM-DD
  const filter = {
    and: [
      { property: 'Status', status: { equals: 'Sold' } },
      { property: 'Initial Paid Date', date: { on_or_after: dateOnly } },
    ],
  };
  return queryLeads(filter);
}

/**
 * Statuses that count as a sale. A sold lead progresses
 * Sold -> Final Sent -> Final Paid, and stays a sale the whole way.
 * Matches the HELM chart filters (Status: Sold, Final Sent, Final Paid).
 */
const SOLD_STATUSES = ['Sold', 'Final Sent', 'Final Paid'];

/**
 * True if a lead is a home building lead.
 * Convention (matches the HELM charts and sheet-sync trade filters):
 * Services Requested contains a "Home Build" option (e.g. "New Home Build").
 */
function isHomeBuildLead(lead) {
  const services = lead.properties?.['Services Requested']?.multi_select?.map(s => s.name) || [];
  return services.some(s => s.toLowerCase().includes('home build'));
}

/**
 * Format a Date as YYYY-MM-DD using its LOCAL components.
 * Notion date properties are date-only strings; comparing as strings avoids
 * timezone skew between Railway (UTC) and local machines (MDT).
 */
function toYMD(date) {
  const d = new Date(date);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dateInRange(notionDateStr, startYMD, endYMD) {
  if (!notionDateStr) return false;
  // Datetime values are normalized to their UTC calendar date — this is how
  // Notion's own date filters (and the HELM charts) bucket them. Date-only
  // values are used as-is.
  const ymd = notionDateStr.length > 10
    ? new Date(notionDateStr).toISOString().slice(0, 10)
    : notionDateStr;
  return ymd >= startYMD && ymd <= endYMD;
}

/**
 * Get sales stats for a specific agent within a date range.
 * - Sales: Status = "Sold" AND "Initial Paid Date" falls in range
 * - Leads taken: "Sales Agent Assigned Date" falls in range
 * - Conversion rate: sales / leads taken (in the same range)
 * - Revenue split into tradesRevenue and homeBuildRevenue
 */
async function getAgentSalesStats(notionUserId, startDate, endDate) {
  const filter = {
    and: [
      { property: 'Sales Agent', people: { contains: notionUserId } },
    ],
  };
  const leads = await queryLeads(filter);

  let sales = 0;
  let revenue = 0;
  let tradesRevenue = 0;
  let homeBuildRevenue = 0;
  let tradesSales = 0;
  let homeBuildSales = 0;
  let bids = 0;
  let revenueQuoted = 0;
  let leadsTaken = 0;

  const startYMD = toYMD(startDate);
  const endYMD = toYMD(endDate);

  for (const lead of leads) {
    const status = lead.properties?.Status?.status?.name;
    const totalAmount = lead.properties?.['Total Amount']?.number || 0;
    const isHomeBuild = isHomeBuildLead(lead);

    // Leads taken in this period: based on "Sales Agent Assigned Date" — TRADES ONLY
    if (!isHomeBuild && dateInRange(lead.properties?.['Sales Agent Assigned Date']?.date?.start, startYMD, endYMD)) {
      leadsTaken++;
    }

    // Bids: tracked by Bid Sent Date falling in the period
    if (dateInRange(lead.properties?.['Bid Sent Date']?.date?.start, startYMD, endYMD)) {
      bids++;
      revenueQuoted += totalAmount;
    }

    // Sales: sold-family status AND Initial Paid Date falls in range
    if (SOLD_STATUSES.includes(status) && dateInRange(lead.properties?.['Initial Paid Date']?.date?.start, startYMD, endYMD)) {
      sales++;
      revenue += totalAmount;
      if (isHomeBuild) {
        homeBuildSales++;
        homeBuildRevenue += totalAmount;
      } else {
        tradesSales++;
        tradesRevenue += totalAmount;
      }
    }
  }

  // Conversion rate is trades-only: trade sales / trade leads taken
  const conversionRate = leadsTaken > 0 ? tradesSales / leadsTaken : 0;
  const bidRate = leadsTaken > 0 ? bids / leadsTaken : 0;

  return { sales, revenue, tradesRevenue, homeBuildRevenue, tradesSales, homeBuildSales, bids, revenueQuoted, leadsTaken, conversionRate, bidRate };
}

/**
 * Get sales stats for ALL mapped agents in a date range.
 * @param {Array} agents - Array of agent objects from agents.json
 */
async function getAllAgentSalesStats(agents, startDate, endDate) {
  const results = [];

  for (const agent of agents.filter(a => a.active && a.notionUserId)) {
    const stats = await getAgentSalesStats(agent.notionUserId, startDate, endDate);
    results.push({
      name: agent.name,
      discordId: agent.discordId,
      ...stats,
    });
  }

  return results.sort((a, b) => b.sales - a.sales || b.revenue - a.revenue);
}

/**
 * Single-query optimization: fetch all leads for an agent once,
 * then compute week/month/all-time stats from the same result set.
 */
async function getAgentStatsAllPeriods(notionUserId, weekStart, monthStart) {
  const filter = {
    and: [
      { property: 'Sales Agent', people: { contains: notionUserId } },
    ],
  };
  const leads = await queryLeads(filter);
  const now = new Date();
  const allTimeStart = new Date('2020-01-01');

  function computeStats(start, end) {
    let sales = 0, revenue = 0, tradesRevenue = 0, homeBuildRevenue = 0,
        tradesSales = 0, homeBuildSales = 0, bids = 0, revenueQuoted = 0, leadsTaken = 0;
    const startYMD = toYMD(start);
    const endYMD = toYMD(end);
    for (const lead of leads) {
      const status = lead.properties?.Status?.status?.name;
      const totalAmount = lead.properties?.['Total Amount']?.number || 0;
      const isHomeBuild = isHomeBuildLead(lead);

      // Leads taken — TRADES ONLY
      if (!isHomeBuild && dateInRange(lead.properties?.['Sales Agent Assigned Date']?.date?.start, startYMD, endYMD)) {
        leadsTaken++;
      }

      if (dateInRange(lead.properties?.['Bid Sent Date']?.date?.start, startYMD, endYMD)) {
        bids++;
        revenueQuoted += totalAmount;
      }

      if (SOLD_STATUSES.includes(status) && dateInRange(lead.properties?.['Initial Paid Date']?.date?.start, startYMD, endYMD)) {
        sales++;
        revenue += totalAmount;
        if (isHomeBuild) {
          homeBuildSales++;
          homeBuildRevenue += totalAmount;
        } else {
          tradesSales++;
          tradesRevenue += totalAmount;
        }
      }
    }
    // Conversion rate is trades-only: trade sales / trade leads taken
    const conversionRate = leadsTaken > 0 ? tradesSales / leadsTaken : 0;
    const bidRate = leadsTaken > 0 ? bids / leadsTaken : 0;
    return { sales, revenue, tradesRevenue, homeBuildRevenue, tradesSales, homeBuildSales, bids, revenueQuoted, leadsTaken, conversionRate, bidRate };
  }

  return {
    week: computeStats(weekStart, now),
    month: computeStats(monthStart, now),
    allTime: computeStats(allTimeStart, now),
  };
}

/**
 * Get the total lifetime sales count for an agent (for milestones).
 * A sale = Status is "Sold" AND has an "Initial Paid Date".
 */
async function getAgentTotalSales(notionUserId) {
  const filter = {
    and: [
      { property: 'Sales Agent', people: { contains: notionUserId } },
      { or: SOLD_STATUSES.map(st => ({ property: 'Status', status: { equals: st } })) },
      { property: 'Initial Paid Date', date: { is_not_empty: true } },
    ],
  };
  const leads = await queryLeads(filter);
  return leads.length;
}

/**
 * Get bids sent today: count and total amount quoted.
 * A bid = lead with "Bid Sent Date" matching today's date.
 * Amount quoted = sum of "Total Amount" for those leads.
 */
async function getBidsSentToday(todayDateStr) {
  const filter = {
    and: [
      { property: 'Bid Sent Date', date: { equals: todayDateStr } },
    ],
  };
  const leads = await queryLeads(filter);

  let count = 0;
  let totalQuoted = 0;
  for (const lead of leads) {
    count++;
    totalQuoted += lead.properties?.['Total Amount']?.number || 0;
  }
  return { count, totalQuoted };
}

/**
 * Extract sale details from a Notion lead page.
 */
function extractSaleDetails(page) {
  const props = page.properties;
  return {
    clientName: props['Client Name']?.title?.[0]?.plain_text || 'Unknown',
    revenue: props['Total Amount']?.number || 0,
    services: props['Services Requested']?.multi_select?.map(s => s.name) || [],
    agentNotionId: props['Sales Agent']?.people?.[0]?.id || null,
  };
}

/**
 * Get all leads with Status = "New" assigned to a specific agent
 * that were assigned within the last N days.
 */
async function getAgentNewLeads(notionUserId, sinceDaysAgo = 7) {
  const since = new Date();
  since.setDate(since.getDate() - sinceDaysAgo);
  const sinceStr = since.toISOString().split('T')[0];

  const filter = {
    and: [
      { property: 'Sales Agent', people: { contains: notionUserId } },
      { property: 'Status', status: { equals: 'New' } },
      { property: 'Sales Agent Assigned Date', date: { on_or_after: sinceStr } },
    ],
  };
  return queryLeads(filter);
}

/**
 * Get new lead counts for all active agents.
 * Returns array of { name, discordId, newLeadCount, leads[] }
 */
async function getAllAgentNewLeads(agents, sinceDaysAgo = 7) {
  const results = [];

  for (const agent of agents.filter(a => a.active && a.notionUserId && a.team !== 'admin')) {
    const leads = await getAgentNewLeads(agent.notionUserId, sinceDaysAgo);
    results.push({
      name: agent.name,
      discordId: agent.discordId,
      newLeadCount: leads.length,
      leads,
    });
  }

  return results.sort((a, b) => b.newLeadCount - a.newLeadCount);
}

module.exports = {
  queryLeads,
  getNewSales,
  isHomeBuildLead,
  getAgentSalesStats,
  getAllAgentSalesStats,
  getAgentStatsAllPeriods,
  getAgentTotalSales,
  getBidsSentToday,
  extractSaleDetails,
  getAgentNewLeads,
  getAllAgentNewLeads,
};

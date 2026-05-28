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
 * Get sales stats for a specific agent within a date range.
 * - Sales: Status = "Sold" AND "Initial Paid Date" falls in range
 * - Leads taken: "Sales Agent Assigned Date" falls in range
 * - Conversion rate: sales / leads taken (in the same range)
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
  let bids = 0;
  let revenueQuoted = 0;
  let leadsTaken = 0;

  const start = new Date(startDate);
  const end = new Date(endDate);

  for (const lead of leads) {
    const status = lead.properties?.Status?.status?.name;
    const totalAmount = lead.properties?.['Total Amount']?.number || 0;

    // Leads taken in this period: based on "Sales Agent Assigned Date"
    const assignedDateStr = lead.properties?.['Sales Agent Assigned Date']?.date?.start;
    if (assignedDateStr) {
      const assignedDate = new Date(assignedDateStr);
      if (assignedDate >= start && assignedDate <= end) {
        leadsTaken++;
      }
    }

    // Bids: tracked by Bid Sent Date falling in the period
    const bidDateStr = lead.properties?.['Bid Sent Date']?.date?.start;
    if (bidDateStr) {
      const bidDate = new Date(bidDateStr);
      if (bidDate >= start && bidDate <= end) {
        bids++;
        revenueQuoted += totalAmount;
      }
    }

    // Sales: Status = "Sold" AND Initial Paid Date falls in range
    if (status === 'Sold') {
      const paidDateStr = lead.properties?.['Initial Paid Date']?.date?.start;
      if (paidDateStr) {
        const paidDate = new Date(paidDateStr);
        if (paidDate >= start && paidDate <= end) {
          sales++;
          revenue += totalAmount;
        }
      }
    }
  }

  const conversionRate = leadsTaken > 0 ? sales / leadsTaken : 0;
  const bidRate = leadsTaken > 0 ? bids / leadsTaken : 0;

  return { sales, revenue, bids, revenueQuoted, leadsTaken, conversionRate, bidRate };
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
    let sales = 0, revenue = 0, bids = 0, revenueQuoted = 0, leadsTaken = 0;
    for (const lead of leads) {
      const status = lead.properties?.Status?.status?.name;
      const totalAmount = lead.properties?.['Total Amount']?.number || 0;

      const assignedDateStr = lead.properties?.['Sales Agent Assigned Date']?.date?.start;
      if (assignedDateStr) {
        const d = new Date(assignedDateStr);
        if (d >= start && d <= end) leadsTaken++;
      }

      const bidDateStr = lead.properties?.['Bid Sent Date']?.date?.start;
      if (bidDateStr) {
        const d = new Date(bidDateStr);
        if (d >= start && d <= end) { bids++; revenueQuoted += totalAmount; }
      }

      if (status === 'Sold') {
        const paidDateStr = lead.properties?.['Initial Paid Date']?.date?.start;
        if (paidDateStr) {
          const d = new Date(paidDateStr);
          if (d >= start && d <= end) { sales++; revenue += totalAmount; }
        }
      }
    }
    const conversionRate = leadsTaken > 0 ? sales / leadsTaken : 0;
    const bidRate = leadsTaken > 0 ? bids / leadsTaken : 0;
    return { sales, revenue, bids, revenueQuoted, leadsTaken, conversionRate, bidRate };
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
      { property: 'Status', status: { equals: 'Sold' } },
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

module.exports = {
  queryLeads,
  getNewSales,
  getAgentSalesStats,
  getAllAgentSalesStats,
  getAgentStatsAllPeriods,
  getAgentTotalSales,
  getBidsSentToday,
  extractSaleDetails,
};

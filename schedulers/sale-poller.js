const notionStats = require('../services/notion-stats');
const milestoneTracker = require('../services/milestone-tracker');
const { getActiveAgents, findByNotionId } = require('../utils/agent-store');
const { saleEmbed, milestoneEmbed } = require('../utils/embeds');
const { getWeekStart, getMonthStart } = require('../utils/formatters');
const config = require('../config');

const fs = require('fs');
const path = require('path');

const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '../data');
const ANNOUNCED_FILE = path.join(DATA_DIR, 'announced-sales.json');

// Announce sales whose Initial Paid Date (Mountain-time calendar day) is
// within this many days back. Covers sales entered after 6 PM MDT (past
// midnight UTC on Railway) and next-day backfills.
const WINDOW_DAYS = 2;

function mtDate(daysAgo = 0) {
  return new Date(Date.now() - daysAgo * 86400000)
    .toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}

/**
 * Load announced-sale dedup map { saleId: 'YYYY-MM-DD announced' }.
 * Migrates the legacy { date, ids: [] } format in place.
 */
function loadAnnounced() {
  try {
    const data = JSON.parse(fs.readFileSync(ANNOUNCED_FILE, 'utf8'));
    if (Array.isArray(data.ids)) {
      const map = {};
      for (const id of data.ids) map[id] = data.date || mtDate();
      return map;
    }
    return data.ids || {};
  } catch {}
  return {};
}

function saveAnnounced(map) {
  // Keep a rolling 7 days of history so nothing re-announces within the window
  const cutoff = mtDate(7);
  for (const [id, d] of Object.entries(map)) {
    if (d < cutoff) delete map[id];
  }
  fs.writeFileSync(ANNOUNCED_FILE, JSON.stringify({ ids: map }, null, 2));
}

/**
 * Poll Notion for new sales and announce them.
 * Uses in-memory dedup seeded on startup to prevent duplicates across redeploys.
 * @param {Client} client - Discord client
 * @param {string} channelId - Channel to post announcements
 */
async function pollForSales(client, channelId) {
  try {
    const windowStart = mtDate(WINDOW_DAYS); // YYYY-MM-DD, Mountain time

    const newSales = await notionStats.getNewSales(windowStart);

    if (newSales.length === 0) return;

    const announced = loadAnnounced();
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    let posted = 0;

    for (const sale of newSales) {
      // Skip if already announced (persistent dedup)
      if (announced[sale.id]) continue;

      const details = notionStats.extractSaleDetails(sale);
      // Find agent — check all agents (active or not) since we announce all sales
      const { loadAgents } = require('../utils/agent-store');
      const allAgents = loadAgents();
      const agent = allAgents.find(a => a.notionUserId === details.agentNotionId);
      if (!agent) continue;

      // Verify Initial Paid Date (MT calendar day) is within the window
      const paidDateStr = sale.properties?.['Initial Paid Date']?.date?.start;
      if (!paidDateStr) continue;
      if (paidDateStr.slice(0, 10) < windowStart) continue;

      // Get week/month stats for this agent
      const [weekStats, monthStats, totalSales] = await Promise.all([
        notionStats.getAgentSalesStats(agent.notionUserId, getWeekStart(), new Date()),
        notionStats.getAgentSalesStats(agent.notionUserId, getMonthStart(), new Date()),
        notionStats.getAgentTotalSales(agent.notionUserId),
      ]);

      // Post sale announcement
      const embed = saleEmbed({
        agentName: agent.name,
        revenue: details.revenue,
        weekSales: weekStats.sales,
        weekRevenue: weekStats.revenue,
        monthSales: monthStats.sales,
        monthRevenue: monthStats.revenue,
        clientName: details.clientName,
        services: details.services,
      });

      await channel.send({ content: `@here ${agent.discordId ? `<@${agent.discordId}>` : agent.name} just closed!`, embeds: [embed] });

      // Check milestones — home builds get separate treatment
      const isHomeBuild = details.services.some(s =>
        s.toLowerCase().includes('new home') ||
        s.toLowerCase().includes('new build') ||
        s.toLowerCase().includes('new construction') ||
        s.toLowerCase().includes('full build')
      );

      const newMilestones = milestoneTracker.checkMilestones(
        agent.name,
        totalSales,
        weekStats.sales,
        details.revenue,
        isHomeBuild,
      );

      for (const m of newMilestones) {
        const mEmbed = milestoneEmbed(agent.name, m.message, m.type);
        await channel.send({ embeds: [mEmbed] });
      }

      // Mark as announced
      announced[sale.id] = mtDate();
      posted++;

      await new Promise(r => setTimeout(r, 1000));
    }

    if (posted > 0) {
      saveAnnounced(announced);
      console.log(`[SalePoller] Announced ${posted} new sale(s)`);
    }
  } catch (err) {
    console.error('[SalePoller] Error:', err.message);
  }
}

module.exports = { pollForSales };

const fs = require('fs');
const path = require('path');
const notionStats = require('../services/notion-stats');
const milestoneTracker = require('../services/milestone-tracker');
const { getActiveAgents, findByNotionId } = require('../utils/agent-store');
const { saleEmbed, milestoneEmbed } = require('../utils/embeds');
const { getWeekStart, getMonthStart } = require('../utils/formatters');
const config = require('../config');

const ANNOUNCED_FILE = path.join(__dirname, '../data/announced-sales.json');

/**
 * Load the set of already-announced Notion page IDs.
 */
function loadAnnounced() {
  try {
    return new Set(JSON.parse(fs.readFileSync(ANNOUNCED_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

/**
 * Save announced page IDs to disk (persists across restarts).
 */
function saveAnnounced(set) {
  fs.writeFileSync(ANNOUNCED_FILE, JSON.stringify([...set], null, 2));
}

/**
 * Poll Notion for new sales and announce them.
 * Uses a persistent set of announced page IDs to prevent duplicates.
 * Only announces sales where Initial Paid Date is today.
 * @param {Client} client - Discord client
 * @param {string} channelId - Channel to post announcements
 */
async function pollForSales(client, channelId) {
  try {
    // Only look for sales with Initial Paid Date = today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const newSales = await notionStats.getNewSales(todayStart);

    if (newSales.length === 0) return;

    const announced = loadAnnounced();
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    let posted = 0;

    for (const sale of newSales) {
      // Skip if already announced
      if (announced.has(sale.id)) continue;

      const details = notionStats.extractSaleDetails(sale);
      const agent = findByNotionId(details.agentNotionId);
      if (!agent) continue;

      // Verify Initial Paid Date is actually today
      const paidDateStr = sale.properties?.['Initial Paid Date']?.date?.start;
      if (!paidDateStr) continue;
      const paidDate = new Date(paidDateStr);
      if (paidDate < todayStart) continue;

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

      await channel.send({ content: agent.discordId ? `<@${agent.discordId}>` : '', embeds: [embed] });

      // Check milestones
      const newMilestones = milestoneTracker.checkMilestones(
        agent.name,
        totalSales,
        weekStats.sales,
        details.revenue,
      );

      for (const msg of newMilestones) {
        const mEmbed = milestoneEmbed(agent.name, msg);
        await channel.send({ embeds: [mEmbed] });
      }

      // Mark as announced
      announced.add(sale.id);
      posted++;

      // Small delay between announcements
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

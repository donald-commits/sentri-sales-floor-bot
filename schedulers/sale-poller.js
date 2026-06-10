const notionStats = require('../services/notion-stats');
const milestoneTracker = require('../services/milestone-tracker');
const { getActiveAgents, findByNotionId } = require('../utils/agent-store');
const { saleEmbed, milestoneEmbed } = require('../utils/embeds');
const { getWeekStart, getMonthStart } = require('../utils/formatters');
const config = require('../config');

// In-memory set — survives across polls but not across deploys.
// On startup, we query Notion for all sold leads with Initial Paid Date = today
// and pre-seed this set so we never re-announce after a redeploy.
let announced = new Set();
let seeded = false;

/**
 * Seed the announced set with all sales from today on startup.
 * This prevents re-announcements after a redeploy.
 */
async function seedAnnounced() {
  if (seeded) return;
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const existingSales = await notionStats.getNewSales(todayStart);
    for (const sale of existingSales) {
      announced.add(sale.id);
    }
    seeded = true;
    console.log(`[SalePoller] Seeded ${announced.size} existing sales for today (won't re-announce)`);
  } catch (err) {
    console.error('[SalePoller] Seed error:', err.message);
  }
}

/**
 * Poll Notion for new sales and announce them.
 * Uses in-memory dedup seeded on startup to prevent duplicates across redeploys.
 * @param {Client} client - Discord client
 * @param {string} channelId - Channel to post announcements
 */
async function pollForSales(client, channelId) {
  try {
    // On first run, seed with existing sales so we don't re-announce
    await seedAnnounced();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const newSales = await notionStats.getNewSales(todayStart);

    if (newSales.length === 0) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    let posted = 0;

    for (const sale of newSales) {
      // Skip if already announced (in-memory dedup)
      if (announced.has(sale.id)) continue;

      const details = notionStats.extractSaleDetails(sale);
      // Find agent — check all agents (active or not) since we announce all sales
      const { loadAgents } = require('../utils/agent-store');
      const allAgents = loadAgents();
      const agent = allAgents.find(a => a.notionUserId === details.agentNotionId);
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
      announced.add(sale.id);
      posted++;

      await new Promise(r => setTimeout(r, 1000));
    }

    if (posted > 0) {
      console.log(`[SalePoller] Announced ${posted} new sale(s)`);
    }
  } catch (err) {
    console.error('[SalePoller] Error:', err.message);
  }
}

module.exports = { pollForSales };

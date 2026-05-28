const notionStats = require('../services/notion-stats');
const { getActiveAgents } = require('../utils/agent-store');
const { salesLeaderboardEmbed } = require('../utils/embeds');
const { getWeekStart } = require('../utils/formatters');

/**
 * Post the daily update of the weekly sales leaderboard.
 * @param {Client} client - Discord client
 * @param {string} channelId - Channel to post
 */
async function runDailySalesBoard(client, channelId) {
  try {
    const agents = getActiveAgents();
    const weekStart = getWeekStart();
    const stats = await notionStats.getAllAgentSalesStats(agents, weekStart, new Date());

    if (stats.length === 0) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const weekLabel = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const embed = salesLeaderboardEmbed(stats, weekLabel);
    await channel.send({ embeds: [embed] });

    console.log(`[DailySalesBoard] Posted weekly sales leaderboard for ${stats.length} agents`);
  } catch (err) {
    console.error('[DailySalesBoard] Error:', err.message);
  }
}

module.exports = { runDailySalesBoard };

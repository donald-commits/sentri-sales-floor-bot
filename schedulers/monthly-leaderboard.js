const notionStats = require('../services/notion-stats');
const { getActiveAgents } = require('../utils/agent-store');
const { salesLeaderboardEmbed } = require('../utils/embeds');
const { getMonthStart, formatMoney, formatPercent } = require('../utils/formatters');
const { EmbedBuilder } = require('discord.js');

/**
 * Post the monthly sales leaderboard.
 * Runs Monday morning — shows the full current month's stats.
 * @param {Client} client - Discord client
 * @param {string} channelId - Channel to post
 */
async function runMonthlyLeaderboard(client, channelId) {
  try {
    const agents = getActiveAgents();
    const monthStart = getMonthStart();
    const stats = await notionStats.getAllAgentSalesStats(agents, monthStart, new Date());

    if (stats.length === 0) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`\u{1F4C6} MONTHLY SALES LEADERBOARD \u{1F4C6}`)
      .setDescription(
        stats.map((agent, i) => {
          const rank = i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : `#${i + 1}`;
          const mention = agent.discordId ? `<@${agent.discordId}>` : agent.name;
          return `${rank} ${mention} — **${agent.sales}** sales | ${formatPercent(agent.conversionRate)} conv | ${formatMoney(agent.revenue)} revenue | ${agent.leadsTaken} leads taken`;
        }).join('\n')
      )
      .setFooter({ text: monthLabel })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log(`[MonthlyLeaderboard] Posted monthly leaderboard for ${stats.length} agents`);
  } catch (err) {
    console.error('[MonthlyLeaderboard] Error:', err.message);
  }
}

module.exports = { runMonthlyLeaderboard };

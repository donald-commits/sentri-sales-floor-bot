const { EmbedBuilder } = require('discord.js');
const notionStats = require('../services/notion-stats');
const { getActiveAgents } = require('../utils/agent-store');
const { getWeekStart, formatMoney, rankEmoji } = require('../utils/formatters');

/**
 * Top-performer shoutout lines. {name} and {revenue} get replaced.
 * Professional but energetic — less hype than the monthly blowout.
 */
const TOP_PERFORMER_LINES = [
  '{name} led the team this week with {revenue} sold. That\'s the standard.',
  'Top revenue this week: {name} with {revenue}. Well earned.',
  '{name} put up {revenue} this week. Nobody did it better.',
  'The week belongs to {name} — {revenue} sold. Respect.',
  '{name} set the pace this week: {revenue} in revenue. Take notes.',
  'Revenue king of the week: {name} with {revenue} on the board.',
  '{name} closed out the week on top with {revenue} sold. Solid work.',
  'This week\'s heavy hitter: {name}, {revenue} in closed business.',
  '{name} outsold everyone this week — {revenue}. That\'s how it\'s done.',
  'Hats off to {name}: {revenue} sold this week. The bar is set.',
  '{name} finished the week #1 with {revenue}. Consistency wins.',
  'Week\'s best: {name} with {revenue} in revenue. Keep stacking.',
  '{name} owned the board this week — {revenue} sold.',
  'The top spot goes to {name}: {revenue} closed this week.',
  '{name} delivered {revenue} this week. That\'s what leading looks like.',
  'Numbers in: {name} takes the week with {revenue} sold.',
  '{name} was the one to beat this week — {revenue} in revenue.',
  'Big week for {name}: {revenue} sold and the top spot secured.',
  '{name} showed up and showed out: {revenue} this week.',
  'The revenue crown this week goes to {name} — {revenue}.',
  '{name} paced the floor with {revenue} sold. Earned, not given.',
  'Another strong week from {name}: {revenue} on the board.',
  '{name} closed {revenue} this week. The board doesn\'t lie.',
  'Week over. {name} on top. {revenue} sold. Simple as that.',
  '{name} put the team on notice: {revenue} this week.',
  'Top biller this week: {name} at {revenue}. Quality work.',
  '{name} stacked {revenue} this week. That\'s the blueprint.',
  'When it counted, {name} delivered — {revenue} sold this week.',
  '{name} takes the weekly crown with {revenue}. Run it back Monday.',
  'Strong finish: {name} leads the week at {revenue} sold.',
];

/**
 * Post the end-of-week leaderboard.
 * Ranks all agents by REVENUE SOLD this week (Sun-Fri) and shouts out the top performer.
 * Runs Friday 5 PM MDT.
 */
async function runWeeklyRecap(client, channelId) {
  try {
    const agents = getActiveAgents();
    const weekStart = getWeekStart();
    const stats = await notionStats.getAllAgentSalesStats(agents, weekStart, new Date());

    if (stats.length === 0) return;

    // Rank by revenue sold — that's what matters
    stats.sort((a, b) => b.revenue - a.revenue || b.sales - a.sales);

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const lines = stats.map((agent, i) => {
      const rank = rankEmoji(i);
      const mention = agent.discordId ? `<@${agent.discordId}>` : agent.name;
      return `${rank} ${mention} — **${formatMoney(agent.revenue)}** sold | ${agent.sales} sales`;
    });

    const top = stats[0];
    let shoutout = '';
    if (top && top.revenue > 0) {
      const line = TOP_PERFORMER_LINES[Math.floor(Math.random() * TOP_PERFORMER_LINES.length)]
        .replace('{name}', top.discordId ? `<@${top.discordId}>` : top.name)
        .replace('{revenue}', `**${formatMoney(top.revenue)}**`);
      shoutout = `\n\n\u{1F3C6} ${line}`;
    }

    const weekLabel = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ranked by revenue sold`;

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('\u{1F4B0} END OF WEEK LEADERBOARD \u{1F4B0}')
      .setDescription(lines.join('\n') + shoutout)
      .setFooter({ text: weekLabel })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log(`[WeeklyRecap] Posted end-of-week leaderboard, ${stats.length} agents`);
  } catch (err) {
    console.error('[WeeklyRecap] Error:', err.message);
  }
}

module.exports = { runWeeklyRecap };

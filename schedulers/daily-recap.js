const { EmbedBuilder } = require('discord.js');
const notionStats = require('../services/notion-stats');
const { getActiveAgents } = require('../utils/agent-store');
const { getWeekStart, getMonthStart, formatMoney } = require('../utils/formatters');

/**
 * Post a daily team recap — sales, bids, revenue. No call data.
 * High performer = highest revenue sold today.
 * Runs at 5:00 PM MST weekdays in #daily-recap.
 */
async function runDailyRecap(client, channelId) {
  try {
    const agents = getActiveAgents().filter(a => a.team !== 'admin');
    const now = new Date();
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
    const todayStart = new Date(todayStr);

    // ─── Sales stats (today) ───────────────────────────────────
    const todaySalesStats = await notionStats.getAllAgentSalesStats(agents, todayStart, now);
    const todaySales = todaySalesStats.reduce((sum, a) => sum + a.sales, 0);
    const todayRevenue = todaySalesStats.reduce((sum, a) => sum + a.revenue, 0);

    // ─── Sales stats (this week) ───────────────────────────────
    const weekSalesStats = await notionStats.getAllAgentSalesStats(agents, weekStart, now);
    const weekSales = weekSalesStats.reduce((sum, a) => sum + a.sales, 0);
    const weekRevenue = weekSalesStats.reduce((sum, a) => sum + a.revenue, 0);

    // ─── Sales stats (this month) ──────────────────────────────
    const monthSalesStats = await notionStats.getAllAgentSalesStats(agents, monthStart, now);
    const monthSales = monthSalesStats.reduce((sum, a) => sum + a.sales, 0);
    const monthRevenue = monthSalesStats.reduce((sum, a) => sum + a.revenue, 0);

    // ─── Bids sent today ───────────────────────────────────────
    const bidStats = await notionStats.getBidsSentToday(todayStr);

    // ─── High performer = highest revenue sold today ───────────
    let highPerformer = null;
    let highRevenue = 0;
    for (const s of todaySalesStats) {
      if (s.revenue > highRevenue) {
        highRevenue = s.revenue;
        highPerformer = s;
      }
    }

    // ─── Build the embed ───────────────────────────────────────
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/Denver' });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`\u{1F4CA} DAILY RECAP — ${dayName}`)
      .addFields(
        {
          name: '\u{1F4B0} Sales Today',
          value: todaySales > 0
            ? `**${todaySales}** sale${todaySales > 1 ? 's' : ''} | **${formatMoney(todayRevenue)}** revenue`
            : 'No sales today',
          inline: false,
        },
        {
          name: '\u{1F4E8} Bids Sent Today',
          value: `**${bidStats.count}** bids sent | **${formatMoney(bidStats.totalQuoted)}** quoted`,
          inline: false,
        },
        {
          name: '\u{1F4C5} This Week (Sun-Sat)',
          value: `**${weekSales}** sales | **${formatMoney(weekRevenue)}** revenue`,
          inline: true,
        },
        {
          name: '\u{1F4C6} This Month',
          value: `**${monthSales}** sales | **${formatMoney(monthRevenue)}** revenue`,
          inline: true,
        },
      );

    if (highPerformer && highRevenue > 0) {
      const mention = highPerformer.discordId ? `<@${highPerformer.discordId}>` : highPerformer.name;
      embed.addFields({
        name: '\u{1F31F} High Performer of the Day',
        value: `${mention} — **${formatMoney(highRevenue)}** revenue sold | ${highPerformer.sales} sale${highPerformer.sales > 1 ? 's' : ''}`,
        inline: false,
      });
    }

    embed.setTimestamp();
    embed.setFooter({ text: 'Sentri Homes Sales Floor' });

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] });

    console.log(`[DailyRecap] Posted recap: ${todaySales} sales, ${bidStats.count} bids`);
  } catch (err) {
    console.error('[DailyRecap] Error:', err.message);
  }
}

module.exports = { runDailyRecap };

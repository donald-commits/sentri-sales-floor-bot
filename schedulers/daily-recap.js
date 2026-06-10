const { EmbedBuilder } = require('discord.js');
const notionStats = require('../services/notion-stats');
const { getCallStatsForDate } = require('../services/call-log-stats');
const { getActiveAgents } = require('../utils/agent-store');
const { getWeekStart, getMonthStart, formatTime, formatMoney } = require('../utils/formatters');

/**
 * Post a daily team recap — calls, sales, bids, revenue, high performer.
 * Runs at 5:10 PM MDT weekdays in #daily-recap.
 */
async function runDailyRecap(client, channelId) {
  try {
    const agents = getActiveAgents().filter(a => a.team !== 'admin');
    const now = new Date();
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
    const todayStart = new Date(todayStr);

    // Call stats from Notion call log
    const callStats = await getCallStatsForDate(agents);
    const totalCalls = callStats.reduce((sum, a) => sum + a.calls, 0);
    const totalTalkTime = callStats.reduce((sum, a) => sum + a.talkTimeMinutes, 0);
    const topCaller = callStats[0];

    // Sales stats (today)
    const todaySalesStats = await notionStats.getAllAgentSalesStats(agents, todayStart, now);
    const todaySales = todaySalesStats.reduce((sum, a) => sum + a.sales, 0);
    const todayRevenue = todaySalesStats.reduce((sum, a) => sum + a.revenue, 0);

    // Sales stats (week/month)
    const weekSalesStats = await notionStats.getAllAgentSalesStats(agents, weekStart, now);
    const weekSales = weekSalesStats.reduce((sum, a) => sum + a.sales, 0);
    const weekRevenue = weekSalesStats.reduce((sum, a) => sum + a.revenue, 0);

    const monthSalesStats = await notionStats.getAllAgentSalesStats(agents, monthStart, now);
    const monthSales = monthSalesStats.reduce((sum, a) => sum + a.sales, 0);
    const monthRevenue = monthSalesStats.reduce((sum, a) => sum + a.revenue, 0);

    // Bids sent today
    const bidStats = await notionStats.getBidsSentToday(todayStr);

    // High performer — weighted score: 3 pts/sale, 1 pt/10 calls, 1 pt/30 min talk
    let highPerformer = null;
    let highScore = 0;
    for (const agent of agents) {
      const sales = todaySalesStats.find(a => a.name === agent.name)?.sales || 0;
      const calls = callStats.find(a => a.name === agent.name)?.calls || 0;
      const talk = callStats.find(a => a.name === agent.name)?.talkTimeMinutes || 0;
      const score = (sales * 3) + (calls / 10) + (talk / 30);
      if (score > highScore) {
        highScore = score;
        highPerformer = { name: agent.name, discordId: agent.discordId, sales, calls, talk };
      }
    }

    const dayName = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/Denver' });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`\u{1F4CA} DAILY RECAP — ${dayName}`)
      .addFields(
        {
          name: '\u{1F4DE} Calls & Talk Time',
          value: `**${totalCalls}** total calls | **${formatTime(totalTalkTime)}** total talk time\n` +
            (topCaller && topCaller.calls > 0
              ? `Top dialer: **${topCaller.name}** (${topCaller.calls} calls, ${formatTime(topCaller.talkTimeMinutes)})`
              : 'No calls recorded today'),
          inline: false,
        },
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

    if (highPerformer && highScore > 0) {
      const mention = highPerformer.discordId ? `<@${highPerformer.discordId}>` : highPerformer.name;
      const parts = [];
      if (highPerformer.sales > 0) parts.push(`${highPerformer.sales} sale${highPerformer.sales > 1 ? 's' : ''}`);
      if (highPerformer.calls > 0) parts.push(`${highPerformer.calls} calls`);
      if (highPerformer.talk > 0) parts.push(`${formatTime(highPerformer.talk)} talk time`);
      embed.addFields({
        name: '\u{1F31F} High Performer of the Day',
        value: `${mention} — ${parts.join(' | ')}`,
        inline: false,
      });
    }

    embed.setTimestamp();
    embed.setFooter({ text: 'Sentri Homes Sales Floor' });

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;
    await channel.send({ embeds: [embed] });

    console.log(`[DailyRecap] Posted recap: ${totalCalls} calls, ${todaySales} sales, ${bidStats.count} bids`);
  } catch (err) {
    console.error('[DailyRecap] Error:', err.message);
  }
}

module.exports = { runDailyRecap };

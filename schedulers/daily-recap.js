const { EmbedBuilder } = require('discord.js');
const notionStats = require('../services/notion-stats');
const quoStats = require('../services/quo-stats');
const { getActiveAgents, getSentriAgents } = require('../utils/agent-store');
const { getWeekStart, getMonthStart, formatTime, formatMoney, formatPercent } = require('../utils/formatters');

/**
 * Post a comprehensive daily/weekly team recap.
 * Runs at 5:00 PM MST weekdays in #wins-and-goals.
 */
async function runDailyRecap(client, channelId) {
  try {
    const agents = getActiveAgents();
    const sentriAgents = getSentriAgents();
    const now = new Date();
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();

    // Today's date boundaries
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString().split('T')[0];

    // ─── Call stats (Sentri agents only) ───────────────────────────
    const callStats = await quoStats.getAgentCallStats(sentriAgents);
    const totalCalls = callStats.reduce((sum, a) => sum + a.calls, 0);
    const totalTalkTime = callStats.reduce((sum, a) => sum + a.talkTimeMinutes, 0);
    const topCaller = callStats[0]; // already sorted by calls desc

    // ─── Sales stats (all agents, today) ───────────────────────────
    const todaySalesStats = await notionStats.getAllAgentSalesStats(agents, todayStart, now);
    const todaySales = todaySalesStats.reduce((sum, a) => sum + a.sales, 0);
    const todayRevenue = todaySalesStats.reduce((sum, a) => sum + a.revenue, 0);
    const todayTopSeller = todaySalesStats.find(a => a.sales > 0);

    // ─── Sales stats (all agents, this week) ───────────────────────
    const weekSalesStats = await notionStats.getAllAgentSalesStats(agents, weekStart, now);
    const weekSales = weekSalesStats.reduce((sum, a) => sum + a.sales, 0);
    const weekRevenue = weekSalesStats.reduce((sum, a) => sum + a.revenue, 0);

    // ─── Sales stats (all agents, this month) ──────────────────────
    const monthSalesStats = await notionStats.getAllAgentSalesStats(agents, monthStart, now);
    const monthSales = monthSalesStats.reduce((sum, a) => sum + a.sales, 0);
    const monthRevenue = monthSalesStats.reduce((sum, a) => sum + a.revenue, 0);

    // ─── Bids sent today + amount quoted ───────────────────────────
    const bidStats = await notionStats.getBidsSentToday(todayStr);

    // ─── High performer of the day ─────────────────────────────────
    // Score: 3 pts per sale, 1 pt per 10 calls, 1 pt per 30 min talk time
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

    // ─── Agents who hit call targets ───────────────────────────────
    const hitTargets = callStats.filter(a => a.calls >= a.callTarget && a.talkTimeMinutes >= a.talkTimeTarget);

    // ─── Build the embed ───────────────────────────────────────────
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/Denver' });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`\u{1F4CA} DAILY RECAP — ${dayName}`)
      .addFields(
        {
          name: '\u{1F4DE} Calls & Talk Time (Sentri)',
          value: `**${totalCalls}** total calls | **${formatTime(totalTalkTime)}** total talk time\n` +
            (topCaller && topCaller.calls > 0
              ? `Top dialer: **${topCaller.name}** (${topCaller.calls} calls, ${formatTime(topCaller.talkTimeMinutes)})`
              : 'No calls recorded today'),
          inline: false,
        },
        {
          name: '\u{1F4B0} Sales Today',
          value: todaySales > 0
            ? `**${todaySales}** sale${todaySales > 1 ? 's' : ''} | **${formatMoney(todayRevenue)}** revenue` +
              (todayTopSeller ? `\nTop closer: **${todayTopSeller.name}** (${todayTopSeller.sales} sales, ${formatMoney(todayTopSeller.revenue)})` : '')
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

    // High performer
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

    // Who hit targets
    if (hitTargets.length > 0) {
      embed.addFields({
        name: '\u{2705} Hit Call Targets',
        value: hitTargets.map(a => `**${a.name}** (${a.calls} calls, ${formatTime(a.talkTimeMinutes)})`).join('\n'),
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

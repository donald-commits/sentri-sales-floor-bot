const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveAgents } = require('../utils/agent-store');
const { getCallStatsForDate } = require('../services/call-log-stats');
const notionStats = require('../services/notion-stats');
const { callLeaderboardEmbed } = require('../utils/embeds');
const { getWeekStart, getMonthStart, formatTime, formatMoney, formatPercent, rankEmoji } = require('../utils/formatters');

function buildSalesEmbed(stats, title, color, footerText) {
  const lines = stats.map((agent, i) => {
    const rank = rankEmoji(i);
    const mention = agent.discordId ? `<@${agent.discordId}>` : agent.name;
    return `${rank} ${mention} — **${agent.sales}** sales | ${formatPercent(agent.conversionRate)} conv | ${formatMoney(agent.revenue)}`;
  });
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setFooter({ text: footerText })
    .setTimestamp();
}

function buildRankedEmbed(stats, title, color, footerText, formatLine) {
  const lines = stats.map((agent, i) => {
    const rank = rankEmoji(i);
    const mention = agent.discordId ? `<@${agent.discordId}>` : agent.name;
    return `${rank} ${mention} — ${formatLine(agent)}`;
  });
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setFooter({ text: footerText })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View a leaderboard')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Which leaderboard to show')
        .setRequired(true)
        .addChoices(
          { name: 'Calls (Today)', value: 'calls' },
          { name: 'Talk Time (Today)', value: 'talktime' },
          { name: 'Sales (This Week)', value: 'sales-week' },
          { name: 'Sales (This Month)', value: 'sales-month' },
          { name: 'Sales (All Time)', value: 'sales-all' },
          { name: 'Revenue Sold (This Month)', value: 'revenue-month' },
          { name: 'Revenue Quoted (This Week)', value: 'quoted-week' },
          { name: 'Revenue Quoted (This Month)', value: 'quoted-month' },
          { name: 'Bids Sent (This Week)', value: 'bids-week' },
          { name: 'Bids Sent (This Month)', value: 'bids-month' },
          { name: 'Conversion Rate (This Month)', value: 'conv-month' },
          { name: 'Leads Taken (This Week)', value: 'leads-week' },
        )),

  async execute(interaction) {
    await interaction.deferReply();

    const type = interaction.options.getString('type');
    const allAgents = getActiveAgents().filter(a => a.team !== 'admin');

    // ─── Call-based leaderboards (Sentri only) ──────────────────
    if (type === 'calls') {
      const stats = await getCallStatsForDate(allAgents);
      const embed = callLeaderboardEmbed(stats, 'LIVE CALL LEADERBOARD');
      return interaction.editReply({ embeds: [embed] });
    }

    if (type === 'talktime') {
      const stats = await getCallStatsForDate(allAgents);
      stats.sort((a, b) => b.talkTimeMinutes - a.talkTimeMinutes);
      const embed = buildRankedEmbed(stats,
        '\u{1F399}\uFE0F TALK TIME LEADERBOARD \u{1F399}\uFE0F', 0x3498db, 'Today',
        a => `**${formatTime(a.talkTimeMinutes)}** talk time | ${a.calls} calls`
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ─── Sales-based leaderboards (all agents) ──────────────────
    const periodMap = {
      'sales-week':    { start: getWeekStart(),          label: 'This Week (Sun-Sat)' },
      'sales-month':   { start: getMonthStart(),         label: 'This Month' },
      'sales-all':     { start: new Date('2020-01-01'),  label: 'All Time' },
      'revenue-month': { start: getMonthStart(),         label: 'This Month' },
      'quoted-week':   { start: getWeekStart(),          label: 'This Week (Sun-Sat)' },
      'quoted-month':  { start: getMonthStart(),         label: 'This Month' },
      'bids-week':     { start: getWeekStart(),          label: 'This Week (Sun-Sat)' },
      'bids-month':    { start: getMonthStart(),         label: 'This Month' },
      'conv-month':    { start: getMonthStart(),         label: 'This Month' },
      'leads-week':    { start: getWeekStart(),          label: 'This Week (Sun-Sat)' },
    };

    const period = periodMap[type];
    if (!period) return;

    const stats = await notionStats.getAllAgentSalesStats(allAgents, period.start, new Date());

    // ─── Sales ──────────────────────────────────────────────────
    if (type.startsWith('sales-')) {
      const embed = buildSalesEmbed(stats,
        '\u{1F4CA} SALES LEADERBOARD \u{1F4CA}', 0xf39c12, period.label);
      return interaction.editReply({ embeds: [embed] });
    }

    // ─── Revenue Sold ───────────────────────────────────────────
    if (type === 'revenue-month') {
      stats.sort((a, b) => b.revenue - a.revenue);
      const embed = buildRankedEmbed(stats,
        '\u{1F4B0} REVENUE SOLD LEADERBOARD \u{1F4B0}', 0x2ecc71, period.label,
        a => `**${formatMoney(a.revenue)}** sold | ${a.sales} sales`
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ─── Revenue Quoted ─────────────────────────────────────────
    if (type.startsWith('quoted-')) {
      stats.sort((a, b) => b.revenueQuoted - a.revenueQuoted);
      const embed = buildRankedEmbed(stats,
        '\u{1F4DD} REVENUE QUOTED LEADERBOARD \u{1F4DD}', 0x9b59b6, period.label,
        a => `**${formatMoney(a.revenueQuoted)}** quoted | ${a.bids} bids sent`
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ─── Bids Sent ──────────────────────────────────────────────
    if (type.startsWith('bids-')) {
      stats.sort((a, b) => b.bids - a.bids || b.revenueQuoted - a.revenueQuoted);
      const embed = buildRankedEmbed(stats,
        '\u{1F4E8} BIDS SENT LEADERBOARD \u{1F4E8}', 0xe67e22, period.label,
        a => `**${a.bids}** bids | ${formatMoney(a.revenueQuoted)} quoted | ${formatPercent(a.bidRate)} bid rate`
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ─── Conversion Rate ────────────────────────────────────────
    if (type === 'conv-month') {
      stats.sort((a, b) => {
        if (a.leadsTaken === 0 && b.leadsTaken === 0) return 0;
        if (a.leadsTaken === 0) return 1;
        if (b.leadsTaken === 0) return -1;
        return b.conversionRate - a.conversionRate;
      });
      const embed = buildRankedEmbed(stats,
        '\u{1F3AF} CONVERSION RATE LEADERBOARD \u{1F3AF}', 0xe74c3c, period.label,
        a => `**${formatPercent(a.conversionRate)}** conv | ${a.sales}/${a.leadsTaken} closed | ${formatMoney(a.revenue)}`
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ─── Leads Taken ────────────────────────────────────────────
    if (type === 'leads-week') {
      stats.sort((a, b) => b.leadsTaken - a.leadsTaken);
      const embed = buildRankedEmbed(stats,
        '\u{1F4CB} LEADS TAKEN LEADERBOARD \u{1F4CB}', 0x1abc9c, period.label,
        a => `**${a.leadsTaken}** leads | ${a.bids} bids sent | ${a.sales} sales`
      );
      return interaction.editReply({ embeds: [embed] });
    }
  },
};

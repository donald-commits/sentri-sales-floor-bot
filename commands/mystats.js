const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { findByDiscordId } = require('../utils/agent-store');
const quoStats = require('../services/quo-stats');
const notionStats = require('../services/notion-stats');
const { formatTime, formatMoney, formatPercent, getWeekStart, getMonthStart } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mystats')
    .setDescription('Check stats for yourself or another agent')
    .addUserOption(option =>
      option.setName('agent')
        .setDescription('Check another agent\'s stats (leave blank for your own)')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('agent') || interaction.user;
    const agent = findByDiscordId(targetUser.id);
    if (!agent) {
      return interaction.editReply(targetUser.id === interaction.user.id
        ? 'You are not registered as a sales agent. Ask an admin to run `/add-agent`.'
        : `${targetUser.displayName} is not registered as a sales agent.`);
    }

    const now = new Date();
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();

    // Single Notion query — compute all periods from one result set
    const allStats = await notionStats.getAgentStatsAllPeriods(agent.notionUserId, weekStart, monthStart);

    // Quo call stats (only if agent has Quo ID)
    let calls = { calls: 0, talkTimeMinutes: 0 };
    if (agent.quoUserId) {
      try {
        const callResults = await quoStats.getAgentCallStats([agent]);
        calls = callResults[0] || calls;
      } catch (e) {
        // Quo failed, show stats without calls
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`\u{1F4CA} Stats — ${agent.name}`);

    if (agent.quoUserId) {
      embed.addFields({
        name: '\u{1F4DE} Today',
        value: `**${calls.calls}**/50 calls | **${formatTime(calls.talkTimeMinutes)}**/2h talk time`,
        inline: false,
      });
    }

    const w = allStats.week;
    embed.addFields({
      name: '\u{1F4C5} This Week',
      value: [
        `**${w.sales}** sales | ${formatMoney(w.revenue)} sold | ${formatPercent(w.conversionRate)} conv`,
        `**${w.bids}** bids sent | ${formatMoney(w.revenueQuoted)} quoted`,
        `${w.leadsTaken} leads taken`,
      ].join('\n'),
      inline: false,
    });

    const m = allStats.month;
    embed.addFields({
      name: '\u{1F4C6} This Month',
      value: [
        `**${m.sales}** sales | ${formatMoney(m.revenue)} sold | ${formatPercent(m.conversionRate)} conv`,
        `**${m.bids}** bids sent | ${formatMoney(m.revenueQuoted)} quoted`,
        `${m.leadsTaken} leads taken`,
      ].join('\n'),
      inline: false,
    });

    const a = allStats.allTime;
    embed.addFields({
      name: '\u{1F4CA} All Time',
      value: [
        `**${a.sales}** sales | ${formatMoney(a.revenue)} sold | ${formatPercent(a.conversionRate)} conv`,
        `**${a.bids}** bids sent | ${formatMoney(a.revenueQuoted)} quoted`,
        `${a.leadsTaken} leads taken`,
      ].join('\n'),
      inline: false,
    });

    embed.setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  },
};

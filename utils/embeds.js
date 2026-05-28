const { EmbedBuilder } = require('discord.js');
const { formatTime, formatMoney, formatPercent, progressEmoji, rankEmoji } = require('./formatters');

/**
 * Build a sale announcement embed.
 */
function saleEmbed({ agentName, revenue, weekSales, weekRevenue, monthSales, monthRevenue, clientName, services }) {
  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('\u{1F514} SALE CLOSED! \u{1F514}')
    .setDescription(`\u{1F3C6} **${agentName}** just closed a deal!`)
    .addFields(
      { name: '\u{1F4B0} Revenue', value: formatMoney(revenue), inline: true },
      { name: '\u{1F4CA} Week', value: `${weekSales} sales | ${formatMoney(weekRevenue)}`, inline: true },
      { name: '\u{1F4C8} Month', value: `${monthSales} sales | ${formatMoney(monthRevenue)}`, inline: true },
    )
    .setTimestamp();

  if (clientName) {
    embed.setFooter({ text: `Client: ${clientName} | ${services.join(', ')}` });
  }

  return embed;
}

/**
 * Build a milestone embed.
 */
function milestoneEmbed(agentName, milestoneMessage) {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle('\u{1F31F} MILESTONE UNLOCKED \u{1F31F}')
    .setDescription(`**${agentName}** — ${milestoneMessage}`)
    .setTimestamp();
}

/**
 * Build a call/talk time leaderboard embed.
 * @param {Array} stats - Sorted array of agent stats
 * @param {string} title - Embed title (e.g., "MIDDAY CALL CHECK")
 */
function callLeaderboardEmbed(stats, title) {
  const lines = stats.map((agent, i) => {
    const emoji = progressEmoji(Math.min(agent.callProgress, agent.talkTimeProgress));
    const mention = agent.discordId ? `<@${agent.discordId}>` : agent.name;
    return `${emoji} ${mention} — **${agent.calls}** calls | **${formatTime(agent.talkTimeMinutes)}** talk time`;
  });

  const behindAgents = stats.filter(a => a.callProgress < 0.4 || a.talkTimeProgress < 0.4);
  let footer = '';
  if (behindAgents.length > 0) {
    const mentions = behindAgents
      .map(a => a.discordId ? `<@${a.discordId}>` : a.name)
      .join(' ');
    footer = `\n\n${mentions} — You're behind pace. Time to dial! \u{1F4F1}`;
  }

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`\u{1F4DE} ${title} \u{1F4DE}`)
    .setDescription(lines.join('\n') + footer)
    .addFields(
      { name: 'Target', value: `${stats[0]?.callTarget || 50} calls | ${formatTime(stats[0]?.talkTimeTarget || 120)} talk time`, inline: false },
    )
    .setTimestamp();
}

/**
 * Build a weekly sales leaderboard embed.
 */
function salesLeaderboardEmbed(stats, weekLabel) {
  const lines = stats.map((agent, i) => {
    const rank = rankEmoji(i);
    const mention = agent.discordId ? `<@${agent.discordId}>` : agent.name;
    return `${rank} ${mention} — **${agent.sales}** sales | ${formatPercent(agent.conversionRate)} conv | ${formatMoney(agent.revenue)}`;
  });

  const topCloser = stats.reduce((a, b) => a.conversionRate > b.conversionRate ? a : b, stats[0]);
  const topRevenue = stats.reduce((a, b) => a.revenue > b.revenue ? a : b, stats[0]);

  let footer = '';
  if (topCloser && topRevenue) {
    footer = `\n\nTop closer: **${topCloser.name}** (${formatPercent(topCloser.conversionRate)}) \u{1F3AF}\nTop revenue: **${topRevenue.name}** (${formatMoney(topRevenue.revenue)}) \u{1F4B0}`;
  }

  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`\u{1F4CA} WEEKLY SALES LEADERBOARD \u{1F4CA}`)
    .setDescription(lines.join('\n') + footer)
    .setFooter({ text: weekLabel })
    .setTimestamp();
}

/**
 * Build an accountability DM embed.
 */
function accountabilityDmEmbed({ name, calls, talkTimeMinutes, callTarget, talkTimeTarget }) {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('\u{1F4CB} Accountability Check')
    .setDescription(
      `Hey **${name}**, you're at **${calls} calls** and **${formatTime(talkTimeMinutes)}** talk time right now.\n\n` +
      `Target is **${callTarget} calls** / **${formatTime(talkTimeTarget)}** by end of day.\n\n` +
      `You need to pick up the pace — let's get after it! \u{1F4AA}`
    )
    .setTimestamp();
}

module.exports = { saleEmbed, milestoneEmbed, callLeaderboardEmbed, salesLeaderboardEmbed, accountabilityDmEmbed };

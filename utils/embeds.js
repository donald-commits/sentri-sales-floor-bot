const { EmbedBuilder } = require('discord.js');
const { formatTime, formatMoney, formatPercent, progressEmoji, rankEmoji } = require('./formatters');

/**
 * Hype messages for sale announcements, randomly selected.
 */
const hypeMessages = [
  'LET\'S GOOOOO!',
  'MONEY MOVES!',
  'THAT\'S HOW IT\'S DONE!',
  'ABSOLUTE KILLER!',
  'PRINTING MONEY!',
  'BUILT DIFFERENT!',
  'CAN\'T BE STOPPED!',
  'ON A MISSION!',
  'GET THIS PERSON A RAISE!',
  'THE CLOSER!',
];

const newBuildHypeMessages = [
  'A WHOLE NEW HOME! THIS IS THE BIG LEAGUES!',
  'NEW BUILD ALERT! WE\'RE BUILDING HOUSES OUT HERE!',
  'BRAND NEW HOME SOLD! THIS IS WHAT WE DO!',
  'NEW CONSTRUCTION BABY! THE BAG IS SECURED!',
  'A FULL NEW HOME BUILD?! ABSOLUTELY LEGENDARY!',
];

/**
 * Build a sale announcement embed.
 */
function saleEmbed({ agentName, revenue, weekSales, weekRevenue, monthSales, monthRevenue, clientName, services }) {
  const isNewBuild = services.some(s =>
    s.toLowerCase().includes('new home') ||
    s.toLowerCase().includes('new build') ||
    s.toLowerCase().includes('new construction') ||
    s.toLowerCase().includes('full build')
  );

  const color = isNewBuild ? 0xffd700 : 0x00ff88;
  const title = isNewBuild
    ? '\u{1F3E0}\u{1F525} NEW HOME BUILD SOLD! \u{1F525}\u{1F3E0}'
    : '\u{1F514}\u{1F4B0} SALE CLOSED! \u{1F4B0}\u{1F514}';

  const hypePool = isNewBuild ? newBuildHypeMessages : hypeMessages;
  const hype = hypePool[Math.floor(Math.random() * hypePool.length)];

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(
      `\u{1F3C6} **${agentName}** just closed a deal!\n\n` +
      `\u{1F4B0} **${formatMoney(revenue)}** revenue\n\n` +
      `**${hype}**`
    )
    .addFields(
      { name: '\u{1F4CA} This Week', value: `**${weekSales}** sales | ${formatMoney(weekRevenue)}`, inline: true },
      { name: '\u{1F4C8} This Month', value: `**${monthSales}** sales | ${formatMoney(monthRevenue)}`, inline: true },
    )
    .setTimestamp();

  if (clientName) {
    const serviceStr = services.length > 0 ? ` | ${services.join(', ')}` : '';
    embed.setFooter({ text: `Client: ${clientName}${serviceStr}` });
  }

  return embed;
}

/**
 * Build a milestone embed.
 * @param {string} type - 'regular' or 'homeBuild'
 */
function milestoneEmbed(agentName, milestoneMessage, type = 'regular') {
  if (type === 'homeBuild') {
    return new EmbedBuilder()
      .setColor(0xff4500)
      .setTitle('\u{1F3D7}\uFE0F\u{1F525}\u{1F451} HOME BUILD MILESTONE \u{1F451}\u{1F525}\u{1F3D7}\uFE0F')
      .setDescription(
        `\u{1F3C6} **${agentName}** \u{1F3C6}\n\n` +
        `**${milestoneMessage}**\n\n` +
        `\u{1F3E0} Building homes. Building wealth. Building legacy. \u{1F3E0}`
      )
      .setTimestamp();
  }

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
    return `${rank} ${mention} — **${agent.sales}** sales | ${formatMoney(agent.revenue)}`;
  });

  const topRevenue = stats.reduce((a, b) => a.revenue > b.revenue ? a : b, stats[0]);

  let footer = '';
  if (topRevenue) {
    footer = `\n\nTop revenue: **${topRevenue.name}** (${formatMoney(topRevenue.revenue)}) \u{1F4B0}`;
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

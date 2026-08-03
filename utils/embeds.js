const { EmbedBuilder } = require('discord.js');
const { formatTime, formatMoney, formatPercent, progressEmoji, rankEmoji } = require('./formatters');

/**
 * Hype messages for sale announcements, randomly selected.
 * 100 messages so agents see a repeat roughly 1 in 100 sales.
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
  'STRAIGHT UP DOMINANT!',
  'THE BAG HAS BEEN SECURED!',
  'ANOTHER ONE IN THE BOOKS!',
  'RING THE BELL!',
  'THE HOT STREAK CONTINUES!',
  'COLD BLOODED CLOSER!',
  'THEY NEVER STOOD A CHANCE!',
  'PURE SALES POWER!',
  'THAT PHONE IS ON FIRE!',
  'SOMEBODY COOL THIS CLOSER DOWN!',
  'CHA-CHING!',
  'DEAL. DONE. NEXT.',
  'UNSTOPPABLE FORCE!',
  'THE MOMENTUM IS REAL!',
  'CLOSING SEASON IS OPEN!',
  'THAT\'S A PRO RIGHT THERE!',
  'SMOOTH LIKE BUTTER!',
  'LIGHTS OUT PERFORMANCE!',
  'THE STANDARD HAS BEEN SET!',
  'WATCH THE THRONE!',
  'KEEP THAT FIRE BURNING!',
  'NOTHING BUT NET!',
  'BOOM! ANOTHER CLOSE!',
  'THE DEAL MACHINE STRIKES AGAIN!',
  'FLAWLESS EXECUTION!',
  'TOO SMOOTH! TOO CLEAN!',
  'THE HUSTLE IS PAYING OFF!',
  'GRINDING AND SHINING!',
  'CERTIFIED DEAL SLAYER!',
  'MAKING IT LOOK EASY!',
  'THE COMPETITION SHOULD BE SCARED!',
  'ICE IN THE VEINS!',
  'BORN TO CLOSE!',
  'ANOTHER DAY, ANOTHER DEAL!',
  'THE SCOREBOARD JUST MOVED!',
  'LEGENDS ARE BUILT LIKE THIS!',
  'FULL SEND, FULL CLOSE!',
  'THE PIPELINE DELIVERS!',
  'STACKING WINS!',
  'MOMENTUM MONSTER!',
  'THAT\'S CHAMPIONSHIP FORM!',
  'NO BRAKES ON THIS TRAIN!',
  'SIGNED, SEALED, DELIVERED!',
  'THE CLOSER HAS ENTERED THE CHAT!',
  'PAY DAY LOADING...',
  'ELITE LEVEL STUFF!',
  'THE GRIND NEVER LIES!',
  'BIG MOVES ONLY!',
  'THAT\'S HOW CHAMPIONS EAT!',
  'SALES ROYALTY!',
  'ABSOLUTE MASTERCLASS!',
  'THE DOTTED LINE HAS BEEN SIGNED!',
  'HEAVYWEIGHT CLOSER!',
  'QUOTA WHO? NEVER HEARD OF IT!',
  'THE HOT HAND STAYS HOT!',
  'WINNING IS A HABIT!',
  'TAKING NAMES AND CLOSING DEALS!',
  'THE REVENUE TRAIN KEEPS ROLLING!',
  'DIALED IN AND DANGEROUS!',
  'THE FLOOR IS SHAKING!',
  'CLINICAL. ABSOLUTELY CLINICAL.',
  'ANOTHER TROPHY FOR THE CASE!',
  'MONEY TALKS AND SO DO RESULTS!',
  'LOCKED IN AND LOADED!',
  'THE CLOSING BELL RINGS AGAIN!',
  'PRESSURE MAKES DIAMONDS!',
  'FEAR THE CLOSER!',
  'STONE COLD DEAL MAKER!',
  'THE NUMBERS DON\'T LIE!',
  'SKY IS THE LIMIT!',
  'HISTORY IN THE MAKING!',
  'KEEP FEEDING THE BEAST!',
  'THE MIDAS TOUCH!',
  'EVERYTHING THEY TOUCH TURNS TO GOLD!',
  'RELENTLESS!',
  'NO DEAL LEFT BEHIND!',
  'CLOSED LIKE A PRO!',
  'THE SALES GODS ARE SMILING!',
  'TEXTBOOK CLOSE!',
  'RAISING THE BAR AGAIN!',
  'NEXT LEVEL PERFORMANCE!',
  'THE STREAK LIVES ON!',
  'BUILT FOR THIS!',
  'MAXIMUM EFFORT, MAXIMUM RESULTS!',
  'ONE MORE FOR THE CULTURE!',
  'THE VAULT JUST GOT HEAVIER!',
  'DEALS FOR DAYS!',
  'CROWN THEM ALREADY!',
  'SIMPLY UNSTOPPABLE!',
  'THE MACHINE NEVER SLEEPS!',
];

const newBuildHypeMessages = [
  'A WHOLE NEW HOME! THIS IS THE BIG LEAGUES!',
  'NEW BUILD ALERT! WE\'RE BUILDING HOUSES OUT HERE!',
  'BRAND NEW HOME SOLD! THIS IS WHAT WE DO!',
  'NEW CONSTRUCTION BABY! THE BAG IS SECURED!',
  'A FULL NEW HOME BUILD?! ABSOLUTELY LEGENDARY!',
  'FROM DIRT TO DREAM HOME! MASSIVE CLOSE!',
  'THEY JUST SOLD AN ENTIRE HOUSE! LET THAT SINK IN!',
  'GROUND-UP GREATNESS! NEW BUILD SOLD!',
  'BLUEPRINT TO BANK ACCOUNT! HUGE!',
  'A WHOLE HOUSE! SOMEBODY CHECK THE SCOREBOARD!',
  'FOUNDATIONS OF A LEGEND! NEW BUILD CLOSED!',
  'THE BIG FISH! A FULL HOME BUILD!',
  'THIS IS THE DEAL EVERYONE DREAMS ABOUT!',
  'NEW HOME ENERGY! ABSOLUTELY MASSIVE!',
  'BUILDING DREAMS AND STACKING COMMAS!',
  'THE WHOLE ENCHILADA! NEW CONSTRUCTION SOLD!',
  'HAMMER DOWN! NEW BUILD ON THE BOARD!',
  'THEY DON\'T MAKE CLOSES BIGGER THAN THIS!',
  'A LITERAL HOUSE! CLOSED! DONE! WOW!',
  'LEGACY DEAL ALERT! NEW HOME BUILD!',
  'THE CROWN JEWEL OF CLOSES!',
  'WELCOME TO THE NEW BUILD CLUB!',
  'STICKS, BRICKS, AND COMMISSION CHECKS!',
  'MONUMENT-SIZED CLOSE! NEW HOME SOLD!',
  'TOP OF THE FOOD CHAIN! FULL BUILD CLOSED!',
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

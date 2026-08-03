const { EmbedBuilder } = require('discord.js');
const notionStats = require('../services/notion-stats');
const { getActiveAgents } = require('../utils/agent-store');
const { formatMoney, formatPercent } = require('../utils/formatters');

/**
 * END OF MONTH RECAP — the big one.
 * Covers the PREVIOUS month, ranked by revenue sold, shouts out the top 3.
 * Message pools are layered (title + intro + champion + silver + bronze + closer)
 * so the same combination basically never repeats.
 */

const TITLES = [
  '\u{1F3C6} {month} FINAL STANDINGS \u{1F3C6}',
  '\u{1F451} {month} IS IN THE BOOKS \u{1F451}',
  '\u{1F4A5} {month} FINAL NUMBERS \u{1F4A5}',
  '\u{1F525} {month} CHAMPIONSHIP RESULTS \u{1F525}',
  '\u{1F3C1} {month} — FINAL CALL \u{1F3C1}',
  '\u{2B50} {month} HALL OF FAME \u{2B50}',
  '\u{1F4B0} {month} MONEY BOARD — FINAL \u{1F4B0}',
  '\u{1F3AF} {month} FINAL SCOREBOARD \u{1F3AF}',
];

const INTROS = [
  'The month is closed. The numbers are locked. Here\'s who showed up when it mattered.',
  'Another month in the books — and the board tells the whole story.',
  'The dust has settled. The deals are counted. These are the final standings.',
  'Month over. No more dials, no more bids — just results. Here\'s how it ended.',
  'The final bell rang. Here\'s who walked away with the month.',
  'Books are closed. Let\'s talk about who dominated.',
  'Every call, every bid, every close — it all came down to this board.',
  'The scoreboard doesn\'t care about excuses. Here\'s what it says.',
  'One month. One board. No asterisks. These are the numbers.',
  'The results are in and the top of this board EARNED it.',
  'A full month of grinding comes down to this. Final standings below.',
  'The month tested everybody. Here\'s who passed with flying colors.',
];

const CHAMPION_LINES = [
  '{name} IS YOUR CHAMPION! {revenue} SOLD! ABSOLUTE DOMINANCE!',
  'BOW DOWN — {name} took the month with {revenue}! UNTOUCHABLE!',
  '{name} ran away with it! {revenue} in revenue! A MASTERCLASS!',
  'THE CROWN GOES TO {name}! {revenue} sold! LEGENDARY MONTH!',
  '{name} left NO DOUBT — {revenue} on the board! CHAMPION!',
  'GIVE IT UP FOR {name}! {revenue} sold! THE FLOOR BELONGS TO THEM!',
  '{name} went SCORCHED EARTH this month — {revenue}! UNSTOPPABLE!',
  'NUMBER ONE AND IT WASN\'T CLOSE — {name} with {revenue}!',
  '{name} just put up {revenue} in a single month! FRAMED AND HUNG IN THE HALL!',
  'THE MONTH BELONGS TO {name}! {revenue} SOLD! PURE DOMINANCE!',
  '{name} closed {revenue} and made it look EASY! YOUR CHAMPION!',
  'HEAVY IS THE CROWN and {name} wears it — {revenue} sold!',
  '{name} DEMOLISHED the board with {revenue}! TAKE A BOW!',
  'A {revenue} MONTH?! {name} IS BUILT DIFFERENT! CHAMPION!',
  'ALL HAIL {name} — {revenue} in closed business! THE STANDARD!',
];

const SILVER_LINES = [
  '{name} pushed the champ to the wire with {revenue} sold. HUGE month.',
  'Right on their heels — {name} with {revenue}! The rivalry is REAL.',
  '{name} stacked {revenue} this month. Silver now, hungry for gold.',
  'A monster month from {name}: {revenue} on the board!',
  '{name} brought the heat with {revenue} sold. Watch out next month.',
  'Second place, first-class numbers — {name} with {revenue}!',
  '{name} closed {revenue} and is knocking on the door. LOUD.',
  'The chase is ON — {name} finished at {revenue}!',
  '{name} put up {revenue}. One spot away. Next month is war.',
  'Big respect to {name} — {revenue} sold and climbing fast.',
];

const BRONZE_LINES = [
  '{name} rounds out the podium with {revenue} sold. Strong month!',
  'On the podium — {name} with {revenue}! The top 3 is no joke.',
  '{name} secured the bronze with {revenue} in revenue!',
  '{name} fought onto the podium: {revenue} sold. Momentum building.',
  'Podium finish for {name} — {revenue} on the board!',
  '{name} closed {revenue} this month. Top 3 and trending up.',
  'Bronze goes to {name} with {revenue}. The gap is closing.',
  '{name} landed at {revenue} — a podium month. Keep pushing.',
  'Solid podium spot for {name}: {revenue} in closed deals!',
  '{name} takes third with {revenue}. The board better watch out.',
];

const CLOSERS = [
  'New month. Clean slate. The board resets but the hunger doesn\'t. GO GET IT.',
  'The scoreboard is back to zero. Who\'s taking the crown this month?',
  'That month is history. This month is opportunity. ATTACK IT.',
  'Records are made to be broken. Someone break these this month.',
  'Fresh board. Fresh chances. Same mission: SELL.',
  'The podium is up for grabs again. Come take it.',
  'Champions defend. Contenders rise. Let\'s see who wants it more.',
  'Everything resets today — except the standard. EXCEED IT.',
  'Next month\'s champion is reading this right now. Prove it.',
  'The crown is heavy but it fits anyone willing to work. Who\'s next?',
  'New month starts NOW. First call sets the tone. MAKE IT.',
  'Study the board. Beat the board. That\'s the assignment.',
];

function pick(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function fill(template, agent) {
  const mention = agent.discordId ? `<@${agent.discordId}>` : agent.name;
  return template
    .replace('{name}', mention)
    .replace('{revenue}', `**${formatMoney(agent.revenue)}**`);
}

function statLine(agent) {
  return `\u{1F528} **${formatMoney(agent.tradesRevenue)}** trades | \u{1F3E0} **${formatMoney(agent.homeBuildRevenue)}** home builds | **${agent.sales}** sales | ${formatPercent(agent.conversionRate)} conv | ${agent.leadsTaken} leads taken`;
}

/**
 * Post the end-of-month recap for the PREVIOUS month.
 * Runs at 9 AM MDT on the first business day of the new month.
 */
async function runMonthlyRecap(client, channelId) {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const agents = getActiveAgents();
    const stats = await notionStats.getAllAgentSalesStats(agents, monthStart, monthEnd);

    if (stats.length === 0) return;

    // Rank by revenue sold — the metric that matters most
    stats.sort((a, b) => b.revenue - a.revenue || b.sales - a.sales);

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const [first, second, third] = stats;

    let body = pick(INTROS) + '\n';

    if (first) {
      body += `\n\u{1F947} **CHAMPION** — ${first.discordId ? `<@${first.discordId}>` : first.name}\n`;
      body += `${statLine(first)}\n`;
      body += `${fill(pick(CHAMPION_LINES), first)}\n`;
    }
    if (second) {
      body += `\n\u{1F948} ${second.discordId ? `<@${second.discordId}>` : second.name}\n`;
      body += `${statLine(second)}\n`;
      body += `${fill(pick(SILVER_LINES), second)}\n`;
    }
    if (third) {
      body += `\n\u{1F949} ${third.discordId ? `<@${third.discordId}>` : third.name}\n`;
      body += `${statLine(third)}\n`;
      body += `${fill(pick(BRONZE_LINES), third)}\n`;
    }

    const rest = stats.slice(3);
    if (rest.length > 0) {
      body += '\n\u{1F4CA} **FULL STANDINGS**\n';
      body += rest.map((agent, i) => {
        const mention = agent.discordId ? `<@${agent.discordId}>` : agent.name;
        return `#${i + 4} ${mention} — ${statLine(agent)}`;
      }).join('\n') + '\n';
    }

    body += `\n${pick(CLOSERS)}`;

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(pick(TITLES).replace('{month}', monthLabel.toUpperCase()))
      .setDescription(body)
      .setFooter({ text: `${monthLabel} — final | ranked by revenue sold` })
      .setTimestamp();

    await channel.send({ content: '@everyone', embeds: [embed] });
    console.log(`[MonthlyRecap] Posted ${monthLabel} recap, ${stats.length} agents`);
  } catch (err) {
    console.error('[MonthlyRecap] Error:', err.message);
  }
}

/**
 * True only on the first business day (Mon-Fri) of the month in the given timezone.
 * The cron fires on days 1-3; this guard makes sure only the first weekday posts.
 */
function isFirstBusinessDay(tz = 'America/Denver') {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  const [y, m, d] = todayStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0 || dow === 6) return false;
  for (let day = 1; day < d; day++) {
    const w = new Date(y, m - 1, day).getDay();
    if (w !== 0 && w !== 6) return false; // an earlier weekday already was the first business day
  }
  return true;
}

module.exports = { runMonthlyRecap, isFirstBusinessDay };

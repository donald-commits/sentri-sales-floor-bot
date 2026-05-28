/**
 * Posts a test weekly sales leaderboard for last week (Sun May 18 - Sat May 24).
 */
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const notionStats = require('./services/notion-stats');
const { getActiveAgents } = require('./utils/agent-store');
const { salesLeaderboardEmbed } = require('./utils/embeds');

const IDS_FILE = path.join(__dirname, 'data/channel-ids.json');
const channelIds = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log('Fetching last week stats from Notion...');

  // Last week: Sunday May 18 - Saturday May 24
  const lastWeekStart = new Date('2026-05-18T00:00:00');
  const lastWeekEnd = new Date('2026-05-24T23:59:59');

  const agents = getActiveAgents();
  console.log(`Querying stats for ${agents.length} agents...`);

  const stats = await notionStats.getAllAgentSalesStats(agents, lastWeekStart, lastWeekEnd);

  console.log('Stats retrieved:');
  stats.forEach(s => console.log(`  ${s.name}: ${s.sales} sales, $${s.revenue}, ${Math.round(s.conversionRate*100)}% conv, ${s.leadsTaken} leads taken`));

  const channel = await client.channels.fetch(channelIds['leaderboards']);
  const weekLabel = 'Week of May 18 - May 24, 2026';
  const embed = salesLeaderboardEmbed(stats, weekLabel);
  await channel.send({ embeds: [embed] });

  console.log('Posted test leaderboard to #leaderboards');
  client.destroy();
});

client.login(config.discord.token);

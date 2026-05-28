const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { Cron } = require('croner');
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { recordCall } = require('./services/call-store');

// ─── Load channel IDs ───────────────────────────────────────────────
const IDS_FILE = path.join(__dirname, 'data/channel-ids.json');
let channelIds = {};
try {
  channelIds = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
} catch {
  console.warn('[Bot] No channel-ids.json found. Run `npm run setup` first.');
}

// ─── Express server for Quo webhooks ────────────────────────────────
const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Log ANY webhook for debugging
app.post('/webhooks/quo/debug', (req, res) => {
  console.log('[Debug Webhook] FULL PAYLOAD:', JSON.stringify(req.body).substring(0, 2000));
  res.status(200).json({ received: true });
});

// Quo sends call.completed events here
app.post('/webhooks/quo/call', (req, res) => {
  const event = req.body;

  // Log the FULL data.object payload to see all values
  console.log('[Webhook] FULL data.object:', JSON.stringify(event?.data?.object));

  const callData = event?.data?.object || event?.data || event;

  // Log the actual call data we're extracting
  const answeredAt = callData.answeredAt ? new Date(callData.answeredAt) : null;
  const completedAt = callData.completedAt ? new Date(callData.completedAt) : null;
  const calcDuration = answeredAt && completedAt ? Math.round((completedAt - answeredAt) / 1000) : 0;
  console.log('[Webhook] Extracted:', JSON.stringify({ id: callData.id, userId: callData.userId, direction: callData.direction, status: callData.status, answeredAt: callData.answeredAt, completedAt: callData.completedAt, calcDuration }));

  if (callData?.id) {
    const isNew = recordCall(callData);
    if (isNew) {
      const userId = callData.userId || callData.answeredBy || callData.initiatedBy || 'unknown';
      console.log(`[Webhook] Call recorded: ${callData.id} | user: ${userId} | ${callData.duration || 0}s | ${callData.direction}`);
    }
  }

  res.status(200).json({ received: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[Webhook] Listening on port ${PORT}`);
});

// ─── Create Discord client ──────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ─── Load slash commands ────────────────────────────────────────────
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// ─── Register commands on ready ─────────────────────────────────────
client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  console.log(`[Bot] Connected to ${client.guilds.cache.size} guild(s)`);

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  const commandData = [...client.commands.values()].map(c => c.data.toJSON());

  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, config.discord.guildId),
      { body: commandData },
    );
    console.log(`[Bot] Registered ${commandData.length} slash commands`);
  } catch (err) {
    console.error('[Bot] Failed to register commands:', err.message);
  }

  // ─── Start schedulers ───────────────────────────────────────────
  startSchedulers();
  console.log('[Bot] Schedulers started. Sales floor is LIVE.');
});

// ─── Handle interactions ────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[Bot] Command error (${interaction.commandName}):`, err.message, err.stack);
    try {
      const reply = { content: 'Something went wrong running that command.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (replyErr) {
      // Interaction already expired or acknowledged, ignore
    }
  }
});

// ─── Schedulers ─────────────────────────────────────────────────────
function startSchedulers() {
  const { pollForSales } = require('./schedulers/sale-poller');
  const { runNoonCheck } = require('./schedulers/noon-leaderboard');
  const { runEodCheck } = require('./schedulers/eod-leaderboard');
  const { runDailySalesBoard } = require('./schedulers/daily-sales-board');
  const { runMonthlyLeaderboard } = require('./schedulers/monthly-leaderboard');
  const { runDailyRecap } = require('./schedulers/daily-recap');

  const tz = config.timezone;

  // Sale poller — every 3 minutes
  setInterval(() => {
    pollForSales(client, channelIds['sales-announcements']);
  }, config.polling.salesCheck);

  // Noon call check — 12:00 PM CT, weekdays
  new Cron('0 12 * * 1-5', { timezone: tz }, () => {
    console.log('[Scheduler] Running noon call check...');
    runNoonCheck(client, channelIds['accountability']);
  });

  // EOD call check — 5:00 PM CT, weekdays
  new Cron('0 17 * * 1-5', { timezone: tz }, () => {
    console.log('[Scheduler] Running EOD call check...');
    runEodCheck(client, channelIds['accountability']);
  });

  // Daily (weekday) sales leaderboard — 6:00 PM CT, weekdays
  new Cron('0 18 * * 1-5', { timezone: tz }, () => {
    console.log('[Scheduler] Running daily sales leaderboard...');
    runDailySalesBoard(client, channelIds['leaderboards']);
  });

  // Monthly leaderboard — Monday 8:00 AM CT
  new Cron('0 8 * * 1', { timezone: tz }, () => {
    console.log('[Scheduler] Running monthly leaderboard...');
    runMonthlyLeaderboard(client, channelIds['leaderboards']);
  });

  // Daily recap — 5:00 PM MST weekdays
  new Cron('0 17 * * 1-5', { timezone: 'America/Denver' }, () => {
    console.log('[Scheduler] Running daily recap...');
    runDailyRecap(client, channelIds['wins-and-goals']);
  });

  console.log('[Scheduler] Cron jobs registered:');
  console.log('  - Sale poller: every 3 min');
  console.log('  - Noon call check: 12:00 PM CT weekdays');
  console.log('  - EOD call check: 5:00 PM CT weekdays');
  console.log('  - Weekly sales board: 6:00 PM CT weekdays');
  console.log('  - Monthly leaderboard: Monday 8:00 AM CT');
  console.log('  - Daily recap: 5:00 PM MST weekdays');
}

// ─── Error handling ─────────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('[Bot] Unhandled rejection:', err.message || err);
});

client.on('error', (err) => {
  console.error('[Bot] Client error:', err.message);
});

// ─── Login ──────────────────────────────────────────────────────────
client.login(config.discord.token);

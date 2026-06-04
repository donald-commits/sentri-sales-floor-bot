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

// Debug endpoint: return current call stats
app.get('/debug/call-stats', (req, res) => {
  const { getTodayStats, loadCallLog } = require('./services/call-store');
  const { getSentriAgents } = require('./utils/agent-store');
  const stats = getTodayStats();
  const agents = getSentriAgents();
  const log = loadCallLog();

  const result = agents
    .filter(a => a.quoUserId)
    .map(a => {
      const s = stats.get(a.quoUserId) || { calls: 0, talkTimeSeconds: 0 };
      return { name: a.name, calls: s.calls, talkTimeMinutes: Math.round(s.talkTimeSeconds / 60) };
    })
    .sort((a, b) => b.calls - a.calls);

  res.json({ date: log.date, totalCallsInLog: log.calls.length, agents: result });
});

// Reset call log (admin use only)
app.post('/debug/reset-calls', (req, res) => {
  const { saveCallLog } = require('./services/call-store');
  const today = new Date().toISOString().split('T')[0];
  saveCallLog({ date: today, calls: [] });
  console.log('[Debug] Call log reset');
  res.json({ reset: true, date: today });
});

// Log ANY webhook for debugging
app.post('/webhooks/quo/debug', (req, res) => {
  console.log('[Debug Webhook] FULL PAYLOAD:', JSON.stringify(req.body).substring(0, 2000));
  res.status(200).json({ received: true });
});

// Quo webhook handler — accepts call.completed, call.recording.completed, call.ringing, etc.
app.post('/webhooks/quo/call', (req, res) => {
  const event = req.body;
  const eventType = event?.type || 'unknown';
  const callData = event?.data?.object || event?.data || event;

  if (callData?.id) {
    const userId = callData.userId || callData.answeredBy || callData.initiatedBy || 'unknown';
    const createdAt = callData.createdAt ? new Date(callData.createdAt) : null;
    const completedAt = callData.completedAt ? new Date(callData.completedAt) : null;
    const dur = createdAt && completedAt ? Math.round((completedAt - createdAt) / 1000) : 0;

    const isNew = recordCall(callData);
    console.log(`[Webhook] ${eventType} | ${callData.id} | user: ${userId} | ${dur}s | ${callData.direction} | ${isNew ? 'NEW' : 'DUP'}`);
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
  const { syncSalesTracker } = require('./schedulers/sheet-sync');
  const { runBidCheck } = require('./schedulers/bid-check');

  const tz = config.timezone;

  // Sale poller — every 3 minutes
  setInterval(() => {
    pollForSales(client, channelIds['sales-announcements']);
  }, config.polling.salesCheck);

  // ── DISABLED until call data is verified accurate ──
  // Noon call check — 12:00 PM CT, weekdays
  // new Cron('0 12 * * 1-5', { timezone: tz }, () => {
  //   console.log('[Scheduler] Running noon call check...');
  //   runNoonCheck(client, channelIds['accountability']);
  // });

  // EOD call check — 5:00 PM CT, weekdays
  // new Cron('0 17 * * 1-5', { timezone: tz }, () => {
  //   console.log('[Scheduler] Running EOD call check...');
  //   runEodCheck(client, channelIds['accountability']);
  // });

  // Daily recap — 5:00 PM MST weekdays
  // new Cron('0 17 * * 1-5', { timezone: 'America/Denver' }, () => {
  //   console.log('[Scheduler] Running daily recap...');
  //   runDailyRecap(client, channelIds['wins-and-goals']);
  // });
  // ── END DISABLED ──

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

  // Midday bid check — 12:00 PM MST, weekdays
  new Cron('0 12 * * 1-5', { timezone: 'America/Denver' }, () => {
    console.log('[Scheduler] Running midday bid check...');
    runBidCheck(client, channelIds['accountability'], 'MIDDAY BID CHECK');
  });

  // EOD bid check — 5:00 PM MST, weekdays
  new Cron('0 17 * * 1-5', { timezone: 'America/Denver' }, () => {
    console.log('[Scheduler] Running EOD bid check...');
    runBidCheck(client, channelIds['accountability'], 'END OF DAY BID CHECK');
  });

  // Sales tracker sheet sync — every hour, 7 AM to 8 PM CT
  new Cron('0 7-20 * * *', { timezone: tz }, () => {
    console.log('[Scheduler] Running sales tracker sheet sync...');
    syncSalesTracker().catch(err => console.error('[SheetSync] Error:', err.message));
  });

  // Also run once on startup (after 30s delay to let everything initialize)
  setTimeout(() => {
    console.log('[Scheduler] Running initial sales tracker sheet sync...');
    syncSalesTracker().catch(err => console.error('[SheetSync] Error:', err.message));
  }, 30000);

  // Fire EOD bid check now for verification (remove after confirmed)
  setTimeout(() => {
    console.log('[Scheduler] Firing one-time EOD bid check for verification...');
    runBidCheck(client, channelIds['accountability'], 'END OF DAY BID CHECK');
  }, 15000);

  console.log('[Scheduler] Cron jobs registered:');
  console.log('  - Sale poller: every 3 min');
  console.log('  - Noon call check: DISABLED');
  console.log('  - EOD call check: DISABLED');
  console.log('  - Weekly sales board: 6:00 PM CT weekdays');
  console.log('  - Monthly leaderboard: Monday 8:00 AM CT');
  console.log('  - Daily recap: DISABLED');
  console.log('  - Midday bid check: 12:00 PM MST weekdays');
  console.log('  - EOD bid check: 5:00 PM MST weekdays');
  console.log('  - Sheet sync: hourly 7AM-8PM CT + on startup');
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

// Debug: show raw call log entries grouped by userId
app.get('/debug/raw-calls', (req, res) => {
  const { loadCallLog } = require('./services/call-store');
  const log = loadCallLog();
  
  // Group by userId
  const byUser = {};
  const unknownUsers = new Set();
  for (const c of log.calls) {
    const uid = c.userId || c.answeredBy || c.initiatedBy || 'unknown';
    if (!byUser[uid]) byUser[uid] = { calls: 0, totalDuration: 0 };
    byUser[uid].calls++;
    byUser[uid].totalDuration += c.duration || 0;
  }
  
  res.json({ date: log.date, totalCalls: log.calls.length, byUser, sampleCalls: log.calls.slice(-5) });
});

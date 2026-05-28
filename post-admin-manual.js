/**
 * Creates #admin-operations channel and posts the full operations manual.
 * Run once: node post-admin-manual.js
 */
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const IDS_FILE = path.join(__dirname, 'data/channel-ids.json');
const channelIds = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(config.discord.guildId);
  console.log('Connected to:', guild.name);

  // Create admin-only channel
  let channel = guild.channels.cache.find(c => c.name === 'admin-operations' && c.parentId === channelIds.category);
  if (!channel) {
    channel = await guild.channels.create({
      name: 'admin-operations',
      type: ChannelType.GuildText,
      parent: channelIds.category,
      topic: 'Bot operations manual, automations, and admin commands. Admin eyes only.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: channelIds.salesAgentRole, deny: [PermissionFlagsBits.ViewChannel] },
        { id: channelIds.salesLeadRole, deny: [PermissionFlagsBits.ViewChannel] },
      ],
    });
    console.log('Created #admin-operations:', channel.id);
  } else {
    console.log('Channel already exists:', channel.id);
  }

  // Save channel ID
  channelIds['admin-operations'] = channel.id;
  fs.writeFileSync(IDS_FILE, JSON.stringify(channelIds, null, 2));

  // Operations manual content
  const messages = [
    `# SALES FLOOR BOT — OPERATIONS MANUAL

This channel is **admin-only**. It contains everything you need to run, manage, and understand the Sales Floor bot.`,

    `## ARCHITECTURE OVERVIEW

**What this bot does:**
- Polls Quo (OpenPhone) every 10 min for call/talk time data per agent
- Polls Notion every 3 min for new sales (Status = "Sold")
- Posts leaderboards on a schedule (noon, 5pm, 6pm CT)
- DMs agents who are behind on calls/talk time
- Announces sales in real-time with revenue + weekly/monthly stats
- Tracks milestones (1st sale, 10th sale, etc.) and shouts them out

**Data sources:**
- **Quo (OpenPhone)** — Call counts, talk time, per-user via userId field
- **Notion Leads DB** — Sales, revenue, conversion rates, agent assignment

**Tech stack:** Node.js, discord.js v14, croner (scheduling), axios (API calls)`,

    `## AUTOMATED SCHEDULES (All times CT, weekdays only)

| Time | What | Channel |
|------|------|---------|
| Every 3 min | Poll Notion for new sales, announce them | #sales-announcements |
| 12:00 PM | Midday call/talk time leaderboard + DM laggards | #accountability |
| 5:00 PM | End-of-day final numbers + DM agents who missed | #accountability |
| 6:00 PM | Weekly sales leaderboard (sales, conv rate, revenue) | #leaderboards |`,

    `## ACCOUNTABILITY RULES

**Daily Targets (fireable metrics):**
- 50 outbound calls
- 2 hours (120 min) talk time

**DM Triggers:**
- At noon: Anyone below 40% of target gets a private DM
- At 5 PM: Anyone who missed target gets an EOD DM

**Public Call-out:**
- At noon & 5 PM: Agents behind pace get @mentioned in #accountability

**Leaderboard Colors:**
- Green = 80%+ of target (on track)
- Yellow = 50-79% (needs to pick up)
- Red = Below 50% (severely behind)`,

    `## MILESTONES

Automatically announced in #sales-announcements when detected:

**Total Sales:** 1st, 5th, 10th, 25th, 50th, 100th
**Single Sale Revenue:** First $10K, $25K, $50K sale
**Weekly:** 5-sale week, 10-sale week

Milestones are tracked per-agent and only fire once. History saved in data/milestone-history.json.`,

    `## ADMIN COMMANDS

### /add-agent
Maps a new agent across all systems. Required fields:
- **user** — The Discord user to map
- **notion_id** — Their Notion user ID
- **quo_id** — Their Quo user ID
- **role** — "agent" or "admin"

### /remove-agent
Deactivates an agent from tracking (does not delete history).
- **user** — The Discord user to remove

### How to find IDs:
- **Notion User ID:** Settings > Members > click member > ID is in the URL
- **Quo User ID:** Pull via API or check Quo admin panel under team members
- **Discord User ID:** Right-click user > Copy User ID (Developer Mode must be on in Settings > Advanced)`,

    `## AGENT ONBOARDING CHECKLIST

**When a new agent joins:**
1. Have them join this Discord server
2. Assign them the **Sales Agent** role (Server Settings > Members)
3. Get their Quo user ID and Notion user ID
4. Run \`/add-agent\` with all three IDs
5. They now appear on leaderboards and get accountability DMs

**When an agent leaves:**
1. Run \`/remove-agent @user\`
2. Remove their Sales Agent role
3. (Optional) Kick from server`,

    `## FILE STRUCTURE

\`\`\`
scripts/discord-bot/
|-- index.js              # Main entry point
|-- config.js             # Env vars, targets, intervals
|-- setup-channels.js     # One-time channel creation
|-- commands/             # Slash commands (/mystats, /leaderboard, /add-agent, /remove-agent)
|-- schedulers/           # Timed jobs (noon check, EOD check, sales poller, daily board)
|-- services/             # API integrations (Quo stats, Notion stats, milestone tracker)
|-- utils/                # Embeds, formatters, agent store
|-- data/
    |-- agents.json       # Agent mapping (source of truth + live updated by /add-agent)
    |-- milestones.json   # Milestone definitions (edit to add new ones)
    |-- channel-ids.json  # Auto-generated channel IDs
    |-- milestone-history.json  # Which milestones have already fired
\`\`\``,

    `## RUNNING THE BOT

**Local (testing):**
\`\`\`
cd scripts/discord-bot
npm start
\`\`\`

**Production (Railway):**
Deployed as a separate Railway service. Runs 24/7.
Env vars set in Railway dashboard (DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, Sentri_Notion_API_Key, Quo_API-Key).

**If the bot crashes or needs restart:**
- Railway: Auto-restarts on crash. Check logs in Railway dashboard.
- Local: Just run \`npm start\` again.`,

    `## CONFIGURATION

All configurable values are in \`config.js\`:

| Setting | Current Value | What it controls |
|---------|--------------|------------------|
| targets.callsPerDay | 50 | Daily call target |
| targets.talkTimeMinutes | 120 | Daily talk time target (minutes) |
| accountability.noonWarningThreshold | 0.40 | Below 40% at noon = DM |
| accountability.noonCriticalThreshold | 0.25 | Below 25% at noon = public mention |
| polling.salesCheck | 3 min | How often to check for new sales |
| polling.callStats | 10 min | How often to refresh call data |
| timezone | America/Chicago | All schedule times in CT |

To change targets (e.g., raise to 60 calls/day), edit config.js and restart the bot.`,

    `## TROUBLESHOOTING

**Bot is online but not posting:**
- Check that agents have quoUserId and notionUserId filled in data/agents.json
- Verify API keys are valid in .env
- Check console logs for errors

**Slash commands not showing:**
- Commands register on bot startup. Restart the bot.
- Make sure you're in a channel the bot can see

**Agent not appearing on leaderboard:**
- Verify they were added via /add-agent with correct Quo + Notion IDs
- Check data/agents.json — make sure active: true

**DMs not sending:**
- Agent may have DMs disabled for server members
- Check console for "Could not DM" errors

**Sale not announcing:**
- Verify the lead's Status in Notion is exactly "Sold" (case-sensitive)
- Verify the Sales Agent field has a mapped user assigned
- Check that the sale happened after the bot started (it only catches new changes)

---
*Last updated: May 25, 2026*`
  ];

  // Post all messages
  for (const msg of messages) {
    await channel.send(msg);
    await new Promise(r => setTimeout(r, 750));
  }

  console.log(`Posted operations manual (${messages.length} messages)`);
  client.destroy();
});

client.login(config.discord.token);

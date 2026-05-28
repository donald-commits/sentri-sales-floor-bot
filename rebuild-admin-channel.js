/**
 * Deletes all messages in #admin-operations and reposts a clean, comprehensive manual.
 */
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const IDS_FILE = path.join(__dirname, 'data/channel-ids.json');
const channelIds = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const channel = await client.channels.fetch(channelIds['admin-operations']);
  console.log('Purging old messages...');

  // Delete all messages (bulk delete works for messages < 14 days old)
  let deleted;
  do {
    deleted = await channel.bulkDelete(100, true);
    if (deleted.size === 0) {
      // Try individual delete for older messages
      const remaining = await channel.messages.fetch({ limit: 50 });
      if (remaining.size === 0) break;
      for (const msg of remaining.values()) {
        await msg.delete();
        await new Promise(r => setTimeout(r, 500));
      }
      break;
    }
  } while (deleted.size > 0);

  console.log('Channel cleared. Posting comprehensive manual...');

  const messages = [
    // ═══════════════════════════════════════════════════════════════
    // HEADER
    // ═══════════════════════════════════════════════════════════════
    `# SENTRI HOMES SALES MANAGER — COMPLETE OPERATIONS MANUAL

This channel is **admin-only**. It contains everything needed to run, manage, troubleshoot, and understand the Sales Floor bot.

**Bot Name:** Sentri Homes Sales Manager
**Hosted on:** Railway (separate service)
**Status:** Active`,

    // ═══════════════════════════════════════════════════════════════
    // WHAT IT DOES
    // ═══════════════════════════════════════════════════════════════
    `## WHAT THE BOT DOES

The bot creates a virtual sales floor experience by:

1. **Real-time sale announcements** — Every 3 minutes, checks Notion for new sales. When one is found, announces it with revenue, weekly/monthly totals, and hype.

2. **Midday accountability check (12:00 PM CT)** — Posts a leaderboard of every agent's calls and talk time. Publicly @mentions anyone severely behind. DMs anyone below 40% of target.

3. **End-of-day check (5:00 PM CT)** — Posts final numbers. Shows who hit target vs who missed. DMs every agent who missed.

4. **Weekly sales leaderboard (6:00 PM CT weekdays)** — Shows sales, conversion rate, and revenue for the current week (Sunday-Saturday).

5. **Monthly leaderboard (Monday 8:00 AM CT)** — Shows the full current calendar month's sales stats.

6. **Milestone shoutouts** — Automatically detects and celebrates: first sale, 5th, 10th, 25th, 50th, 100th sale. First $10K, $25K, $50K deal. 5-sale week, 10-sale week.

7. **Slash commands** — Agents can check their own stats (/mystats), view leaderboards on demand (/leaderboard). Admins can add/remove agents (/add-agent, /remove-agent).`,

    // ═══════════════════════════════════════════════════════════════
    // DATA SOURCES - NOTION
    // ═══════════════════════════════════════════════════════════════
    `## DATA SOURCE: NOTION (Sales & Revenue)

**Database:** Sentri Leads DB
**Database ID:** \`2f518d01-e1b6-8002-b83a-e4022123e913\`

### What counts as a "Sale"?

A lead counts as a sale ONLY when BOTH are true:
- \`Status\` property = **"Sold"** (exact, case-sensitive)
- \`Initial Paid Date\` property **has a date value**

"Invoiced", "Final Sent", and "Final Paid" do NOT count as sales.

### Notion Properties the Bot Reads

| Property | Type | Purpose |
|----------|------|---------|
| \`Status\` | status | Must be "Sold" to count as a sale |
| \`Initial Paid Date\` | date | When the sale closed. Used for date-range filtering and real-time detection |
| \`Sales Agent\` | people | Which agent owns this lead. Matched by Notion User ID |
| \`Sales Agent Assigned Date\` | date | When the agent took the lead. Used for "leads taken" count |
| \`Total Amount\` | number | Revenue. Summed for revenue stats |
| \`Client Name\` | title | Shown in sale announcements |
| \`Services Requested\` | multi_select | Shown in sale announcements (e.g., Roofing, Siding) |

### How Sales Metrics Are Calculated

**Sales count:**
- Filter: Sales Agent = agent, Status = "Sold", Initial Paid Date within period
- Period can be: this week (Sun-Sat), this month (calendar), or all-time

**Revenue:**
- Sum of \`Total Amount\` for all sales in the period

**Leads taken:**
- Count of leads where \`Sales Agent Assigned Date\` falls within the period

**Conversion rate:**
- Formula: **sales / leads taken** (same period)
- Shown as weekly, monthly, and all-time

**Bid sent rate:**
- Leads with Status "Bid sent" or "Sold" that were assigned in the period / leads taken in the period`,

    // ═══════════════════════════════════════════════════════════════
    // DATA SOURCES - QUO
    // ═══════════════════════════════════════════════════════════════
    `## DATA SOURCE: QUO / OPENPHONE (Calls & Talk Time)

**API:** \`https://api.openphone.com/v1\`
**Endpoints used:** \`GET /v1/calls\`, \`GET /v1/users\`

### What counts as a "Call"?

A call is counted ONLY when ALL of these are true:
- \`direction\` = **"outgoing"** (inbound calls are ignored)
- \`status\` = **"completed"** (missed, abandoned, voicemail are ignored)

### Quo Fields Used Per Call

| Field | Purpose |
|-------|---------|
| \`direction\` | Must be "outgoing" to count |
| \`status\` | Must be "completed" to count |
| \`userId\` | Which Quo user made the call (primary identifier) |
| \`initiatedBy\` | Fallback if userId is empty |
| \`duration\` | Call length in seconds. Summed for talk time |
| \`createdAt\` | Timestamp for date filtering |

### How Call Metrics Are Calculated

**Calls today:** Count of outgoing + completed calls per user for today
**Talk time today:** Sum of \`duration\` (seconds) per user, converted to minutes
**Target progress:** calls / 50 and talkTimeMinutes / 120`,

    // ═══════════════════════════════════════════════════════════════
    // ACCOUNTABILITY RULES
    // ═══════════════════════════════════════════════════════════════
    `## ACCOUNTABILITY RULES

### Daily Targets (Fireable Metrics)
- **50 outbound calls**
- **2 hours (120 minutes) talk time**

### Automated Enforcement

**At 12:00 PM CT (noon):**
- Leaderboard posted to #accountability
- Agents below 25% of target: @mentioned publicly in the channel
- Agents below 40% of target: receive a private DM

**At 5:00 PM CT (end of day):**
- Final numbers posted to #accountability
- Summary shows who hit vs who missed
- Every agent who missed target receives a DM

### Leaderboard Color Coding
- **Green** = 80%+ of target (on track)
- **Yellow** = 50-79% of target (needs to pick up)
- **Red** = Below 50% of target (severely behind)

### DM Tone
Firm but not hostile. Example:
> Hey **[Name]**, you're at **8 calls** and **20 min** talk time right now.
> Target is **50 calls** / **2h** by end of day.
> You need to pick up the pace — let's get after it!`,

    // ═══════════════════════════════════════════════════════════════
    // SCHEDULES
    // ═══════════════════════════════════════════════════════════════
    `## COMPLETE SCHEDULE

| When | What | Where |
|------|------|-------|
| Every 3 min | Check Notion for new sales, announce them | #sales-announcements |
| 12:00 PM CT, Mon-Fri | Midday call/talk time check + DMs | #accountability |
| 5:00 PM CT, Mon-Fri | End-of-day final numbers + DMs | #accountability |
| 6:00 PM CT, Mon-Fri | Weekly sales leaderboard | #leaderboards |
| 8:00 AM CT, Mondays | Monthly sales leaderboard | #leaderboards |

**Time definitions:**
- Week = **Sunday through Saturday**
- Month = **Calendar month** (1st through last day)
- Timezone = **America/Chicago (Central Time)**`,

    // ═══════════════════════════════════════════════════════════════
    // MILESTONES
    // ═══════════════════════════════════════════════════════════════
    `## MILESTONES

Automatically detected and announced in #sales-announcements:

**Total Sales Milestones:**
| Count | Message |
|-------|---------|
| 1 | FIRST SALE EVER! Welcome to the board! |
| 5 | 5 sales down! You're getting dangerous! |
| 10 | DOUBLE DIGITS! 10 sales — certified closer! |
| 25 | 25 SALES! Quarter-century club! |
| 50 | 50 SALES! Half a hundred — absolute machine! |
| 100 | 100 SALES! CENTURION STATUS! Legend! |

**Revenue Milestones (single deal):**
| Amount | Message |
|--------|---------|
| $10,000 | First $10K sale! Big money moves! |
| $25,000 | $25K DEAL! That's a fat one! |
| $50,000 | $50K SALE?! MONSTER DEAL! |

**Weekly Milestones:**
| Count | Message |
|-------|---------|
| 5 | 5-SALE WEEK! On fire! |
| 10 | 10-SALE WEEK! ABSOLUTELY UNSTOPPABLE! |

Milestones only fire once per agent. History tracked in \`data/milestone-history.json\`.`,

    // ═══════════════════════════════════════════════════════════════
    // SLASH COMMANDS
    // ═══════════════════════════════════════════════════════════════
    `## SLASH COMMANDS

### For All Agents

**/mystats**
Shows your personal stats: today's calls & talk time, weekly/monthly/all-time sales, revenue, conversion rate, and leads taken.

**/leaderboard** (type: Calls or Sales)
- **Calls (Today):** Live call/talk time leaderboard for all agents
- **Sales (This Week):** Current week's sales, conversion rate, revenue

### For Admins Only

**/add-agent**
Maps a new agent across Discord, Notion, and Quo.
- \`user\` — The Discord user
- \`notion_id\` — Their Notion user ID
- \`quo_id\` — Their Quo user ID
- \`role\` — "agent" or "admin"

**/remove-agent**
Deactivates an agent. Does not delete their history.
- \`user\` — The Discord user to deactivate`,

    // ═══════════════════════════════════════════════════════════════
    // AGENT MAPPING
    // ═══════════════════════════════════════════════════════════════
    `## AGENT IDENTITY MAPPING

The bot connects three systems via \`data/agents.json\`:

\`\`\`
{
  "name": "Brayden Hammon",
  "discordId": "948372615283",          <-- Discord user ID
  "notionUserId": "365d872b-594c...",   <-- Notion people property ID
  "quoUserId": "US4Q27qUH6",           <-- Quo/OpenPhone user ID
  "role": "agent",
  "active": true
}
\`\`\`

**How matching works:**
- Sale in Notion -> \`Sales Agent\` people field -> match \`notionUserId\` -> find agent
- Calls in Quo -> \`userId\` on call -> match \`quoUserId\` -> find agent
- Post to Discord -> use \`discordId\` to @mention the right person

**Currently registered (Notion + Quo matched, Discord IDs needed when they join):**
- Donald Timpson (admin)
- Brayden Hammon
- Emmanuel Marquez
- James Spencer
- Lucio Fridlander
- Bryan Dockstader
- Monte Hammon
- Vivian Holm
- Verla Hammon
- Brady Timpson
- Jeanette Zimmerman

**Missing Discord IDs:** Once agents join the server, use \`/add-agent\` or manually add their Discord user ID to agents.json.`,

    // ═══════════════════════════════════════════════════════════════
    // ONBOARDING
    // ═══════════════════════════════════════════════════════════════
    `## AGENT ONBOARDING / OFFBOARDING

### New Agent Joins:
1. Have them join this Discord server
2. Assign them the **Sales Agent** role (Server Settings > Members)
3. Right-click their name > Copy User ID
4. Run \`/add-agent\` with their Discord ID, Notion ID, and Quo ID
5. They now appear on leaderboards and get accountability DMs

### Finding IDs:
- **Discord User ID:** Right-click user > Copy User ID (Developer Mode must be on: Settings > Advanced)
- **Notion User ID:** Already mapped in agents.json for current team. For new users: Settings > Members > click member > ID in URL
- **Quo User ID:** Already mapped in agents.json for current team. For new users: the bot can pull from Quo API

### Agent Leaves:
1. Run \`/remove-agent @user\`
2. Remove their Sales Agent role
3. (Optional) Kick from server`,

    // ═══════════════════════════════════════════════════════════════
    // RUNNING & DEPLOYMENT
    // ═══════════════════════════════════════════════════════════════
    `## RUNNING & DEPLOYMENT

### Local (testing):
\`\`\`
cd scripts/discord-bot
npm start
\`\`\`

### Production (Railway):
- Separate Railway service from the follow-up bot
- Runs 24/7, auto-restarts on crash
- Env vars in Railway dashboard:
  - DISCORD_BOT_TOKEN
  - DISCORD_GUILD_ID
  - Sentri_Notion_API_Key
  - Quo_API-Key

### File Structure:
\`\`\`
scripts/discord-bot/
|-- index.js              # Main entry, client init, scheduler registration
|-- config.js             # All config values (targets, intervals, timezone)
|-- setup-channels.js     # One-time: creates category + channels + roles
|-- commands/             # /mystats, /leaderboard, /add-agent, /remove-agent
|-- schedulers/           # noon check, EOD check, sale poller, weekly board, monthly board
|-- services/             # quo-stats.js, notion-stats.js, milestone-tracker.js
|-- utils/                # embeds.js, formatters.js, agent-store.js
|-- data/
    |-- agents.json            # Agent mapping (source of truth)
    |-- milestones.json        # Milestone definitions
    |-- channel-ids.json       # Auto-generated Discord channel IDs
    |-- milestone-history.json # Which milestones have fired (auto-generated)
\`\`\``,

    // ═══════════════════════════════════════════════════════════════
    // CONFIG REFERENCE
    // ═══════════════════════════════════════════════════════════════
    `## CONFIGURATION REFERENCE

All values in \`config.js\`. Change and restart bot to apply.

| Setting | Value | What it controls |
|---------|-------|------------------|
| \`targets.callsPerDay\` | 50 | Daily call target |
| \`targets.talkTimeMinutes\` | 120 | Daily talk time target (2 hours) |
| \`accountability.noonWarningThreshold\` | 0.40 | Below 40% at noon = private DM |
| \`accountability.noonCriticalThreshold\` | 0.25 | Below 25% at noon = public @mention |
| \`polling.salesCheck\` | 3 min | How often to check Notion for new sales |
| \`polling.callStats\` | 10 min | How often to refresh Quo call data |
| \`timezone\` | America/Chicago | Central Time for all schedules |`,

    // ═══════════════════════════════════════════════════════════════
    // TROUBLESHOOTING
    // ═══════════════════════════════════════════════════════════════
    `## TROUBLESHOOTING

**Bot online but not posting leaderboards:**
- Verify agents have \`quoUserId\` filled in agents.json (empty = invisible to call tracking)
- Check Quo API key is valid
- Check bot console logs for errors

**Sales not announcing:**
- Lead must have Status = "Sold" (exact) AND Initial Paid Date set
- The Sales Agent field must have a mapped user assigned
- Only detects new sales after the bot starts running

**Slash commands not appearing:**
- Commands register on startup. Restart the bot.
- Can take up to 1 hour to propagate (rare)

**Agent not on leaderboard:**
- Check agents.json: \`active\` must be \`true\`
- Must have both \`quoUserId\` (for calls) and \`notionUserId\` (for sales)

**DMs not sending:**
- Agent may have DMs disabled for server members (Discord privacy setting)
- Console will log "Could not DM [name]"

**Conversion rate looks wrong:**
- Conversion = sales / leads taken IN THE SAME PERIOD
- If an agent has 0 leads taken this week but 1 sale, the sale's Initial Paid Date is in this week but the lead was assigned in a prior week

---
*Last updated: May 25, 2026*`
  ];

  for (const msg of messages) {
    await channel.send(msg);
    await new Promise(r => setTimeout(r, 750));
  }

  console.log(`Done. Posted ${messages.length} messages.`);
  client.destroy();
});

client.login(config.discord.token);

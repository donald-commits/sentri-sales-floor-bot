/**
 * Posts corrected data source documentation to #admin-operations.
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
  console.log('Posting corrected data source docs...');

  const messages = [
    `# DATA SOURCES v2 (CORRECTED) — Replaces previous data source posts

---`,

    `## NOTION — Sales & Revenue Data

**Database:** Sentri Leads DB
**Database ID:** \`2f518d01-e1b6-8002-b83a-e4022123e913\`

### What defines a "Sale"?

A lead counts as a **sale** ONLY when:
- \`Status\` property = \`"Sold"\` (exact match)
- \`Initial Paid Date\` property has a value

"Invoiced", "Final Sent", "Final Paid" do **NOT** count as sales.

### Real-time sale detection (every 3 min)

The bot polls for leads where:
- \`Status\` = \`"Sold"\`
- \`Initial Paid Date\` > (time of last poll)

When detected, it announces the sale in #sales-announcements.

---`,

    `### Notion Properties Used

| Property Name | Type | What the bot reads |
|---------------|------|-------------------|
| \`Status\` | status | Must be "Sold" to count as a sale |
| \`Initial Paid Date\` | date | When the sale closed — used for date-range filtering |
| \`Sales Agent\` | people | Which agent owns this lead |
| \`Sales Agent Assigned Date\` | date | When the agent took this lead — used for "leads taken" count |
| \`Total Amount\` | number | Revenue amount |
| \`Client Name\` | title | Displayed in sale announcements |
| \`Services Requested\` | multi_select | Displayed in sale announcements |

---`,

    `### How each metric is calculated

**Sales count (week/month/all-time):**
- Filter: \`Sales Agent\` contains agent's Notion ID
- Filter: \`Status\` = "Sold"
- Filter: \`Initial Paid Date\` falls within the period
- Count of matching leads

**Revenue (week/month/all-time):**
- Same filter as sales count
- Sum of \`Total Amount\` for matching leads

**Leads taken (week/month/all-time):**
- Filter: \`Sales Agent\` contains agent's Notion ID
- Filter: \`Sales Agent Assigned Date\` falls within the period
- Count of matching leads

**Conversion rate (week/month/all-time):**
- Formula: sales / leads taken (in the SAME period)
- Week = Sunday through Saturday
- Month = calendar month (1st through last day)
- All-time = lifetime totals

**Bid sent rate (week/month/all-time):**
- Numerator: Leads with status "Bid sent" or "Sold", assigned in the period
- Denominator: Leads taken in the same period
- Formula: bids / leads taken

**Lifetime total sales (for milestones):**
- Filter: Status = "Sold" AND Initial Paid Date is not empty AND Sales Agent matches
- Used to trigger milestone announcements (1st, 5th, 10th sale, etc.)

---`,

    `## QUO (OPENPHONE) — Call & Talk Time Data

**API Base URL:** \`https://api.openphone.com/v1\`

### Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| \`GET /v1/calls\` | Fetch all calls for a date range |
| \`GET /v1/users\` | List all team members (for ID lookup) |

### Call filtering logic

Only counts calls matching ALL of:
1. \`direction\` = \`"outgoing"\` (inbound ignored)
2. \`status\` = \`"completed"\` (missed/abandoned/voicemail ignored)

### Properties used per call

| Field | What it means |
|-------|---------------|
| \`direction\` | "outgoing" or "incoming" — only outgoing counted |
| \`status\` | "completed" only — everything else ignored |
| \`userId\` | The Quo user who owns this call (primary ID) |
| \`initiatedBy\` | Fallback if userId is empty |
| \`duration\` | Call length in seconds — summed for talk time |
| \`createdAt\` | Timestamp — for date filtering |

### Call metrics

**Calls today:** Count of outgoing + completed calls per user
**Talk time today:** Sum of \`duration\` (seconds) per user, converted to minutes
**Target:** 50 calls / 120 min (2 hours) per day

---`,

    `## SCHEDULE SUMMARY (Updated)

| When | What | Channel |
|------|------|---------|
| Every 3 min | Poll for new sales (Status=Sold + Initial Paid Date) | #sales-announcements |
| 12:00 PM CT, Mon-Fri | Midday call/talk time check + DM laggards | #accountability |
| 5:00 PM CT, Mon-Fri | EOD final numbers + DM agents who missed | #accountability |
| 6:00 PM CT, Mon-Fri | Weekly sales leaderboard (Sun-Sat) | #leaderboards |
| 8:00 AM CT, Monday | Monthly sales leaderboard (calendar month) | #leaderboards |

**Week = Sunday through Saturday**
**Month = Calendar month (1st through last day)**

---`,

    `## AGENT IDENTITY MAPPING

\`data/agents.json\` connects the three systems:

\`\`\`
{
  "name": "Jerry Smith",
  "discordId": "948372615283",        <-- right-click > Copy User ID
  "notionUserId": "30cd872b-594c...",  <-- Notion people property ID
  "quoUserId": "USlHhXmRMz",          <-- Quo/OpenPhone user ID
  "role": "agent",
  "active": true
}
\`\`\`

**Matching logic:**
- Notion sale detected -> Sales Agent people field -> match \`notionUserId\`
- Quo call stats -> userId on call object -> match \`quoUserId\`
- Discord output -> use \`discordId\` to @mention

---

*Updated: May 25, 2026 — Corrected sale definition, date properties, and conversion rate formula*`
  ];

  for (const msg of messages) {
    await channel.send(msg);
    await new Promise(r => setTimeout(r, 750));
  }

  console.log(`Posted ${messages.length} messages`);
  client.destroy();
});

client.login(config.discord.token);

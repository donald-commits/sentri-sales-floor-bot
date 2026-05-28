/**
 * Posts detailed data source documentation to #admin-operations.
 * Run once: node post-data-sources.js
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
  console.log('Posting data source documentation...');

  const messages = [
    `# DATA SOURCES — EXACTLY WHERE THE BOT PULLS FROM

---`,

    `## NOTION — Sales & Revenue Data

**Database:** Sentri Leads DB
**Database ID:** \`2f518d01-e1b6-8002-b83a-e4022123e913\`
**API Version:** 2022-06-28

### What defines a "Sale"?

The bot considers a lead a **sale** if its \`Status\` property (type: status) is one of:
- \`Sold\`
- \`Invoiced\`
- \`Final Sent\`
- \`Final Paid\`

All four of these statuses count toward sales numbers, revenue, and conversion rates.

### Real-time sale detection (every 3 min)

The bot polls for leads matching:
- \`Status\` = \`"Sold"\` (exact match, case-sensitive)
- \`last_edited_time\` > (time of last poll)

**Important:** Only status "Sold" triggers a real-time announcement. If a lead skips "Sold" and goes directly to "Invoiced", it will NOT trigger an announcement. The lead must pass through "Sold" status.

---`,

    `### Notion Properties Used

| Property Name | Type | What the bot reads |
|---------------|------|-------------------|
| \`Status\` | status | Determines if lead is a sale, bid, contacted, etc. |
| \`Sales Agent\` | people | Which agent owns this lead (matched by Notion User ID) |
| \`Total Amount\` | number | Revenue amount — used for revenue stats and milestone tracking |
| \`Client Name\` | title | Displayed in sale announcements |
| \`Services Requested\` | multi_select | Displayed in sale announcements (e.g., Roofing, Siding) |
| \`last_edited_time\` | timestamp (built-in) | Used for detecting new sales and date-range filtering |

### How each metric is calculated

**Sales count (week/month):**
- Filter: \`Sales Agent\` contains agent's Notion ID
- Filter: Status is one of: Sold, Invoiced, Final Sent, Final Paid
- Date check: \`last_edited_time\` falls within the week/month range
- Count of matching leads

**Revenue (week/month):**
- Same filter as sales count
- Sum of \`Total Amount\` for all matching leads

**Conversion rate:**
- Numerator: Sales count within the date range
- Denominator: All leads assigned to agent with status in [Contacted, Bid sent, No Sale, Sold, Invoiced, Final Sent, Final Paid]
- Formula: sales / totalLeads
- NOTE: Denominator is currently ALL-TIME (not date-filtered). This means conversion rate will naturally decrease over time as more leads accumulate.

**Bid sent rate:**
- Numerator: Leads with status in [Bid sent, Sold, Invoiced, Final Sent, Final Paid]
- Denominator: Same as conversion rate (all worked leads)
- Formula: bids / totalLeads

**Lifetime total sales (for milestones):**
- Filter: \`Sales Agent\` contains agent's Notion ID AND \`Status\` = "Sold"
- NOTE: Only counts exact "Sold" status, not Invoiced/Final Sent/Final Paid
- This is the number used for milestone triggers (1st sale, 10th, etc.)

---`,

    `## QUO (OPENPHONE) — Call & Talk Time Data

**API Base URL:** \`https://api.openphone.com/v1\`
**Auth:** API key in header (\`Authorization: <key>\`)

### Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| \`GET /v1/calls\` | Fetch all calls for a date range |
| \`GET /v1/users\` | List all team members (for ID lookup) |

### Call filtering logic

From the raw call list, the bot ONLY counts calls that match ALL of:
1. \`direction\` = \`"outgoing"\` (inbound calls are ignored)
2. \`status\` = \`"completed"\` (missed, abandoned, voicemail = ignored)

### Properties used per call

| Field | What it means |
|-------|---------------|
| \`direction\` | "outgoing" or "incoming" — only outgoing counted |
| \`status\` | "completed", "missed", "abandoned" — only completed counted |
| \`userId\` | The Quo user who owns this call (primary identifier) |
| \`initiatedBy\` | Fallback: user who started the call (used if userId is empty) |
| \`duration\` | Call length in seconds — summed for talk time |
| \`createdAt\` | Timestamp — used for date range filtering |

### How metrics are calculated

**Calls today:**
- Fetch all calls where \`createdAfter\` = start of today, \`createdBefore\` = end of today
- Filter to outgoing + completed only
- Group by \`userId\` (or \`initiatedBy\` as fallback)
- Count per user

**Talk time today:**
- Same filtered call set as above
- Sum of \`duration\` (seconds) per user
- Converted to minutes for display

**Target progress:**
- Call progress = (calls today) / 50
- Talk time progress = (talk time minutes) / 120
- Displayed as percentage and color-coded

---`,

    `## AGENT IDENTITY MAPPING

The bot connects the three systems via \`data/agents.json\`:

\`\`\`
{
  "name": "Jerry Smith",
  "discordId": "948372615283",       <-- Discord user ID
  "notionUserId": "30cd872b-594c...", <-- Notion people property ID
  "quoUserId": "USlHhXmRMz",         <-- Quo/OpenPhone user ID
  "role": "agent",
  "active": true
}
\`\`\`

**How matching works:**
- Sale detected in Notion -> \`Sales Agent\` people field -> extract first person's ID -> match to agents.json \`notionUserId\`
- Call stats from Quo -> \`userId\` field on call -> match to agents.json \`quoUserId\`
- Post to Discord -> use \`discordId\` to @mention the correct user

If any ID is missing or wrong, that agent will be invisible to that part of the system.

---`,

    `## KNOWN LIMITATIONS & EDGE CASES

1. **Sale must pass through "Sold" status** — If you change a lead directly to "Invoiced" without first being "Sold", it won't trigger a real-time announcement (but will count in stats)

2. **Conversion rate uses all-time denominator** — An agent who has been here 6 months will have a lower conversion rate than a new agent, even with the same close rate on recent leads

3. **Quo doesn't differentiate call types** — A 30-second wrong-number call counts the same as a 45-minute sales call. Both add to call count and talk time.

4. **last_edited_time is imprecise** — If someone edits a "Sold" lead (changes notes, updates amount), the bot may re-detect it as a "new" sale. The 3-minute polling window minimizes this but doesn't eliminate it.

5. **No "Sold Date" property** — The bot uses \`last_edited_time\` as a proxy for when the sale happened. If a sold lead is edited weeks later, it could appear in the wrong week's stats.

---
*Posted: May 25, 2026*`
  ];

  for (const msg of messages) {
    await channel.send(msg);
    await new Promise(r => setTimeout(r, 750));
  }

  console.log(`Posted ${messages.length} data source messages`);
  client.destroy();
});

client.login(config.discord.token);

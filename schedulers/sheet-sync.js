/**
 * Sales Agent Tracking Sheet — Hourly Notion → Google Sheets sync
 *
 * Auto-syncs: Revenue Sold, Number of Sales, Leads Contacted, Bids Sent,
 *             Contact-to-Bid %, Bid-to-Sale %
 * Skips future weeks, only writes current + past.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// ── Sheet config ────────────────────────────────────────
const SPREADSHEET_ID = '1tp5wEk0W-RVn_x_MaH8w0hPh40ISNGGw26IKfv6DBOw';
const SHEET_NAME = 'Weekly Tracking';

// Google OAuth credentials — read at runtime from env vars (Railway) or local file

// Agent display names → Notion people IDs
const AGENTS = [
  { display: 'Lucio',            notionId: '360d872b-594c-81ee-8956-0002162c50cf' },
  { display: 'Manny (Emmanuel)', notionId: '360d872b-594c-81cf-a045-0002cdaa4b38' },
  { display: 'Jasmine',          notionId: '36cd872b-594c-8179-a7ab-0002da77ad1b' },
  { display: 'Akiami',           notionId: '368d872b-594c-81ce-b6c4-0002b0290080' },
  { display: 'Avery',            notionId: '36dd872b-594c-81b0-a174-000296d5378f' },
  { display: 'Shez',             notionId: '317d872b-594c-81b9-af88-0002411b9da8' },
];

// Metric row offsets within each agent block (must match build-sales-tracker.js)
const METRIC_ROWS = {
  'Revenue Sold':      2,
  'Number of Sales':   3,
  'Leads Contacted':   4,
  'Bids Sent':         5,
  'Contact-to-Bid %':  6,
  'Bid-to-Sale %':     7,
};

const NUM_METRICS = 10;

// ── Week boundaries (Sun-Sat, 13 weeks from May 31 2026) ─
function generateWeekBounds() {
  const weeks = [];
  for (let i = 0; i < 13; i++) {
    const sun = new Date(2026, 4, 31 + i * 7);
    const sat = new Date(2026, 4, 31 + i * 7 + 6);
    weeks.push({
      index: i,
      start: fmtDate(sun),
      end: fmtDate(sat),
    });
  }
  return weeks;
}

function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const WEEKS = generateWeekBounds();

// ── HTTP helper ─────────────────────────────────────────
function httpRequest(hostname, reqPath, method, headers, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = https.request({
      hostname, path: reqPath, method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode === 429) {
          resolve({ rateLimited: true, retryAfter: parseInt(res.headers['retry-after'] || '2', 10) });
        } else if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ── Notion query with pagination + retry ────────────────
async function queryAllPages(filter) {
  const pages = [];
  let hasMore = true, cursor;
  while (hasMore) {
    const body = { filter, page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await httpRequest(
        'api.notion.com',
        `/v1/databases/${config.notion.leadsDbId}/query`,
        'POST',
        { 'Authorization': `Bearer ${config.notion.apiKey}`, 'Notion-Version': '2022-06-28' },
        body
      );
      if (result.rateLimited) {
        await new Promise(r => setTimeout(r, result.retryAfter * 1000));
        continue;
      }
      break;
    }
    if (result.rateLimited) throw new Error('Notion: max retries exceeded');

    pages.push(...result.results);
    hasMore = result.has_more;
    cursor = result.next_cursor;
  }
  return pages;
}

// ── Google OAuth ────────────────────────────────────────
async function getAccessToken() {
  // Read env vars at call time (not module load time) so Railway vars are available
  let clientId = process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  let refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    try {
      const credsPath = path.join(require('os').homedir(), '.config/gws-sentri/credentials.json');
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      clientId = creds.client_id;
      clientSecret = creds.client_secret;
      refreshToken = creds.refresh_token;
    } catch {
      console.error('[SheetSync] Debug — env check:', {
        hasClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasRefresh: !!process.env.GOOGLE_REFRESH_TOKEN,
        envKeys: Object.keys(process.env).filter(k => k.startsWith('GOOGLE')),
      });
      throw new Error('No Google credentials found — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN env vars');
    }
  }

  const postData = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': postData.length },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const data = JSON.parse(body);
        if (data.access_token) resolve(data.access_token);
        else reject(new Error('Google token refresh failed: ' + body));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sheetsApi(token, method, endpoint, body) {
  return httpRequest(
    'sheets.googleapis.com',
    `/v4/spreadsheets/${SPREADSHEET_ID}${endpoint}`,
    method,
    { 'Authorization': `Bearer ${token}` },
    body
  );
}

// ── Compute row positions (must match build script) ─────
function getAgentMetricsStartRow(agentIndex) {
  let row = 3; // 0-indexed: title=0, month=1, header=2, data starts at 3
  for (let a = 0; a < agentIndex; a++) {
    row += 1 + NUM_METRICS; // banner + metrics
    if (a < AGENTS.length - 1) row += 1; // separator
  }
  return row + 1; // +1 for this agent's banner row
}

function colLetter(col) {
  let letter = '', c = col + 1;
  while (c > 0) { const mod = (c - 1) % 26; letter = String.fromCharCode(65 + mod) + letter; c = Math.floor((c - 1) / 26); }
  return letter;
}

// ── Main sync function ──────────────────────────────────
async function syncSalesTracker() {
  const startTime = Date.now();
  console.log(`[SheetSync] Starting sales tracker sync...`);

  const token = await getAccessToken();
  const updates = [];

  for (let a = 0; a < AGENTS.length; a++) {
    const agent = AGENTS[a];
    const metricsStart = getAgentMetricsStartRow(a);
    console.log(`[SheetSync]   Syncing ${agent.display}...`);

    for (let w = 0; w < WEEKS.length; w++) {
      const week = WEEKS[w];

      // Skip future weeks
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekStart = new Date(week.start + 'T00:00:00');
      if (weekStart > today) continue;

      const weekCol = colLetter(3 + w);

      // Sales (Initial Paid Date in week)
      const salesPages = await queryAllPages({
        and: [
          { property: 'Sales Agent', people: { contains: agent.notionId } },
          { property: 'Initial Paid Date', date: { on_or_after: week.start } },
          { property: 'Initial Paid Date', date: { on_or_before: week.end } },
        ],
      });
      const numSales = salesPages.length;
      const revenue = salesPages.reduce((sum, p) => sum + (p.properties['Total Amount']?.number || 0), 0);

      // Contacted (Contacted Date in week)
      const contactedPages = await queryAllPages({
        and: [
          { property: 'Sales Agent', people: { contains: agent.notionId } },
          { property: 'Contacted Date', date: { on_or_after: week.start } },
          { property: 'Contacted Date', date: { on_or_before: week.end } },
        ],
      });
      const numContacted = contactedPages.length;

      // Bids (Bid Sent Date in week)
      const bidPages = await queryAllPages({
        and: [
          { property: 'Sales Agent', people: { contains: agent.notionId } },
          { property: 'Bid Sent Date', date: { on_or_after: week.start } },
          { property: 'Bid Sent Date', date: { on_or_before: week.end } },
        ],
      });
      const numBids = bidPages.length;

      // Ratios
      const contactToBid = numContacted > 0 ? numBids / numContacted : 0;
      const bidToSale = numBids > 0 ? numSales / numBids : 0;

      const sheetRow = (row0) => row0 + 1; // 0-indexed → 1-indexed

      for (const { metric, value } of [
        { metric: 'Revenue Sold',      value: revenue },
        { metric: 'Number of Sales',   value: numSales },
        { metric: 'Leads Contacted',   value: numContacted },
        { metric: 'Bids Sent',         value: numBids },
        { metric: 'Contact-to-Bid %',  value: contactToBid },
        { metric: 'Bid-to-Sale %',     value: bidToSale },
      ]) {
        const row1 = sheetRow(metricsStart + METRIC_ROWS[metric]);
        updates.push({ range: `'${SHEET_NAME}'!${weekCol}${row1}`, values: [[value]] });
      }
    }
  }

  console.log(`[SheetSync]   Writing ${updates.length} cells to sheet...`);
  await sheetsApi(token, 'POST', '/values:batchUpdate', { valueInputOption: 'RAW', data: updates });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[SheetSync] Sync complete in ${elapsed}s — ${updates.length} cells updated.`);
}

module.exports = { syncSalesTracker };

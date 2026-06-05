/**
 * Local auto-scraper: runs headless puppeteer to scrape Quo analytics,
 * then POSTs the data to the Railway bot.
 *
 * Set up as a Windows scheduled task to run every 30 min during work hours.
 * Run manually: node quo-auto-scraper.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const https = require('https');

const PROFILE_DIR = path.join(__dirname, 'data', 'chrome-profile');
const RAILWAY_URL = 'https://sentri-sales-floor-bot-production.up.railway.app/debug/upload-quo-stats';

async function scrapeAndUpload() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      userDataDir: PROFILE_DIR,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto('https://my.quo.com/analytics', { waitUntil: 'networkidle2', timeout: 30000 });

    const url = page.url();
    if (url.includes('login') || url.includes('accounts.google')) {
      console.log('NOT LOGGED IN — run: node quo-screenshot.js (interactive) first');
      await browser.close();
      process.exit(1);
    }

    await new Promise(r => setTimeout(r, 5000));
    console.log('Page loaded:', page.url());

    // Make sure "Today" filter is selected
    try {
      await page.evaluate(() => {
        // Look for a "Today" button or filter
        const buttons = document.querySelectorAll('button, [role="button"], [role="tab"]');
        for (const btn of buttons) {
          if (btn.textContent?.trim() === 'Today') {
            btn.click();
            return true;
          }
        }
        // Also try clicking any date picker that says "Today"
        const links = document.querySelectorAll('a, span, div');
        for (const el of links) {
          if (el.textContent?.trim() === 'Today' && el.onclick) {
            el.click();
            return true;
          }
        }
        return false;
      });
      console.log('Clicked Today filter');
      await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
      console.log('Could not find Today filter:', e.message);
    }

    // Screenshot for debugging
    const screenshotPath = path.join(__dirname, 'data', 'quo-debug-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Debug screenshot saved');

    // Paginate and extract
    const allUsers = [];
    let hasMore = true;
    let pageNum = 1;
    const MAX_PAGES = 10;

    while (hasMore && pageNum <= MAX_PAGES) {
      console.log('Extracting page', pageNum, '...');
      const pageData = await page.evaluate(() => {
        const text = document.body.innerText;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const actIdx = lines.findIndex(l => l === 'Activities');
        if (actIdx === -1) return { users: [], hasNext: false };

        const showingLine = lines.find(l => l.startsWith('Showing'));
        const showingMatch = showingLine?.match(/Showing (\d+) - (\d+) of (\d+)/);
        const total = showingMatch ? parseInt(showingMatch[3]) : 0;
        const currentEnd = showingMatch ? parseInt(showingMatch[2]) : 0;

        const users = [];
        const timePattern = /^\d{1,3}:\d{2}$/;

        for (let i = actIdx; i < lines.length; i++) {
          const line = lines[i];
          if (/^(User|Total calls|Outgoing|Answered|Time on|Sent messages|Showing|Busy|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|\d+\s*(am|pm))/.test(line)) continue;
          if (/^\d+$/.test(line) || /^\d+%$/.test(line) || timePattern.test(line)) continue;
          if (line.startsWith('↑') || line.startsWith('↓') || line === '—' || line === '0%') continue;
          if (line.length < 3 || line.length > 40) continue;

          const nextNums = [];
          for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
            if (/^\d+$/.test(lines[j])) nextNums.push(parseInt(lines[j]));
            else if (timePattern.test(lines[j])) nextNums.push(lines[j]);
            else if (/^[↑↓]/.test(lines[j]) || lines[j] === '—' || /^\d+%$/.test(lines[j]) || lines[j] === '0%') continue;
            else break;
          }

          if (nextNums.length >= 2) {
            const totalCalls = typeof nextNums[0] === 'number' ? nextNums[0] : 0;
            let timeOnCalls = '00:00';
            for (const n of nextNums) {
              if (typeof n === 'string' && timePattern.test(n)) { timeOnCalls = n; break; }
            }
            users.push({ name: line, totalCalls, timeOnCalls });
          }
        }
        return { users, hasNext: currentEnd < total };
      });

      console.log('  Found', pageData.users.length, 'users, hasNext:', pageData.hasNext);
      allUsers.push(...pageData.users);

      if (pageData.hasNext) {
        const clicked = await page.evaluate(() => {
          // Find the next page arrow button (right arrow ›)
          const allBtns = document.querySelectorAll('button, [role="button"]');
          for (const btn of allBtns) {
            const text = btn.textContent?.trim();
            const aria = btn.getAttribute('aria-label') || '';
            if (text === '›' || text === '>' || aria.toLowerCase().includes('next')) {
              btn.click();
              return true;
            }
          }
          // Try SVG arrow buttons
          const svgBtns = document.querySelectorAll('svg');
          return false;
        });
        if (!clicked) { console.log('  Could not find next button'); hasMore = false; break; }
        await new Promise(r => setTimeout(r, 3000));
        pageNum++;
      } else {
        hasMore = false;
      }
    }
    console.log('Total raw users extracted:', allUsers.length);

    await browser.close();

    // Deduplicate
    const deduped = {};
    allUsers.forEach(u => {
      if (!deduped[u.name] || u.totalCalls > deduped[u.name].totalCalls) deduped[u.name] = u;
    });
    const uniqueUsers = Object.values(deduped).sort((a, b) => b.totalCalls - a.totalCalls);

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
    const payload = JSON.stringify({ date: todayStr, users: uniqueUsers, scrapedAt: now.toISOString() });

    // POST to Railway
    const url2 = new URL(RAILWAY_URL);
    const options = {
      hostname: url2.hostname,
      path: url2.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };

    await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.log(`[${now.toLocaleTimeString()}] Uploaded ${uniqueUsers.length} users to Railway: ${body}`);
          resolve();
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

  } catch (err) {
    console.error('Error:', err.message);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
}

scrapeAndUpload();

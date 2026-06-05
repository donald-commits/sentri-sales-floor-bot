/**
 * Scrapes Quo analytics page for call data.
 * Uses persistent Chrome profile for auto-login after first run.
 * Paginates through all users and extracts call stats.
 *
 * Run: node quo-screenshot.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_FILE = path.join(__dirname, 'data', 'quo-analytics.png');
const DATA_FILE = path.join(__dirname, 'data', 'quo-scraped-stats.json');

async function main() {
  console.log('Launching browser...');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
    args: ['--start-maximized'],
    userDataDir: path.join(__dirname, 'data', 'chrome-profile'),
  });

  const page = await browser.newPage();
  await page.goto('https://my.quo.com/analytics', { waitUntil: 'networkidle2', timeout: 60000 });

  // Check if we need to log in
  const url = page.url();
  if (url.includes('login') || url.includes('accounts.google')) {
    console.log('Need to log in — complete Google login in the browser window...');
    await page.waitForFunction(
      () => !window.location.href.includes('login') && !window.location.href.includes('accounts.google'),
      { timeout: 300000, polling: 2000 }
    );
    await new Promise(r => setTimeout(r, 5000));
    if (!page.url().includes('analytics')) {
      await page.goto('https://my.quo.com/analytics', { waitUntil: 'networkidle2', timeout: 30000 });
    }
  }

  console.log('On analytics page. Waiting for data to load...');
  await new Promise(r => setTimeout(r, 8000));

  // Extract all user stats by paginating through the table
  const allUsers = [];
  let pageNum = 1;
  let hasMore = true;

  while (hasMore) {
    console.log('Reading page', pageNum, '...');

    // Extract current page's user data
    const pageData = await page.evaluate(() => {
      const text = document.body.innerText;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);

      // Find the "Activities" section
      const actIdx = lines.findIndex(l => l === 'Activities');
      if (actIdx === -1) return { users: [], hasNext: false };

      // Find "Showing X - Y of Z" to know pagination state
      const showingLine = lines.find(l => l.startsWith('Showing'));
      const showingMatch = showingLine?.match(/Showing (\d+) - (\d+) of (\d+)/);
      const total = showingMatch ? parseInt(showingMatch[3]) : 0;
      const currentEnd = showingMatch ? parseInt(showingMatch[2]) : 0;

      // Parse user rows - look for the pattern: Name, numbers, percentages
      // The table has: User, Total calls (today, prev, %), Outgoing calls, Answered calls, Time on calls, Sent messages
      const users = [];

      // Find all user entries by looking for time patterns like "HH:MM" which appear in "Time on calls"
      const timePattern = /^\d{1,3}:\d{2}$/;

      for (let i = actIdx; i < lines.length; i++) {
        // A user row starts with a name (not a number, not a header)
        const line = lines[i];

        // Skip headers and non-name lines
        if (/^(User|Total calls|Outgoing|Answered|Time on|Sent messages|Showing|Busy|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|\d+\s*(am|pm))/.test(line)) continue;
        if (/^\d+$/.test(line)) continue;
        if (/^\d+%$/.test(line)) continue;
        if (timePattern.test(line)) continue;
        if (line.startsWith('↑') || line.startsWith('↓') || line === '—' || line === '0%') continue;
        if (line.length < 3 || line.length > 40) continue;

        // Check if this looks like a person name (has a letter, followed by numbers in subsequent lines)
        const nextNums = [];
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          if (/^\d+$/.test(lines[j])) nextNums.push(parseInt(lines[j]));
          else if (timePattern.test(lines[j])) nextNums.push(lines[j]);
          else if (/^[↑↓]/.test(lines[j]) || lines[j] === '—' || /^\d+%$/.test(lines[j]) || lines[j] === '0%') continue;
          else break;
        }

        if (nextNums.length >= 2) {
          // This is likely a user row
          // Pattern: totalCalls, prevCalls, outgoing, prevOut, answered, prevAns, time, prevTime, msgs, prevMsgs
          const totalCalls = typeof nextNums[0] === 'number' ? nextNums[0] : 0;
          const outgoing = typeof nextNums[2] === 'number' ? nextNums[2] : 0;

          // Find the time value
          let timeOnCalls = '00:00';
          for (const n of nextNums) {
            if (typeof n === 'string' && timePattern.test(n)) {
              timeOnCalls = n;
              break;
            }
          }

          users.push({
            name: line,
            totalCalls: totalCalls,
            outgoing: outgoing,
            timeOnCalls: timeOnCalls,
          });
        }
      }

      return { users, hasNext: currentEnd < total, total };
    });

    allUsers.push(...pageData.users);
    console.log('  Found', pageData.users.length, 'users on this page');

    if (pageData.hasNext) {
      // Click the next page button
      try {
        await page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          const nextBtn = Array.from(buttons).find(b => b.textContent.includes('›') || b.getAttribute('aria-label')?.includes('next') || b.textContent.includes('>'));
          if (nextBtn) nextBtn.click();
        });
        await new Promise(r => setTimeout(r, 3000));
        pageNum++;
      } catch (e) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  // Screenshot final state
  await page.screenshot({ path: SCREENSHOT_FILE, fullPage: true });

  // Save extracted data
  console.log('\n=== QUO ANALYTICS TODAY ===');
  console.log('Total users found:', allUsers.length);
  allUsers.sort((a, b) => b.totalCalls - a.totalCalls);
  allUsers.forEach(u => {
    console.log(`  ${u.name}: ${u.totalCalls} calls | ${u.timeOnCalls} time`);
  });

  fs.writeFileSync(DATA_FILE, JSON.stringify({ date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }), users: allUsers }, null, 2));
  console.log('\nData saved to:', DATA_FILE);

  await browser.close();
}

main().catch(e => console.error('Error:', e.message));

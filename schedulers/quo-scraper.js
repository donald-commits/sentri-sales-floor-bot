/**
 * Scrapes Quo analytics page using puppeteer with saved Chrome profile.
 * Runs on Railway with headless Chrome.
 * Saves call stats to /data/quo-scraped-stats.json on the persistent volume.
 */
const path = require('path');
const fs = require('fs');

const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '../data');
const PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');
const STATS_FILE = path.join(DATA_DIR, 'quo-scraped-stats.json');

/**
 * Load the latest scraped stats.
 */
function loadScrapedStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch {
    return { date: '', users: [] };
  }
}

/**
 * Get call stats per agent from the scraped data.
 * Returns same format as quo-stats getAgentCallStats.
 */
function getScrapedCallStats(agents, config) {
  const scraped = loadScrapedStats();
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

  // Only use data from today
  if (scraped.date !== todayStr) {
    return agents
      .filter(a => a.active && a.quoUserId && a.team !== 'admin')
      .map(a => ({
        name: a.name, discordId: a.discordId,
        calls: 0, talkTimeMinutes: 0,
        callTarget: config.targets.callsPerDay,
        talkTimeTarget: config.targets.talkTimeMinutes,
        callProgress: 0, talkTimeProgress: 0,
      }))
      .sort((a, b) => b.calls - a.calls);
  }

  // Deduplicate scraped users
  const quoByName = {};
  scraped.users.forEach(u => {
    if (!quoByName[u.name] || u.totalCalls > quoByName[u.name].totalCalls) {
      quoByName[u.name] = u;
    }
  });

  return agents
    .filter(a => a.active && a.team !== 'admin')
    .map(agent => {
      const quo = quoByName[agent.name];
      const calls = quo?.totalCalls || 0;
      // Parse time string "HH:MM" or "H:MM" to minutes
      let talkTimeMinutes = 0;
      if (quo?.timeOnCalls) {
        const parts = quo.timeOnCalls.split(':');
        if (parts.length === 2) {
          talkTimeMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        } else if (parts.length === 3) {
          talkTimeMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
      }

      return {
        name: agent.name,
        discordId: agent.discordId,
        calls,
        talkTimeMinutes,
        callTarget: config.targets.callsPerDay,
        talkTimeTarget: config.targets.talkTimeMinutes,
        callProgress: calls / config.targets.callsPerDay,
        talkTimeProgress: talkTimeMinutes / config.targets.talkTimeMinutes,
      };
    })
    .sort((a, b) => b.calls - a.calls);
}

/**
 * Scrape Quo analytics page.
 * Uses saved Chrome profile for persistent login.
 */
async function scrapeQuoAnalytics() {
  let browser;
  try {
    console.log('[QuoScraper] Starting scrape...');

    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    };

    // Use Chrome profile if it exists (has full login state)
    if (fs.existsSync(path.join(PROFILE_DIR, 'Default')) || fs.existsSync(path.join(PROFILE_DIR, 'Local State'))) {
      launchOptions.userDataDir = PROFILE_DIR;
    }

    // Lazy-load puppeteer (not installed on Railway, only runs locally)
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    // Load cookies if we have them and aren't using a profile
    const COOKIES_FILE = path.join(DATA_DIR, 'quo-cookies.json');
    if (!launchOptions.userDataDir && fs.existsSync(COOKIES_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
      await page.setCookie(...cookies);
      console.log('[QuoScraper] Loaded', cookies.length, 'cookies');
    }

    await page.goto('https://my.quo.com/analytics', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Check if we're on login page
    const url = page.url();
    if (url.includes('login') || url.includes('accounts.google')) {
      console.log('[QuoScraper] NOT LOGGED IN — need manual login. Run: node quo-screenshot.js locally');
      await browser.close();
      return false;
    }

    // Wait for data to load
    await new Promise(r => setTimeout(r, 8000));

    // Paginate and extract all user data
    const allUsers = [];
    let hasMore = true;
    let pageNum = 1;

    while (hasMore) {
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
          if (/^\d+$/.test(line)) continue;
          if (/^\d+%$/.test(line)) continue;
          if (timePattern.test(line)) continue;
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
              if (typeof n === 'string' && timePattern.test(n)) {
                timeOnCalls = n;
                break;
              }
            }
            users.push({ name: line, totalCalls, timeOnCalls });
          }
        }

        return { users, hasNext: currentEnd < total };
      });

      allUsers.push(...pageData.users);

      if (pageData.hasNext) {
        try {
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            const nextBtn = Array.from(buttons).find(b =>
              b.textContent.includes('›') ||
              b.getAttribute('aria-label')?.includes('next') ||
              b.textContent.includes('>')
            );
            if (nextBtn) nextBtn.click();
          });
          await new Promise(r => setTimeout(r, 3000));
          pageNum++;
        } catch {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    // Deduplicate
    const deduped = {};
    allUsers.forEach(u => {
      if (!deduped[u.name] || u.totalCalls > deduped[u.name].totalCalls) {
        deduped[u.name] = u;
      }
    });

    const uniqueUsers = Object.values(deduped).sort((a, b) => b.totalCalls - a.totalCalls);
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

    fs.writeFileSync(STATS_FILE, JSON.stringify({ date: todayStr, users: uniqueUsers, scrapedAt: new Date().toISOString() }, null, 2));

    console.log(`[QuoScraper] Scraped ${uniqueUsers.length} users. Top: ${uniqueUsers[0]?.name} (${uniqueUsers[0]?.totalCalls} calls)`);

    await browser.close();
    return true;
  } catch (err) {
    console.error('[QuoScraper] Error:', err.message);
    if (browser) await browser.close().catch(() => {});
    return false;
  }
}

module.exports = { scrapeQuoAnalytics, getScrapedCallStats, loadScrapedStats };

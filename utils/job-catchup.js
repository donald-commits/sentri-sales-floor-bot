const fs = require('fs');
const path = require('path');

const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '../data');
const FILE = path.join(DATA_DIR, 'job-history.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}

function save(h) {
  fs.writeFileSync(FILE, JSON.stringify(h, null, 2));
}

/** Wall-clock date, minutes-since-midnight, and day-of-week in a timezone. */
function nowParts(tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return {
    date,
    minutes: (Number(p.hour) % 24) * 60 + Number(p.minute),
    dow: new Date(date + 'T12:00:00Z').getUTCDay(),
  };
}

/**
 * Record that a job fired for today's slot. Call this inside the cron
 * callback so a post-cron restart doesn't double-post via catch-up.
 */
function markFired(job, tz) {
  const h = load();
  h[job] = nowParts(tz).date;
  save(h);
}

/**
 * On boot: run any job whose scheduled slot passed within its grace window
 * today but never fired (e.g. the container was restarting at cron time).
 *
 * Job shape: { job, tz, hour, min, dows: [0-6], graceMin?, when?, run }
 */
async function catchUpMissedJobs(jobs) {
  for (const j of jobs) {
    const { date, minutes, dow } = nowParts(j.tz);
    const slotMin = j.hour * 60 + (j.min || 0);

    if (!j.dows.includes(dow)) continue;
    if (minutes < slotMin) continue;                       // slot not reached yet
    if (minutes - slotMin > (j.graceMin || 90)) continue;  // too stale to post late
    if (load()[j.job] === date) continue;                  // already fired today
    if (j.when && !j.when()) continue;                     // extra guard

    console.log(`[CatchUp] ${j.job} missed its ${j.hour}:${String(j.min || 0).padStart(2, '0')} ${j.tz} slot — running now`);
    markFired(j.job, j.tz);
    try {
      await j.run();
    } catch (err) {
      console.error(`[CatchUp] ${j.job} error:`, err.message);
    }
  }
}

module.exports = { markFired, catchUpMissedJobs };

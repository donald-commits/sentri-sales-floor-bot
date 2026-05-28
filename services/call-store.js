const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '../data/call-log.json');

/**
 * Load today's call log from disk.
 * Structure: { date: "YYYY-MM-DD", calls: [ { id, userId, duration, direction, status, createdAt } ] }
 */
function loadCallLog() {
  const todayStr = new Date().toISOString().split('T')[0];
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (data.date === todayStr) return data;
  } catch {}
  // New day or no file — start fresh
  return { date: todayStr, calls: [] };
}

function saveCallLog(log) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(log, null, 2));
}

/**
 * Record a call from a webhook event.
 * Returns true if this is a new call, false if duplicate.
 */
function recordCall(callData) {
  const log = loadCallLog();

  // Reset if it's a new day
  const todayStr = new Date().toISOString().split('T')[0];
  if (log.date !== todayStr) {
    log.date = todayStr;
    log.calls = [];
  }

  // Deduplicate by call ID
  if (log.calls.some(c => c.id === callData.id)) return false;

  // Calculate duration: prefer media[0].duration, then timestamps, then callData.duration
  let duration = 0;
  if (callData.media && callData.media.length > 0 && callData.media[0].duration) {
    duration = callData.media[0].duration;
  } else if (callData.answeredAt && callData.completedAt) {
    duration = Math.round((new Date(callData.completedAt) - new Date(callData.answeredAt)) / 1000);
  } else if (callData.createdAt && callData.completedAt) {
    duration = Math.round((new Date(callData.completedAt) - new Date(callData.createdAt)) / 1000);
  } else if (callData.duration) {
    duration = callData.duration;
  }

  log.calls.push({
    id: callData.id,
    userId: callData.userId || null,
    answeredBy: callData.answeredBy || null,
    initiatedBy: callData.initiatedBy || null,
    phoneNumberId: callData.phoneNumberId || null,
    duration: duration,
    direction: callData.direction || null,
    status: callData.status || null,
    createdAt: callData.createdAt || new Date().toISOString(),
  });

  saveCallLog(log);
  return true;
}

/**
 * Get call stats per userId from today's stored calls.
 * Returns Map<userId, { calls, talkTimeSeconds }>
 */
function getTodayStats() {
  const log = loadCallLog();
  const todayStr = new Date().toISOString().split('T')[0];

  // If log is from a different day, return empty
  if (log.date !== todayStr) return new Map();

  const stats = new Map();
  for (const call of log.calls) {
    const userId = call.userId || call.answeredBy || call.initiatedBy;
    if (!userId) continue;

    if (!stats.has(userId)) {
      stats.set(userId, { calls: 0, talkTimeSeconds: 0 });
    }
    const entry = stats.get(userId);
    entry.calls++;
    entry.talkTimeSeconds += call.duration || 0;
  }
  return stats;
}

module.exports = { loadCallLog, saveCallLog, recordCall, getTodayStats };

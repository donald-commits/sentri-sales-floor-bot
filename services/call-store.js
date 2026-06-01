const fs = require('fs');
const path = require('path');

// Use Railway volume (/data) if available, otherwise local data/ directory
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '../data');
const STORE_FILE = path.join(DATA_DIR, 'call-log.json');

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

  // Deduplicate: same event ID OR same conversation + user + same minute
  const existing = log.calls.find(c => c.id === callData.id);
  if (existing) {
    // Update duration if new value is higher
    let newDuration = 0;
    if (callData.createdAt && callData.completedAt) {
      newDuration = Math.round((new Date(callData.completedAt) - new Date(callData.createdAt)) / 1000);
    }
    if (newDuration > existing.duration) {
      existing.duration = newDuration;
      saveCallLog(log);
    }
    return false;
  }

  // Also dedup by conversationId + userId + createdAt (rounded to minute)
  const convId = callData.conversationId;
  const userId = callData.userId || callData.answeredBy || callData.initiatedBy;
  const createdMinute = callData.createdAt ? callData.createdAt.substring(0, 16) : null; // YYYY-MM-DDTHH:MM
  if (convId && userId && createdMinute) {
    const dupByConvo = log.calls.find(c =>
      c.conversationId === convId &&
      (c.userId === userId || c.answeredBy === userId || c.initiatedBy === userId) &&
      c.createdAt?.substring(0, 16) === createdMinute
    );
    if (dupByConvo) {
      // Update duration if new value is higher
      let newDuration = 0;
      if (callData.createdAt && callData.completedAt) {
        newDuration = Math.round((new Date(callData.completedAt) - new Date(callData.createdAt)) / 1000);
      }
      if (newDuration > dupByConvo.duration) {
        dupByConvo.duration = newDuration;
        saveCallLog(log);
      }
      return false;
    }
  }

  // Calculate duration: use completedAt - createdAt to match Quo's "Time on calls"
  // This includes ring time + talk time, matching the Quo analytics dashboard
  let duration = 0;
  if (callData.createdAt && callData.completedAt) {
    duration = Math.round((new Date(callData.completedAt) - new Date(callData.createdAt)) / 1000);
  } else if (callData.duration) {
    duration = callData.duration;
  } else if (callData.media && callData.media.length > 0 && callData.media[0].duration) {
    duration = callData.media[0].duration;
  }

  log.calls.push({
    id: callData.id,
    userId: callData.userId || null,
    answeredBy: callData.answeredBy || null,
    initiatedBy: callData.initiatedBy || null,
    phoneNumberId: callData.phoneNumberId || null,
    conversationId: callData.conversationId || null,
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

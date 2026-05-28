/**
 * Format minutes as "Xh Ym"
 */
function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Format currency (e.g., 12500 -> "$12,500")
 */
function formatMoney(amount) {
  return '$' + Math.round(amount).toLocaleString('en-US');
}

/**
 * Format percentage (e.g., 0.42 -> "42%")
 */
function formatPercent(decimal) {
  return Math.round(decimal * 100) + '%';
}

/**
 * Get status emoji based on progress toward target.
 */
function progressEmoji(progress) {
  if (progress >= 0.8) return '\u{1F7E2}'; // green
  if (progress >= 0.5) return '\u{1F7E1}'; // yellow
  return '\u{1F534}'; // red
}

/**
 * Get rank emoji for position.
 */
function rankEmoji(position) {
  if (position === 0) return '\u{1F947}'; // gold
  if (position === 1) return '\u{1F948}'; // silver
  if (position === 2) return '\u{1F949}'; // bronze
  return `#${position + 1}`;
}

/**
 * Get start of current week (Sunday).
 */
function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = now.getDate() - day;
  const sunday = new Date(now.getFullYear(), now.getMonth(), diff);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

/**
 * Get start of current month.
 */
function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

module.exports = { formatTime, formatMoney, formatPercent, progressEmoji, rankEmoji, getWeekStart, getMonthStart };

const fs = require('fs');
const path = require('path');
const milestones = require('../data/milestones.json');

const TRACKER_FILE = path.join(__dirname, '../data/milestone-history.json');

/**
 * Load milestone history (which milestones have already been announced).
 */
function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Save milestone history.
 */
function saveHistory(history) {
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(history, null, 2));
}

/**
 * Check if an agent has hit any new milestones.
 * @param {string} agentName - Agent's display name
 * @param {number} totalSales - Lifetime total sales
 * @param {number} weekSales - Sales this week
 * @param {number} saleRevenue - Revenue of the current sale (for revenue milestones)
 * @returns {Array} Array of milestone messages to announce
 */
function checkMilestones(agentName, totalSales, weekSales, saleRevenue) {
  const history = loadHistory();
  if (!history[agentName]) history[agentName] = { sales: [], revenue: [], weekly: [] };

  const agentHistory = history[agentName];
  const newMilestones = [];

  // Check total sales milestones
  for (const m of milestones.sales) {
    if (totalSales >= m.count && !agentHistory.sales.includes(m.count)) {
      agentHistory.sales.push(m.count);
      newMilestones.push(m.message);
    }
  }

  // Check revenue milestones (single sale)
  for (const m of milestones.revenue) {
    if (saleRevenue >= m.amount && !agentHistory.revenue.includes(m.amount)) {
      agentHistory.revenue.push(m.amount);
      newMilestones.push(m.message);
    }
  }

  // Check weekly milestones
  for (const m of milestones.weekly) {
    const weekKey = `${m.count}_${getWeekKey()}`;
    if (weekSales >= m.count && !agentHistory.weekly.includes(weekKey)) {
      agentHistory.weekly.push(weekKey);
      newMilestones.push(m.message);
    }
  }

  saveHistory(history);
  return newMilestones;
}

function getWeekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNum}`;
}

module.exports = { checkMilestones };

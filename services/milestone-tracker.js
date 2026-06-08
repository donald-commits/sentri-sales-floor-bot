const fs = require('fs');
const path = require('path');
const milestones = require('../data/milestones.json');

const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '../data');
const TRACKER_FILE = path.join(DATA_DIR, 'milestone-history.json');

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveHistory(history) {
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(history, null, 2));
}

/**
 * Check if an agent has hit any new milestones.
 * @param {string} agentName - Agent's display name
 * @param {number} totalSales - Lifetime total sales
 * @param {number} weekSales - Sales this week
 * @param {number} saleRevenue - Revenue of the current sale
 * @param {boolean} isHomeBuild - Whether this sale is a home build
 * @returns {Array} Array of { message, type } objects to announce
 */
function checkMilestones(agentName, totalSales, weekSales, saleRevenue, isHomeBuild = false) {
  const history = loadHistory();
  if (!history[agentName]) history[agentName] = { sales: [], revenue: [], weekly: [], homeBuildRevenue: [], homeBuildCount: [] };
  // Ensure new keys exist for older history entries
  if (!history[agentName].homeBuildRevenue) history[agentName].homeBuildRevenue = [];
  if (!history[agentName].homeBuildCount) history[agentName].homeBuildCount = [];

  const h = history[agentName];
  const newMilestones = [];

  // Regular sales milestones
  for (const m of milestones.sales) {
    if (totalSales >= m.count && !h.sales.includes(m.count)) {
      h.sales.push(m.count);
      newMilestones.push({ message: m.message, type: 'regular' });
    }
  }

  if (isHomeBuild) {
    // Home build revenue milestones (much higher tiers)
    for (const m of milestones.homeBuildRevenue) {
      if (saleRevenue >= m.amount && !h.homeBuildRevenue.includes(m.amount)) {
        h.homeBuildRevenue.push(m.amount);
        newMilestones.push({ message: m.message, type: 'homeBuild' });
      }
    }

    // Home build count milestones
    // We track total home builds by counting how many homeBuildRevenue milestones triggered with count=1
    // Actually, we need the total passed in. For now, use the count milestone check.
    for (const m of milestones.homeBuildCount) {
      // We don't have totalHomeBuilds passed in, so we check based on the milestone key
      // The first home build milestone (count: 1) fires on ANY home build if not already fired
      const key = `hb_${m.count}`;
      if (!h.homeBuildCount.includes(key)) {
        // For count=1, always fire on first home build
        // For higher counts, we'd need a totalHomeBuilds param — skip for now unless count=1
        if (m.count === 1) {
          h.homeBuildCount.push(key);
          newMilestones.push({ message: m.message, type: 'homeBuild' });
        }
      }
    }
  } else {
    // Regular revenue milestones (for non-home-build sales)
    for (const m of milestones.revenue) {
      if (saleRevenue >= m.amount && !h.revenue.includes(m.amount)) {
        h.revenue.push(m.amount);
        newMilestones.push({ message: m.message, type: 'regular' });
      }
    }
  }

  // Weekly milestones
  for (const m of milestones.weekly) {
    const weekKey = `${m.count}_${getWeekKey()}`;
    if (weekSales >= m.count && !h.weekly.includes(weekKey)) {
      h.weekly.push(weekKey);
      newMilestones.push({ message: m.message, type: 'regular' });
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

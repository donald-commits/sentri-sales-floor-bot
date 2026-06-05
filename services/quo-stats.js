const config = require('../config');
const { getScrapedCallStats } = require('../schedulers/quo-scraper');

/**
 * Get stats for all mapped agents from the Quo scraped data.
 * This reads from quo-scraped-stats.json which is populated by the scraper.
 */
async function getAgentCallStats(agents, date = new Date()) {
  return getScrapedCallStats(agents, config);
}

module.exports = { getAgentCallStats };

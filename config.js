const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  discord: {
    token: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    salesCategoryId: process.env.DISCORD_SALES_CATEGORY_ID || null,
  },

  notion: {
    apiKey: process.env.Sentri_Notion_API_Key,
    leadsDbId: '2f518d01-e1b6-8002-b83a-e4022123e913',
  },

  quo: {
    apiKey: process.env['Quo_API-Key'] || process.env.QUO_API_KEY,
    baseUrl: 'https://api.openphone.com/v1',
  },

  // Daily targets (fireable metrics)
  targets: {
    callsPerDay: 50,
    talkTimeMinutes: 120, // 2 hours
  },

  // Thresholds for accountability
  accountability: {
    // Below this % of target at noon = DM warning
    noonWarningThreshold: 0.4,
    // Below this % at noon = public call-out
    noonCriticalThreshold: 0.25,
  },

  // Polling intervals (ms)
  polling: {
    salesCheck: 3 * 60 * 1000,   // 3 minutes
    callStats: 10 * 60 * 1000,   // 10 minutes
  },

  // Timezone for all schedules
  timezone: 'America/Chicago', // CT
};

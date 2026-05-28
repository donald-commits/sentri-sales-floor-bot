const axios = require('axios');
const config = require('../config');
const { getTodayStats } = require('./call-store');

const api = axios.create({
  baseURL: config.quo.baseUrl,
  headers: { Authorization: config.quo.apiKey },
});

/**
 * Get all users in the Quo account (paginated).
 */
async function getUsers() {
  const allUsers = [];
  let pageToken = null;
  do {
    const params = {};
    if (pageToken) params.pageToken = pageToken;
    const res = await api.get('/users', { params });
    allUsers.push(...(res.data.data || []));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  return allUsers;
}

/**
 * Get all phone number IDs in the account.
 */
async function getPhoneNumbers() {
  const res = await api.get('/phone-numbers');
  return res.data.data || [];
}

/**
 * Get stats for all mapped agents from the webhook-populated call store.
 * This is instant — no API calls needed, reads from local file.
 */
async function getAgentCallStats(agents, date = new Date()) {
  const callStats = getTodayStats();

  return agents
    .filter(a => a.active && a.quoUserId)
    .map(agent => {
      const raw = callStats.get(agent.quoUserId) || { calls: 0, talkTimeSeconds: 0 };
      const talkTimeMinutes = Math.round(raw.talkTimeSeconds / 60);
      return {
        name: agent.name,
        discordId: agent.discordId,
        calls: raw.calls,
        talkTimeMinutes,
        callTarget: config.targets.callsPerDay,
        talkTimeTarget: config.targets.talkTimeMinutes,
        callProgress: raw.calls / config.targets.callsPerDay,
        talkTimeProgress: talkTimeMinutes / config.targets.talkTimeMinutes,
      };
    })
    .sort((a, b) => b.calls - a.calls);
}

module.exports = { getUsers, getPhoneNumbers, getAgentCallStats };

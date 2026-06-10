const axios = require('axios');
const config = require('../config');

const api = axios.create({
  baseURL: 'https://api.notion.com/v1',
  headers: {
    Authorization: `Bearer ${config.notion.apiKey}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  },
});

const CALL_LOG_DB_ID = 'b3809080-3268-48c9-a1e4-f137bf76a6e6';

/**
 * Get call stats per rep for a given date from the Notion call log.
 * Returns array sorted by calls descending, matching the format other code expects.
 */
async function getCallStatsForDate(agents, date = new Date()) {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

  // Query all calls for this date
  const allCalls = [];
  let cursor;
  do {
    const body = {
      filter: { property: 'Call Date', date: { equals: dateStr } },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const res = await api.post(`/databases/${CALL_LOG_DB_ID}/query`, body);
    allCalls.push(...res.data.results);
    cursor = res.data.has_more ? res.data.next_cursor : undefined;
    await new Promise(r => setTimeout(r, 350));
  } while (cursor);

  // Aggregate by Rep name
  const byRep = {};
  for (const call of allCalls) {
    const rep = call.properties.Rep?.select?.name;
    if (!rep) continue;
    const duration = call.properties['Duration (s)']?.number || 0;
    const talkMin = call.properties['Talk Minutes']?.number || 0;
    if (!byRep[rep]) byRep[rep] = { calls: 0, durationSec: 0, talkMinutes: 0 };
    byRep[rep].calls++;
    byRep[rep].durationSec += duration;
    byRep[rep].talkMinutes += talkMin;
  }

  // Map to agent format
  return agents
    .filter(a => a.active && a.team !== 'admin')
    .map(agent => {
      const stats = byRep[agent.name] || { calls: 0, durationSec: 0, talkMinutes: 0 };
      const talkTimeMinutes = Math.round(stats.talkMinutes);
      return {
        name: agent.name,
        discordId: agent.discordId,
        calls: stats.calls,
        talkTimeMinutes,
        callTarget: config.targets.callsPerDay,
        talkTimeTarget: config.targets.talkTimeMinutes,
        callProgress: stats.calls / config.targets.callsPerDay,
        talkTimeProgress: talkTimeMinutes / config.targets.talkTimeMinutes,
      };
    })
    .sort((a, b) => b.calls - a.calls);
}

module.exports = { getCallStatsForDate };

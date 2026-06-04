const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');
const { loadAgents, addAgent } = require('../utils/agent-store');

const channelIds = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/channel-ids.json'), 'utf8'));
const SENTRI_ROLE_ID = channelIds.salesAgentRole;
const PLUSONE_ROLE_ID = channelIds.plusOneAgentRole;

/**
 * Sync Discord role members with agents.json.
 * - Anyone with the Sentri Agent or PlusOne Agent role who isn't in agents.json gets added.
 * - Tries to find their Quo and Notion IDs by matching email.
 * - Logs results to console.
 */
async function syncAgentsFromRoles(client) {
  try {
    console.log('[AgentSync] Starting role-based agent sync...');

    const guild = await client.guilds.fetch(config.discord.guildId);
    const members = await guild.members.fetch();
    const currentAgents = loadAgents();

    // Get Quo users
    const quoApi = axios.create({ baseURL: config.quo.baseUrl, headers: { Authorization: config.quo.apiKey } });
    let quoUsers = [];
    let pt = null;
    do {
      const params = {};
      if (pt) params.pageToken = pt;
      const res = await quoApi.get('/users', { params });
      quoUsers.push(...(res.data.data || []));
      pt = res.data.nextPageToken || null;
    } while (pt);

    // Get Notion users
    const notionApi = axios.create({
      baseURL: 'https://api.notion.com/v1',
      headers: { Authorization: `Bearer ${config.notion.apiKey}`, 'Notion-Version': '2022-06-28' },
    });
    const notionRes = await notionApi.get('/users');
    const notionUsers = (notionRes.data.results || []).filter(u => u.type === 'person');

    let added = 0;
    let reactivated = 0;
    let alreadyActive = 0;

    for (const member of members.values()) {
      if (member.user.bot) continue;

      const hasSentriRole = member.roles.cache.has(SENTRI_ROLE_ID);
      const hasPlusOneRole = member.roles.cache.has(PLUSONE_ROLE_ID);

      if (!hasSentriRole && !hasPlusOneRole) continue;

      const team = hasSentriRole ? 'sentri' : 'plusone';
      const existing = currentAgents.find(a => a.discordId === member.user.id);

      if (existing && existing.active) {
        alreadyActive++;
        continue;
      }

      // Try to match by display name to find Quo/Notion IDs
      const displayName = member.displayName.toLowerCase();
      const username = member.user.username.toLowerCase();

      const quoMatch = quoUsers.find(u =>
        displayName.includes(u.firstName?.toLowerCase()) ||
        username.includes(u.firstName?.toLowerCase())
      );

      const notionMatch = notionUsers.find(u => {
        const notionName = u.name?.toLowerCase() || '';
        return displayName.includes(notionName.split(' ')[0]) ||
          (quoMatch?.email && u.person?.email === quoMatch.email);
      });

      if (existing && !existing.active) {
        // Reactivate
        addAgent({
          name: existing.name,
          discordId: member.user.id,
          notionUserId: existing.notionUserId || notionMatch?.id || '',
          quoUserId: existing.quoUserId || quoMatch?.id || '',
          team: team,
          role: existing.role,
        });
        reactivated++;
        console.log(`[AgentSync] Reactivated: ${existing.name} (${team})`);
      } else {
        // New agent
        const name = quoMatch
          ? `${quoMatch.firstName} ${quoMatch.lastName}`
          : member.displayName;

        addAgent({
          name: name,
          discordId: member.user.id,
          notionUserId: notionMatch?.id || '',
          quoUserId: quoMatch?.id || '',
          team: team,
          role: 'agent',
        });
        added++;
        console.log(`[AgentSync] Added new agent: ${name} (${team}) | Quo: ${quoMatch?.id || 'MISSING'} | Notion: ${notionMatch?.id || 'MISSING'}`);
      }
    }

    // Check for agents in agents.json who NO LONGER have either role
    const updatedAgents = loadAgents();
    for (const agent of updatedAgents) {
      if (!agent.active || agent.role === 'admin') continue;
      if (!agent.discordId) continue;

      const member = members.get(agent.discordId);
      if (!member) continue;

      const hasRole = member.roles.cache.has(SENTRI_ROLE_ID) || member.roles.cache.has(PLUSONE_ROLE_ID);
      if (!hasRole) {
        console.log(`[AgentSync] WARNING: ${agent.name} is active in agents.json but has NO sales role in Discord`);
      }
    }

    console.log(`[AgentSync] Complete: ${added} added, ${reactivated} reactivated, ${alreadyActive} already active`);
  } catch (err) {
    console.error('[AgentSync] Error:', err.message);
  }
}

module.exports = { syncAgentsFromRoles };

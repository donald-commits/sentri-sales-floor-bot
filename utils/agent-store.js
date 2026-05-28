const fs = require('fs');
const path = require('path');

const AGENTS_FILE = path.join(__dirname, '../data/agents.json');

function loadAgents() {
  const data = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8'));
  return data.agents;
}

function saveAgents(agents) {
  const data = { _comment: 'Agent identity mapping. Add new agents here or via /add-agent command.', agents };
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2));
}

function getActiveAgents() {
  return loadAgents().filter(a => a.active);
}

function getSentriAgents() {
  return loadAgents().filter(a => a.active && a.team === 'sentri');
}

function getPlusOneAgents() {
  return loadAgents().filter(a => a.active && a.team === 'plusone');
}

function findByDiscordId(discordId) {
  return loadAgents().find(a => a.discordId === discordId);
}

function findByNotionId(notionId) {
  return loadAgents().find(a => a.notionUserId === notionId);
}

function addAgent({ name, discordId, notionUserId, quoUserId, team = 'sentri', role = 'agent' }) {
  const agents = loadAgents();
  const existing = agents.find(a => a.discordId === discordId);
  if (existing) {
    Object.assign(existing, { name, notionUserId, quoUserId, team, role, active: true });
  } else {
    agents.push({ name, discordId, notionUserId, quoUserId, team, role, active: true });
  }
  saveAgents(agents);
}

function removeAgent(discordId) {
  const agents = loadAgents();
  const agent = agents.find(a => a.discordId === discordId);
  if (agent) {
    agent.active = false;
    saveAgents(agents);
    return agent;
  }
  return null;
}

module.exports = { loadAgents, getActiveAgents, getSentriAgents, getPlusOneAgents, findByDiscordId, findByNotionId, addAgent, removeAgent };

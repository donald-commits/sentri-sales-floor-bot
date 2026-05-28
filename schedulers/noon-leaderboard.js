const quoStats = require('../services/quo-stats');
const { getSentriAgents } = require('../utils/agent-store');
const { callLeaderboardEmbed, accountabilityDmEmbed } = require('../utils/embeds');
const config = require('../config');

/**
 * Post the midday call/talk time leaderboard and DM lagging agents.
 * @param {Client} client - Discord client
 * @param {string} channelId - Channel to post leaderboard
 */
async function runNoonCheck(client, channelId) {
  try {
    const agents = getSentriAgents();
    const stats = await quoStats.getAgentCallStats(agents);

    if (stats.length === 0) {
      console.log('[NoonCheck] No active agents with Quo IDs — skipping');
      return;
    }

    // Post leaderboard to channel
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const embed = callLeaderboardEmbed(stats, 'MIDDAY CALL CHECK');
    await channel.send({ embeds: [embed] });

    // DM agents who are severely behind
    for (const agent of stats) {
      const progress = Math.min(agent.callProgress, agent.talkTimeProgress);
      if (progress < config.accountability.noonWarningThreshold && agent.discordId) {
        try {
          const user = await client.users.fetch(agent.discordId);
          const dmEmbed = accountabilityDmEmbed(agent);
          await user.send({ embeds: [dmEmbed] });
          await new Promise(r => setTimeout(r, 1000));
        } catch (dmErr) {
          console.error(`[NoonCheck] Could not DM ${agent.name}:`, dmErr.message);
        }
      }
    }

    console.log(`[NoonCheck] Posted leaderboard, ${stats.length} agents tracked`);
  } catch (err) {
    console.error('[NoonCheck] Error:', err.message);
  }
}

module.exports = { runNoonCheck };

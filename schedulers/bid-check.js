const { EmbedBuilder } = require('discord.js');
const notionStats = require('../services/notion-stats');
const { getActiveAgents } = require('../utils/agent-store');
const { formatPercent } = require('../utils/formatters');

const BID_TARGET = 5;

/**
 * Post bid sent leaderboard to #accountability.
 * Counts leads with Bid Sent Date = today, per agent.
 */
async function runBidCheck(client, channelId, title = 'BID SENT CHECK') {
  try {
    const agents = getActiveAgents();
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

    const bidStats = [];

    for (const agent of agents) {
      if (!agent.notionUserId) continue;
      const stats = await notionStats.getAgentSalesStats(agent.notionUserId, new Date(todayStr), new Date(todayStr + 'T23:59:59'));
      bidStats.push({
        name: agent.name,
        discordId: agent.discordId,
        bids: stats.bids,
        progress: stats.bids / BID_TARGET,
      });
      await new Promise(r => setTimeout(r, 350));
    }

    bidStats.sort((a, b) => b.bids - a.bids);

    if (bidStats.length === 0) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const lines = bidStats.map(a => {
      let emoji;
      if (a.bids >= BID_TARGET) emoji = '\u{1F7E2}';
      else if (a.bids >= Math.floor(BID_TARGET * 0.5)) emoji = '\u{1F7E1}';
      else emoji = '\u{1F534}';

      const mention = a.discordId ? `<@${a.discordId}>` : a.name;
      return `${emoji} ${mention} — **${a.bids}** bids sent`;
    });

    const behindAgents = bidStats.filter(a => a.bids < Math.floor(BID_TARGET * 0.4));
    let footer = '';
    if (behindAgents.length > 0) {
      const mentions = behindAgents
        .map(a => a.discordId ? `<@${a.discordId}>` : a.name)
        .join(' ');
      footer = `\n\n${mentions} — Get those bids out!`;
    }

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`\u{1F4E8} ${title} \u{1F4E8}`)
      .setDescription(lines.join('\n') + footer)
      .addFields(
        { name: 'Target', value: `${BID_TARGET} bids per day`, inline: false },
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log(`[BidCheck] Posted ${title}, ${bidStats.length} agents tracked`);
  } catch (err) {
    console.error('[BidCheck] Error:', err.message);
  }
}

module.exports = { runBidCheck };

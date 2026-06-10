const { getCallStatsForDate } = require('../services/call-log-stats');
const { getActiveAgents } = require('../utils/agent-store');
const { callLeaderboardEmbed } = require('../utils/embeds');
const { EmbedBuilder } = require('discord.js');
const { formatTime } = require('../utils/formatters');
const config = require('../config');

/**
 * Post end-of-day call check with final numbers.
 */
async function runEodCheck(client, channelId) {
  try {
    const agents = getActiveAgents();
    const stats = await getCallStatsForDate(agents);

    if (stats.length === 0) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const embed = callLeaderboardEmbed(stats, 'END OF DAY FINAL NUMBERS');
    await channel.send({ content: '@everyone', embeds: [embed] });

    // Summary: who hit vs missed
    const hitTarget = stats.filter(a => a.calls >= config.targets.callsPerDay && a.talkTimeMinutes >= config.targets.talkTimeMinutes);
    const missed = stats.filter(a => a.calls < config.targets.callsPerDay || a.talkTimeMinutes < config.targets.talkTimeMinutes);

    const summaryLines = [];
    if (hitTarget.length > 0) {
      summaryLines.push(`\u{2705} **Hit target:** ${hitTarget.map(a => a.name).join(', ')}`);
    }
    if (missed.length > 0) {
      summaryLines.push(`\u{274C} **Missed target:** ${missed.map(a => `${a.name} (${a.calls} calls, ${formatTime(a.talkTimeMinutes)})`).join(', ')}`);
    }

    if (summaryLines.length > 0) {
      const summary = new EmbedBuilder()
        .setColor(hitTarget.length >= missed.length ? 0x00ff88 : 0xe74c3c)
        .setDescription(summaryLines.join('\n'))
        .setFooter({ text: `${hitTarget.length}/${stats.length} agents hit their numbers today` });
      await channel.send({ embeds: [summary] });
    }

    // DM agents who missed target
    for (const agent of missed) {
      if (!agent.discordId) continue;
      try {
        const user = await client.users.fetch(agent.discordId);
        const dmEmbed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('\u{1F4CB} End of Day — Missed Target')
          .setDescription(
            `**${agent.name}**, you finished today at **${agent.calls} calls** and **${formatTime(agent.talkTimeMinutes)}** talk time.\n\n` +
            `Target was **${config.targets.callsPerDay} calls** / **${formatTime(config.targets.talkTimeMinutes)}**.\n\n` +
            `Tomorrow's a new day — come in ready to grind. \u{1F4AA}`
          )
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] });
        await new Promise(r => setTimeout(r, 1000));
      } catch (dmErr) {
        console.error(`[EodCheck] Could not DM ${agent.name}:`, dmErr.message);
      }
    }

    console.log(`[EodCheck] Posted final numbers. ${hitTarget.length} hit, ${missed.length} missed.`);
  } catch (err) {
    console.error('[EodCheck] Error:', err.message);
  }
}

module.exports = { runEodCheck };

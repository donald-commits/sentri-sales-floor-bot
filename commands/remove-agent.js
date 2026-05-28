const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { removeAgent } = require('../utils/agent-store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-agent')
    .setDescription('Deactivate a sales agent from tracking (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The Discord user to remove')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const removed = removeAgent(user.id);

    if (removed) {
      await interaction.reply({
        content: `Deactivated **${removed.name}** from sales floor tracking.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `${user.displayName || user.username} is not in the agent registry.`,
        ephemeral: true,
      });
    }
  },
};

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addAgent } = require('../utils/agent-store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add-agent')
    .setDescription('Map a new sales agent (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The Discord user to map')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('notion_id')
        .setDescription('Their Notion user ID')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('quo_id')
        .setDescription('Their Quo (OpenPhone) user ID')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('team')
        .setDescription('Which team (affects call tracking)')
        .setRequired(true)
        .addChoices(
          { name: 'Sentri (full call tracking)', value: 'sentri' },
          { name: 'PlusOne (sales only, no call tracking)', value: 'plusone' },
        ))
    .addStringOption(option =>
      option.setName('role')
        .setDescription('Role (agent or admin)')
        .addChoices(
          { name: 'Agent', value: 'agent' },
          { name: 'Admin', value: 'admin' },
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const notionUserId = interaction.options.getString('notion_id');
    const quoUserId = interaction.options.getString('quo_id');
    const team = interaction.options.getString('team');
    const role = interaction.options.getString('role') || 'agent';

    addAgent({
      name: user.displayName || user.username,
      discordId: user.id,
      notionUserId,
      quoUserId,
      team,
      role,
    });

    await interaction.reply({
      content: `Added **${user.displayName || user.username}** as a ${role}.\n` +
        `Discord: ${user.id}\nNotion: ${notionUserId}\nQuo: ${quoUserId}`,
      ephemeral: true,
    });
  },
};

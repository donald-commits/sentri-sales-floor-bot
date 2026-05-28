/**
 * Creates "PlusOne Sales Agent" role and renames "Sales Agent" to "Sentri Sales Agent".
 */
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const IDS_FILE = path.join(__dirname, 'data/channel-ids.json');
const channelIds = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(config.discord.guildId);
  console.log('Connected to:', guild.name);

  // Rename existing "Sales Agent" role to "Sentri Sales Agent"
  const existingRole = await guild.roles.fetch(channelIds.salesAgentRole);
  if (existingRole) {
    await existingRole.setName('Sentri Sales Agent');
    await existingRole.setColor('#2ecc71'); // green
    console.log('Renamed "Sales Agent" -> "Sentri Sales Agent"');
  }

  // Create "PlusOne Sales Agent" role
  let plusOneRole = guild.roles.cache.find(r => r.name === 'PlusOne Sales Agent');
  if (!plusOneRole) {
    plusOneRole = await guild.roles.create({
      name: 'PlusOne Sales Agent',
      color: '#e67e22', // orange
      reason: 'Sales Floor Bot - PlusOne agent role',
    });
    console.log('Created "PlusOne Sales Agent" role:', plusOneRole.id);
  }

  // Update channel permissions - PlusOne agents can see the Sales Floor category too
  const category = await guild.channels.fetch(channelIds.category);
  await category.permissionOverwrites.create(plusOneRole, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  });
  console.log('Added PlusOne role permissions to Sales Floor category');

  // Save role ID
  channelIds.plusOneAgentRole = plusOneRole.id;
  fs.writeFileSync(IDS_FILE, JSON.stringify(channelIds, null, 2));

  console.log('Done.');
  client.destroy();
});

client.login(config.discord.token);

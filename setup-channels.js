/**
 * One-time setup script: creates the Sales Floor category, channels, roles.
 * Run once: node setup-channels.js
 * Saves created channel IDs to data/channel-ids.json for the bot to use.
 */
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const IDS_FILE = path.join(__dirname, 'data/channel-ids.json');

async function setup() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await client.login(config.discord.token);
  console.log(`Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(config.discord.guildId);
  console.log(`Connected to guild: ${guild.name}`);

  // Create roles
  console.log('Creating roles...');
  let salesAgentRole = guild.roles.cache.find(r => r.name === 'Sales Agent');
  if (!salesAgentRole) {
    salesAgentRole = await guild.roles.create({
      name: 'Sales Agent',
      color: '#3498db',
      reason: 'Sales Floor Bot setup',
    });
  }

  let salesLeadRole = guild.roles.cache.find(r => r.name === 'Sales Lead');
  if (!salesLeadRole) {
    salesLeadRole = await guild.roles.create({
      name: 'Sales Lead',
      color: '#f39c12',
      reason: 'Sales Floor Bot setup',
    });
  }

  // Create category
  console.log('Creating category...');
  let category = guild.channels.cache.find(c => c.name === 'SALES FLOOR' && c.type === ChannelType.GuildCategory);
  if (!category) {
    category = await guild.channels.create({
      name: 'SALES FLOOR',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: salesAgentRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: salesLeadRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
        },
      ],
    });
  }

  // Create text channels
  console.log('Creating text channels...');
  const textChannels = [
    { name: 'sales-announcements', topic: 'Real-time sale alerts and milestone shoutouts' },
    { name: 'leaderboards', topic: 'Scheduled leaderboards — calls, sales, revenue' },
    { name: 'accountability', topic: 'Daily call/talk time checks' },
    { name: 'general-chat', topic: 'Team banter, hype, memes — keep it professional' },
    { name: 'wins-and-goals', topic: 'Post your wins and set personal goals' },
  ];

  const channelIds = {};

  for (const ch of textChannels) {
    let existing = guild.channels.cache.find(c => c.name === ch.name && c.parentId === category.id);
    if (!existing) {
      existing = await guild.channels.create({
        name: ch.name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: ch.topic,
      });
    }
    channelIds[ch.name] = existing.id;
    console.log(`  #${ch.name} -> ${existing.id}`);
  }

  // Create voice channels
  console.log('Creating voice channels...');
  const voiceChannels = ['The Bullpen', 'Team Meeting', '1-on-1 Coaching'];

  for (const name of voiceChannels) {
    let existing = guild.channels.cache.find(c => c.name === name && c.parentId === category.id);
    if (!existing) {
      existing = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: category.id,
      });
    }
    channelIds[name.toLowerCase().replace(/\s+/g, '-')] = existing.id;
    console.log(`  �� ${name} -> ${existing.id}`);
  }

  // Save IDs
  channelIds.category = category.id;
  channelIds.salesAgentRole = salesAgentRole.id;
  channelIds.salesLeadRole = salesLeadRole.id;

  fs.writeFileSync(IDS_FILE, JSON.stringify(channelIds, null, 2));
  console.log(`\nSaved channel IDs to ${IDS_FILE}`);
  console.log('\nSetup complete! You can now run the bot with: npm start');

  client.destroy();
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});

require('dotenv').config();
const { REST, Routes, PermissionsBitField } = require('discord.js');

// Verify token is loaded
if (!process.env.TOKEN) {
  console.error('Missing TOKEN in .env file');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('Missing CLIENT_ID in .env file');
  process.exit(1);
}

const commands = [
  {
    name: 'poll',
    description: 'Create a poll with up to 25 options',
    options: [
      {
        name: 'question',
        description: 'The poll question (max 256 characters)',
        type: 3, // STRING
        required: true,
        max_length: 256
      },
      {
        name: 'options',
        description: 'Comma-separated list of options (max 25, each option max 100 chars)',
        type: 3, // STRING
        required: true,
        validate: value => value.split(',').every(opt => opt.trim().length <= 100 && opt.trim().length > 0)
      },
      {
        name: 'multiple',
        description: 'Allow multiple votes per user? (default: false)',
        type: 5, // BOOLEAN
        required: false
      },
      {
        name: 'anonymous',
        description: 'Make votes private? (default: false)',
        type: 5, // BOOLEAN
        required: false
      },
      {
        name: 'duration',
        description: 'Duration - leave blank for no expiration',
        type: 3, // STRING
        required: false,
        choices: [
          { name: '1 day', value: '1d' },
          { name: '2 days', value: '2d' },
          { name: '3 days', value: '3d' },
          { name: '1 week', value: '1w' },
          { name: '2 weeks', value: '2w' }
        ]
      },
      {
        name: 'maxvotes',
        description: 'Max votes per user if multiple is enabled (1-25, default: 1)',
        type: 4, // INTEGER
        required: false,
        min_value: 1,
        max_value: 25
      }
    ],
    dm_permission: false // Only usable in guilds
  },
  {
    name: 'pollresults',
    description: 'View detailed results of a poll (Admin only)',
    options: [
      {
        name: 'poll_id',
        description: 'The ID of the poll to view (found in poll footer)',
        type: 3, // STRING
        required: true
      }
    ],
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
  },
  {
    name: 'endpoll',
    description: 'End a poll early (Admin only)',
    options: [
      {
        name: 'poll_id',
        description: 'The ID of the poll to end',
        type: 3, // STRING
        required: true
      }
    ],
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error deploying commands:', error);

    // More detailed error logging
    if (error.code === 50001) {
      console.error('Missing Access - Check your bot has application.commands scope');
    } else if (error.code === 50013) {
      console.error('Missing Permissions - Check your bot has proper permissions');
    }
  }
})();
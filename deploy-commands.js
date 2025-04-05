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
    description: 'Create a poll',
    options: [
      {
        name: 'question',
        description: 'The poll question',
        type: 3, // STRING
        required: true
      },
      {
        name: 'options',
        description: 'Comma-separated list of options (max 10)',
        type: 3, // STRING
        required: true
      },
      {
        name: 'multiple',
        description: 'Allow multiple votes per user?',
        type: 5, // BOOLEAN
        required: false
      },
      {
        name: 'anonymous',
        description: 'Make votes private?',
        type: 5, // BOOLEAN
        required: false
      },
      {
        name: 'duration',
        description: 'Duration (e.g., 1h, 30m) - leave blank for no expiration',
        type: 3, // STRING
        required: false
      }
    ]
  },
  {
    name: 'pollresults',
    description: 'View detailed results of a poll (Admin only)',
    options: [
      {
        name: 'poll_id',
        description: 'The ID of the poll to view',
        type: 3, // STRING
        required: true
      }
    ],
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString() // Admin only
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
  }
})();
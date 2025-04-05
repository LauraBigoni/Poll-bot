require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const PollManager = require('./utils/pollManager');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

const pollManager = new PollManager();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('Creating polls');
});

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        if (interaction.commandName === 'poll') {
          await pollManager.handlePollCommand(interaction); // Use the instance
        }
        if (interaction.commandName === 'pollresults') {
            const pollId = interaction.options.getString('poll_id');
            await pollManager.showAdminResults(interaction, pollId);
        }
      } else if (interaction.isButton()) {
        await pollManager.handleButtonInteraction(interaction); // Use the instance
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    // Add any message-based commands here if needed
});

client.login(process.env.TOKEN).catch(console.error);

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});
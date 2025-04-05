const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const ms = require('ms');

class PollManager {
  constructor() {
    this.activePolls = new Map();
  }

  async handlePollCommand(interaction) {
    const question = interaction.options.getString('question');
    const options = interaction.options.getString('options').split(',');
    const allowMultiple = interaction.options.getBoolean('multiple') || false;
    const anonymous = interaction.options.getBoolean('anonymous') || false;
    const duration = interaction.options.getString('duration');
    const maxVotes = allowMultiple ? Math.max(1, interaction.options.getInteger('maxVotes') || 1) : 1;
  
    const pollId = `poll-${interaction.id}`; // Store this for consistent use

    const footerText = [
      duration ? `Ends in ${duration}` : null,
      allowMultiple ? 'Multiple votes' : 'Single vote',
      anonymous ? 'Private' : 'Public',
      `Poll ID: ${pollId}`
    ].filter(Boolean).join(' | ');

    const embed = new EmbedBuilder()
      .setTitle(question)
      .setDescription(options.map((opt, i) => `${i + 1}. ${opt.trim()}`).join('\n'))
      .setFooter({ text: `${footerText} | Total votes: 0` })
      .setColor('#5865F2');

    const actionRow = new ActionRowBuilder().addComponents(
      options.map((_, i) => new ButtonBuilder()
        .setCustomId(`${pollId}-${i}`) // Use consistent pollId format
        .setLabel(`${i + 1}`)
        .setStyle(ButtonStyle.Secondary))
    );

    await interaction.reply({ embeds: [embed], components: [actionRow] });

    this.activePolls.set(pollId, {
      message: await interaction.fetchReply(),
      options,
      votes: Array(options.length).fill(0),
      voters: new Map(),
      allowMultiple,
      anonymous,
      maxVotes,
      endTime: duration ? Date.now() + ms(duration) : null,
      voteDetails: {},
      id: pollId // Store ID in poll object
    });

    if (duration) {
      setTimeout(() => this.endPoll(pollId), ms(duration));
    }
  }

  async handleButtonInteraction(interaction) {
    // Split the custom ID correctly (poll-123456789012345678-0)
    const [prefix, interactionId, optionIndex] = interaction.customId.split('-');
    const pollId = `${prefix}-${interactionId}`;  // Reconstruct full poll ID

    const poll = this.activePolls.get(pollId);  // Now correctly matches stored ID

    if (!poll) {
      return interaction.reply({
        content: "This poll has expired or doesn't exist",
        ephemeral: true
      });
    }

    // Rest of the method remains the same...
    const userId = interaction.user.id;
    const userVotes = poll.voters.get(userId) || [];
    const isAlreadyVoted = userVotes.includes(optionIndex);
    const optionName = poll.options[optionIndex];

    // Toggle vote logic
    if (isAlreadyVoted) {
      poll.votes[optionIndex]--;
      poll.voters.set(userId, userVotes.filter(v => v !== optionIndex));
      if (poll.voteDetails?.[optionIndex]) {
        poll.voteDetails[optionIndex] = poll.voteDetails[optionIndex]
          .filter(u => u !== userId);
      }
    } else {
      // New vote validation logic
      const maxAllowed = poll.allowMultiple ? poll.maxVotes : 1;
      
      if (userVotes.length >= maxAllowed) {
        return interaction.reply({
          content: poll.allowMultiple 
            ? `You can only vote ${maxAllowed} times in this poll!`
            : "This poll only allows one vote per user!",
          ephemeral: true
        });
      }

      poll.votes[optionIndex]++;
      poll.voters.set(userId, [...userVotes, optionIndex]);

      if (!poll.voteDetails) poll.voteDetails = {};
      if (!poll.voteDetails[optionIndex]) poll.voteDetails[optionIndex] = [];
      poll.voteDetails[optionIndex].push(userId);
    }

    const updatedEmbed = this.createPublicEmbed(poll, interaction);
    await poll.message.edit({ embeds: [updatedEmbed] });

    await interaction.reply({
      content: `You ${isAlreadyVoted ? "unvoted" : "voted"} for: ${optionName}`,
      ephemeral: true
    });
  }

  createPublicEmbed(poll) { // Remove interaction parameter
    if (poll.anonymous) {
      // Private poll - ALWAYS show basic view to everyone
      return new EmbedBuilder()
        .setTitle(poll.message.embeds[0].title)
        .setDescription(
          poll.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')
        )
        .setFooter({
          text: [
            poll.endTime ? `Ends in ${ms(poll.endTime - Date.now(), { long: true })}` : null,
            poll.allowMultiple ? 'Multiple votes allowed' : 'Single vote only',
            'Private Poll - Votes are confidential',
            `Poll ID: ${poll.id}`
          ].filter(Boolean).join(' | ')
        })
        .setColor('#5865F2');
    }

    // Public poll view - show everything
    return new EmbedBuilder()
      .setTitle(poll.message.embeds[0].title)
      .setDescription(
        poll.options.map((opt, i) => {
          let line = `${i + 1}. ${opt} - ${poll.votes[i]} vote${poll.votes[i] !== 1 ? 's' : ''}`;
          if (poll.voteDetails?.[i]?.length > 0) {
            line += `\n↳ Voters: ${poll.voteDetails[i].map(id => `<@${id}>`).join(', ')}`;
          }
          return line;
        }).join('\n')
      )
      .setFooter({
        text: [
          poll.endTime ? `Ends in ${ms(poll.endTime - Date.now(), { long: true })}` : null,
          poll.allowMultiple ? 'Multiple votes' : 'Single vote',
          'Public Poll',
          `Poll ID: ${poll.id}`,
          `Total votes: ${poll.votes.reduce((a, b) => a + b, 0)}`
        ].filter(Boolean).join(' | ')
      })
      .setColor(poll.votes.some(v => v > 0) ? '#57F287' : '#5865F2');
  }

  async showAdminResults(interaction, pollId) {
    const poll = this.activePolls.get(pollId);
    if (!poll || !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "Poll not found or access denied", ephemeral: true });
    }

    const adminEmbed = new EmbedBuilder()
      .setTitle(`[ADMIN] ${poll.message.embeds[0].title}`)
      .setDescription(
        poll.options.map((opt, i) => {
          let line = `${i + 1}. ${opt} - ${poll.votes[i]} votes`;
          if (poll.voteDetails?.[i]?.length > 0) {
            line += `\n↳ Voters: ${poll.voteDetails[i].map(id => `<@${id}>`).join(', ')}`;
          }
          return line;
        }).join('\n\n')
      )
      .setFooter({ text: `Poll ID: ${poll.id} | Total votes: ${poll.votes.reduce((a, b) => a + b, 0)}` })
      .setColor('#FFA500');

    await interaction.reply({ embeds: [adminEmbed], ephemeral: true });
  }

  async endPoll(pollId) {
    const poll = this.activePolls.get(pollId);
    if (!poll) return;

    const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
    const results = poll.options.map((opt, i) => ({
      name: opt,
      value: `${poll.votes[i]} votes (${totalVotes ? Math.round((poll.votes[i] / totalVotes) * 100) : 0}%)`,
      inline: true
    }));

    const resultEmbed = new EmbedBuilder()
      .setTitle('Poll Results')
      .setDescription(`**${poll.message.embeds[0].title}**`)
      .addFields(results)
      .setFooter({ text: `Poll ID: ${poll.id} | Total votes: ${totalVotes}` })
      .setColor('#57F287');

    await poll.message.edit({
      embeds: [resultEmbed],
      components: []
    });

    this.activePolls.delete(pollId);
  }
}

module.exports = PollManager;
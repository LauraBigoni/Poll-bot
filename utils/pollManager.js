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

    // Remove time footer if no duration specified
    const footerText = [
      duration ? `Ends in ${duration}` : null,
      allowMultiple ? 'Multiple votes' : 'Single vote',
      anonymous ? 'Private' : 'Public'
    ].filter(Boolean).join(' | ');

    const embed = new EmbedBuilder()
      .setTitle(question)
      .setDescription(options.map((opt, i) => `${i + 1}. ${opt.trim()}`).join('\n'))
      .setFooter({ text: `${footerText}${footerText ? ' | ' : ''}Poll ID: poll-${interaction.id} | Total votes: 0` })
      .setColor('#5865F2');

    // Create buttons for each option
    const actionRow = new ActionRowBuilder().addComponents(
      options.map((_, i) => new ButtonBuilder()
        .setCustomId(`poll-${interaction.id}-${i}`)
        .setLabel(`${i + 1}`)
        .setStyle(ButtonStyle.Secondary))
    );

    await interaction.reply({ embeds: [embed], components: [actionRow] });

    // Store poll data
    this.activePolls.set(`poll-${interaction.id}`, {
      message: await interaction.fetchReply(),
      options,
      votes: Array(options.length).fill(0),
      voters: new Map(), // Tracks user votes as {userId: [optionIndices]}
      allowMultiple,
      anonymous,
      endTime: duration ? Date.now() + ms(duration) : null,
      voteDetails: {}
    });

    // Set timeout only if duration exists
    if (duration) {
      setTimeout(() => this.endPoll(`poll-${interaction.id}`), ms(duration));
    }
  }

  async handleButtonInteraction(interaction) {
    const [_, pollId, optionIndex] = interaction.customId.split('-');
    const poll = this.activePolls.get(`poll-${pollId}`);

    if (!poll) {
      return interaction.reply({
        content: "This poll has expired or doesn't exist",
        ephemeral: true
      });
    }

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
      if (!poll.allowMultiple && userVotes.length > 0) {
        return interaction.reply({
          content: "This poll only allows one vote per user!",
          ephemeral: true
        });
      }
      poll.votes[optionIndex]++;
      poll.voters.set(userId, [...userVotes, optionIndex]);

      // Track detailed votes (always track, even for private polls)
      if (!poll.voteDetails) poll.voteDetails = {};
      if (!poll.voteDetails[optionIndex]) poll.voteDetails[optionIndex] = [];
      poll.voteDetails[optionIndex].push(userId);
    }

    // Update the public poll display (shows no voter info)
    const publicEmbed = this.createPublicEmbed(poll, interaction);
    await poll.message.edit({ embeds: [publicEmbed] });

    // Send private confirmation to voter
    await interaction.reply({
      content: `You ${isAlreadyVoted ? "unvoted" : "voted"} for: ${optionName}`,
      ephemeral: true
    });
  }

  createPublicEmbed(poll, interaction = null) {
    // For private polls - different views for admins vs regular users
    if (poll.anonymous) {
      const isAdmin = interaction?.member?.permissions?.has(PermissionsBitField.Flags.Administrator);

      // ADMIN VIEW - shows all details
      if (isAdmin) {
        return new EmbedBuilder()
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
          .setFooter({
            text: [
              poll.endTime ? `Ends in ${ms(poll.endTime - Date.now(), { long: true })}` : null,
              poll.allowMultiple ? 'Multiple votes' : 'Single vote',
              'Private Poll (Admin View)',
              `Total votes: ${poll.votes.reduce((a, b) => a + b, 0)}`
            ].filter(Boolean).join(' | ')
          })
          .setColor('#FFA500'); // Orange for admin view
      }

      // REGULAR USER VIEW - shows no vote counts
      return new EmbedBuilder()
        .setTitle(poll.message.embeds[0].title)
        .setDescription(
          poll.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')
        )
        .setFooter({
          text: [
            poll.endTime ? `Ends in ${ms(poll.endTime - Date.now(), { long: true })}` : null,
            poll.allowMultiple ? 'Multiple votes allowed' : 'Single vote only',
            'Private Poll - Only you can see your vote'
          ].filter(Boolean).join(' | ')
        })
        .setColor('#5865F2'); // Blue for private polls
    }

    // Public poll view (unchanged)
    return new EmbedBuilder()
      .setTitle(poll.message.embeds[0].title)
      .setDescription(
        poll.options.map((opt, i) =>
          `${i + 1}. ${opt} - ${poll.votes[i]} vote${poll.votes[i] !== 1 ? 's' : ''}`
        ).join('\n')
      )
      .setFooter({
        text: [
          poll.endTime ? `Ends in ${ms(poll.endTime - Date.now(), { long: true })}` : null,
          poll.allowMultiple ? 'Multiple votes' : 'Single vote',
          'Public Poll',
          `Total votes: ${poll.votes.reduce((a, b) => a + b, 0)}`
        ].filter(Boolean).join(' | ')
      })
      .setColor(poll.votes.some(v => v > 0) ? '#57F287' : '#5865F2');
  }

  async showAdminResults(interaction, pollId) {
    const poll = this.activePolls.get(pollId);
    if (!poll) return interaction.reply({ content: "Poll not found", ephemeral: true });
    
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "Admin only command", ephemeral: true });
    }

    const adminEmbed = this.createPublicEmbed(poll, interaction);
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
      .setFooter({ text: `Total votes: ${totalVotes}` })
      .setColor('#57F287');

    await poll.message.edit({
      embeds: [resultEmbed],
      components: []
    });

    this.activePolls.delete(pollId);
  }
}

module.exports = PollManager;
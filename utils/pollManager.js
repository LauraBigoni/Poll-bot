const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const ms = require('ms');

class PollManager {
  constructor() {
    this.activePolls = new Map();
  }

  async handlePollCommand(interaction) {
    try {
      // Extract all options from the interaction
      const question = interaction.options.getString('question');
      const options = interaction.options.getString('options').split(',').map(opt => opt.trim());
      const allowMultiple = interaction.options.getBoolean('multiple') || false;
      const anonymous = interaction.options.getBoolean('anonymous') || false;
      const duration = interaction.options.getString('duration');
      const maxVotes = allowMultiple ? Math.max(1, interaction.options.getInteger('maxvotes') || 1) : 1;

      const pollId = `poll-${interaction.id}`;

      // Validate options
      if (options.length > 25) {
        return interaction.reply({
          content: '❌ You can only have up to 25 options in a poll!',
          ephemeral: true
        });
      }

      if (options.some(opt => opt.length > 100)) {
        return interaction.reply({
          content: '❌ Each option must be 100 characters or less!',
          ephemeral: true
        });
      }

      // Build the poll embed
      const footerText = [
        duration ? `Ends in ${duration}` : null,
        allowMultiple ? `Multiple votes (max ${maxVotes})` : 'Single vote',
        anonymous ? 'Private' : 'Public',
        `Poll ID: ${pollId}`
      ].filter(Boolean).join(' | ');

      const embed = new EmbedBuilder()
        .setTitle(question.length > 256 ? question.substring(0, 253) + '...' : question)
        .setDescription(options.map((opt, i) => `${i + 1}. ${opt}`).join('\n'))
        .setFooter({ text: `${footerText}` })
        .setColor('#5865F2');

      // Create button rows dynamically
      const buttonRows = this.createButtonRows(options, pollId);

      // Send the poll
      const reply = await interaction.reply({
        embeds: [embed],
        components: buttonRows,
        fetchReply: true
      });

      // Store the poll data
      this.activePolls.set(pollId, {
        message: reply,
        options,
        votes: Array(options.length).fill(0),
        voters: new Map(),
        allowMultiple,
        anonymous,
        maxVotes,
        endTime: duration ? Date.now() + ms(duration) : null,
        voteDetails: {},
        id: pollId,
        creatorId: interaction.user.id
      });

      // Set timeout if duration is specified
      if (duration) {
        setTimeout(() => this.endPoll(pollId), ms(duration));
      }

    } catch (error) {
      console.error('Error handling poll command:', error);
      if (!interaction.replied) {
        await interaction.reply({
          content: '❌ An error occurred while creating the poll!',
          ephemeral: true
        });
      }
    }
  }

  createButtonRows(options, pollId) {
    const rows = [];
    const buttonsPerRow = 5;
    
    for (let i = 0; i < options.length; i += buttonsPerRow) {
      const row = new ActionRowBuilder();
      const chunk = options.slice(i, i + buttonsPerRow);
      
      chunk.forEach((_, index) => {
        const optionIndex = i + index;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`${pollId}-${optionIndex}`)
            .setLabel(`${optionIndex + 1}`)
            .setStyle(ButtonStyle.Secondary)
        );
      });
      
      rows.push(row);
    }
    
    return rows;
  }

  async handleButtonInteraction(interaction) {
    try {
      const [prefix, interactionId, optionIndex] = interaction.customId.split('-');
      const pollId = `${prefix}-${interactionId}`;
      const poll = this.activePolls.get(pollId);

      if (!poll) {
        return interaction.reply({
          content: "❌ This poll has expired or doesn't exist!",
          ephemeral: true
        });
      }

      // Check if poll has ended
      if (poll.endTime && Date.now() > poll.endTime) {
        await this.endPoll(pollId);
        return interaction.reply({
          content: "❌ This poll has already ended!",
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
        // New vote validation logic
        if (userVotes.length >= poll.maxVotes) {
          return interaction.reply({
            content: poll.allowMultiple 
              ? `❌ You can only vote ${poll.maxVotes} times in this poll!`
              : "❌ This poll only allows one vote per user!",
            ephemeral: true
          });
        }

        poll.votes[optionIndex]++;
        poll.voters.set(userId, [...userVotes, optionIndex]);

        if (!poll.voteDetails) poll.voteDetails = {};
        if (!poll.voteDetails[optionIndex]) poll.voteDetails[optionIndex] = [];
        poll.voteDetails[optionIndex].push(userId);
      }

      // Update the poll embed
      const updatedEmbed = this.createPublicEmbed(poll);
      await poll.message.edit({ embeds: [updatedEmbed] });

      await interaction.reply({
        content: `✅ You ${isAlreadyVoted ? "unvoted" : "voted"} for: ${optionName}`,
        ephemeral: true
      });

    } catch (error) {
      console.error('Error handling button interaction:', error);
      if (!interaction.replied) {
        await interaction.reply({
          content: '❌ An error occurred while processing your vote!',
          ephemeral: true
        });
      }
    }
  }

  createPublicEmbed(poll) {
    const totalVotes = poll.votes.reduce((a, b) => a + b, 0);

    if (poll.anonymous) {
      return new EmbedBuilder()
        .setTitle(poll.message.embeds[0].title)
        .setDescription(
          poll.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')
        )
        .setFooter({
          text: [
            poll.endTime ? `Ends in ${ms(poll.endTime - Date.now(), { long: true })}` : null,
            poll.allowMultiple ? `Multiple votes (max ${poll.maxVotes})` : 'Single vote only',
            'Private Poll - Votes are confidential',
            `Poll ID: ${poll.id}`
          ].filter(Boolean).join(' | ')
        })
        .setColor('#5865F2');
    }

    // Public poll view
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
          poll.allowMultiple ? `Multiple votes (max ${poll.maxVotes})` : 'Single vote',
          'Public Poll',
          `Poll ID: ${poll.id}`
        ].filter(Boolean).join(' | ')
      })
      .setColor(totalVotes > 0 ? '#57F287' : '#5865F2');
  }

  async showAdminResults(interaction, pollId) {
    try {
      const poll = this.activePolls.get(pollId);
      
      if (!poll) {
        return interaction.reply({ 
          content: "❌ Poll not found!", 
          ephemeral: true 
        });
      }

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ 
          content: "❌ You need administrator permissions to view these results!", 
          ephemeral: true 
        });
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
        .setFooter({ 
          text: `Poll ID: ${poll.id}`
        })
        .setColor('#FFA500');

      await interaction.reply({ embeds: [adminEmbed], ephemeral: true });

    } catch (error) {
      console.error('Error showing admin results:', error);
      await interaction.reply({
        content: '❌ An error occurred while fetching poll results!',
        ephemeral: true
      });
    }
  }

  async endPoll(pollId) {
    try {
      const poll = this.activePolls.get(pollId);
      if (!poll) return;

      const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
      const results = poll.options.map((opt, i) => ({
        name: opt,
        value: `${poll.votes[i]} vote${poll.votes[i] !== 1 ? 's' : ''} (${totalVotes ? Math.round((poll.votes[i] / totalVotes) * 100) : 0}%)`,
        inline: true
      }));

      const resultEmbed = new EmbedBuilder()
        .setTitle('📊 Poll Results')
        .setDescription(`**${poll.message.embeds[0].title}**`)
        .addFields(results)
        .setFooter({ 
          text: `Poll ID: ${poll.id}`
        })
        .setColor('#57F287');

      await poll.message.edit({
        embeds: [resultEmbed],
        components: []
      });

      this.activePolls.delete(pollId);

    } catch (error) {
      console.error('Error ending poll:', error);
    }
  }

  async handleEndPollCommand(interaction) {
    try {
      const pollId = interaction.options.getString('poll_id');
      const poll = this.activePolls.get(pollId);

      if (!poll) {
        return interaction.reply({
          content: "❌ Poll not found or already ended!",
          ephemeral: true
        });
      }

      // Check permissions
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && 
          interaction.user.id !== poll.creatorId) {
        return interaction.reply({
          content: "❌ You don't have permission to end this poll!",
          ephemeral: true
        });
      }

      await this.endPoll(pollId);
      await interaction.reply({
        content: `✅ Successfully ended poll: ${poll.message.embeds[0].title}`,
        ephemeral: true
      });

    } catch (error) {
      console.error('Error handling end poll command:', error);
      await interaction.reply({
        content: '❌ An error occurred while ending the poll!',
        ephemeral: true
      });
    }
  }
}

module.exports = PollManager;
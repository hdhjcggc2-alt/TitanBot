import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("رمي عملة معدنية (صورة أو كتابة)."),
  category: 'Fun',

  async execute(interaction, config, client) {
    const isHeads = Math.random() < 0.5;
    const result = isHeads ? "صورة" : "كتابة";
    const emoji = isHeads ? "🪙" : "🔮";

    const embed = successEmbed(
      "صورة أم كتابة؟",
      `استقرت العملة على... **${result}** ${emoji}!`,
    );

    await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    logger.debug(`Flip command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
  },
};

import { SlashCommandBuilder } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("رمي النرد باستخدام الصيغة القياسية (مثال: 2d20 أو 1d6 + 5).")
    .addStringOption((option) =>
      option
        .setName("notation")
        .setDescription("صيغة النرد المطلوبة (مثال: 2d6 أو 1d20 + 4)")
        .setRequired(true)
        .setMaxLength(50),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const notation = interaction.options
      .getString("notation")
      .toLowerCase()
      .replace(/\s/g, "");

    const match = notation.match(/^(\d*)d(\d+)([\+\-]\d+)?$/);

    if (!match) {
      throw new TitanBotError(
        `Invalid dice notation: ${notation}`,
        ErrorTypes.USER_INPUT,
        'صيغة غير صحيحة. يرجى استخدام صيغة مثل `1d20` أو `3d6+5`.'
      );
    }

    const numDice = parseInt(match[1] || "1", 10);
    const numSides = parseInt(match[2], 10);
    const modifier = parseInt(match[3] || "0", 10);

    if (numDice < 1 || numDice > 20) {
      throw new TitanBotError(
        `Too many dice requested: ${numDice}`,
        ErrorTypes.VALIDATION,
        'يرجى إبقاء عدد النرد بين 1 و 20.'
      );
    }

    if (numSides < 1 || numSides > 1000) {
      throw new TitanBotError(
        `Invalid number of sides: ${numSides}`,
        ErrorTypes.VALIDATION,
        'يرجى إبقاء عدد الأوجه بين 1 و 1000.'
      );
    }

    let rolls = [];
    let totalRoll = 0;

    for (let i = 0; i < numDice; i++) {
      const roll = Math.floor(Math.random() * numSides) + 1;
      rolls.push(roll);
      totalRoll += roll;
    }

    const finalTotal = totalRoll + modifier;

    const resultsDetail =
      numDice > 1 ? `**الرميات:** ${rolls.join(" + ")}\n` : "";
    const modifierText = modifier !== 0 ? `+ (${modifier})` : "";

    const embed = successEmbed(
      `🎲 رمي ${numDice}d${numSides}${modifier !== 0 ? match[3] : ""}`,
      `${resultsDetail}**المجموع الكلي:** ${totalRoll}${modifierText} = **${finalTotal}**`,
    );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Roll command executed by user ${interaction.user.id} with notation ${notation} in guild ${interaction.guildId}`);
  },
};

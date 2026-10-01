import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("بدء معركة نصية وهمية بنظام 1 ضد 1.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("المستخدم المراد قتاله.")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const challenger = interaction.user;
    const opponent = interaction.options.getUser("opponent");

    if (challenger.id === opponent.id) {
      const embed = warningEmbed(
        "⚔️ تحدٍ غير صالح",
        `**${challenger.username}**، لا يمكنك قتال نفسك! هذا تعادل قبل أن يبدأ النزال حتى.`
      );
      return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }

    if (opponent.bot) {
      const embed = warningEmbed(
        "⚔️ خصم غير صالح",
        "لا يمكنك قتال البوتات! تحد شخصاً حقيقياً بدلاً من ذلك."
      );
      return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }

    const winner = rand(0, 1) === 0 ? challenger : opponent;
    const loser = winner.id === challenger.id ? opponent : challenger;
    const rounds = rand(3, 7);
    const damage = rand(10, 50);

    const log = [];
    log.push(
      `💥 يتحدى **${challenger.username}** اللاعب **${opponent.username}** في نزال! (أفضل من ${rounds} جولات)`,
    );

    for (let i = 1; i <= rounds; i++) {
      const attacker = rand(0, 1) === 0 ? challenger : opponent;
      const target = attacker.id === challenger.id ? opponent : challenger;
      const action = [
        "يوجه لكمة عشوائية",
        "يسدد ضربة حرجة",
        "يستخدم تعويذة ضعيفة",
        "يتصدى للهجوم ويهجم بالمقابل",
      ][rand(0, 3)];
      log.push(
        `\n**الجولة ${i}:** ${attacker.username} ${action} على ${target.username} متسبباً في ضرر بمقدار ${rand(1, damage)}!`,
      );
    }

    const outcomeText = log.join("\n");
    const winnerText = `👑 لقد هزم **${winner.username}** اللاعب ${loser.username} وحقق الانتصار!`;
    const fullDescription = `${outcomeText}\n\n${winnerText}`;

    const description = fullDescription.length <= EMBED_DESCRIPTION_LIMIT
      ? fullDescription
      : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

    const embed = successEmbed(
      "🏆 انتهى النزال!",
      description
    );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Fight command executed between ${challenger.id} and ${opponent.id} in guild ${interaction.guildId}`);
  },
};

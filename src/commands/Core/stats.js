import { SlashCommandBuilder, version, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("عرض إحصائيات ومعلومات النظام والأداء للبوت"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      const totalGuilds = interaction.client.guilds.cache.size;
      const totalMembers = interaction.client.guilds.cache.reduce(
        (acc, guild) => acc + guild.memberCount,
        0,
      );
      const nodeVersion = process.version;

      const embed = createEmbed({ 
          title: "📊 إحصائيات النظام", 
          description: "مؤشرات الأداء والمعلومات الفنية في الوقت الفعلي." 
      }).addFields(
        { name: "السيرفرات", value: `${totalGuilds}`, inline: true },
        { name: "المستخدمين", value: `${totalMembers}`, inline: true },
        { name: "إصدار Node.js", value: `${nodeVersion}`, inline: true },
        { name: "إصدار Discord.js", value: `v${version}`, inline: true },
        {
          name: "استهلاك الذاكرة",
          value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} ميغابايت`,
          inline: true,
        },
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Stats command error:', error);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ title: 'خطأ في النظام', description: 'تعذر جلب إحصائيات النظام.', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

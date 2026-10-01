import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SUPPORT_SERVER_URL = "https://discord.gg/QnWNz2dKCE";

export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("الحصول على رابط سيرفر الدعم الفني للمساعدة"),

  async execute(interaction) {
    try {
      const supportButton = new ButtonBuilder()
        .setLabel("الانضمام لسيرفر الدعم الفني")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER_URL);

      const actionRow = new ActionRowBuilder().addComponents(supportButton);

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({ 
            title: "هل تحتاج إلى مساعدة؟", 
            description: "انضم إلى سيرفر الدعم الفني الرسمي الخاص بنا للحصول على المساعدة، الإبلاغ عن الأخطاء، أو اقتراح ميزات جديدة." 
          }),
        ],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Support command error:', error);
      
      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'خطأ في النظام', description: 'تعذر عرض معلومات الدعم الفني.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};

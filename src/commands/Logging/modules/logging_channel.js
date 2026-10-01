import { PermissionsBitField, ChannelType } from 'discord.js';
import { setLogChannel } from '../../../services/loggingService.js';
import { successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
const DESTINATION_LABELS = {
  audit: 'سجل التدقيق (Audit Log)',
  applications: 'التقديمات (Applications)',
  reports: 'البلاغات والتقارير (Reports)',
};

export default {
  prefixOnly: false,
  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'تحتاج إلى صلاحية **إدارة السيرفر** (Manage Server) لتكوين رومات السجلات.' });
      }

      await InteractionHelper.safeDefer(interaction, { ephemeral: true });

      const destination = interaction.options.getString('destination');
      const channel = interaction.options.getChannel('channel');
      const disable = interaction.options.getBoolean('disable') ?? false;

      if (disable) {
        await setLogChannel(client, interaction.guildId, destination, null);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            'تمت إزالة الروم',
            `تمت إزالة روم **${DESTINATION_LABELS[destination]}** بنجاح.`,
          )],
        });
      }

      if (!channel || channel.type !== ChannelType.GuildText) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'يرجى توفير روم نصي صالح.' });
      }

      const botPerms = channel.permissionsFor(interaction.guild.members.me);
      if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `أحتاج إلى صلاحيات **رؤية الروم** (ViewChannel)، **إرسال الرسائل** (SendMessages)، و **تضمين الروابط** (EmbedLinks) في الروم ${channel}.` });
      }

      await setLogChannel(client, interaction.guildId, destination, channel.id);

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
          'تم تحديث الروم',
          `سيتم الآن إرسال سجلات **${DESTINATION_LABELS[destination]}** إلى الروم ${channel}.\nاستخدم الأمر \`/logging dashboard\` لتبديل وتخصيص فئات الأحداث.`,
        )],
      });
    } catch (error) {
      logger.error('logging_channel error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'فشل في تحديث روم السجلات.' });
    }
  },
};

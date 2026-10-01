import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  buildCountingLeaderboard,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getExpectedCountValue,
} from '../../services/countingGameService.js';
import { logger } from '../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('إدارة لعبة العد في السيرفر')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('بدء لعبة العد في قناة نصية')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('القناة التي سيتم العد فيها')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('نظام العد المراد استخدامه')
            .setRequired(true)
            .addChoices(...getCountingSystemChoices()),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('تعطيل لعبة العد لهذا السيرفر'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('عرض حالة لعبة العد الحالية'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('إعادة تعيين تسلسل العد الحالي')
        .addIntegerOption((option) =>
          option
            .setName('start')
            .setDescription('الرقم الذي سيتم البدء به بعد إعادة التعيين')
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('leaderboard').setDescription('عرض لوحة المتصدرين في لعبة العد'),
    ),
  category: 'Fun',

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) {
        logger.warn('Count command defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'تحتاج إلى صلاحية **إدارة السيرفر (Manage Server)** لاستخدام هذا الأمر.' });
      }

      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();
      const config = await getCountingGameConfig(interaction.client, guildId);

      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const system = interaction.options.getString('system');
        if (!channel || channel.type !== ChannelType.GuildText) {
          return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'الرجاء اختيار قناة نصية للعبة العد.' });
        }

        if (config.enabled && config.channelId && config.channelId !== channel.id) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `يحتوي هذا السيرفر بالفعل على قناة عد نشطة مُكوّنة: <#${config.channelId}>. قم بتعطيل لعبة العد الحالية أولاً، أو استخدم تلك القناة الموجودة.` });
        }

        await activateCountingGame(interaction.client, guildId, channel.id, system);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'تم تفعيل لعبة العد',
              `لعبة العد مفعلة الآن في ${channel} باستخدام نظام **${getCountingSystemLabel(system)}**. يجب على اللاعبين العد التصاعدي بدءاً من **1** ولا يجوز إرسال رقمين متتاليين من نفس الشخص.`,
            ),
          ],
        });
      }

      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed('لعبة العد معطلة', 'لعبة العد معطلة بالفعل لهذا السيرفر.')],
          });
        }

        await disableCountingGame(interaction.client, guildId);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('لعبة العد معطلة', 'تم تعطيل لعبة العد بنجاح.')],
        });
      }

      if (subcommand === 'status') {
        const fields = [
          { name: 'مفعلة', value: config.enabled ? 'نعم' : 'لا', inline: true },
          { name: 'القناة', value: config.channelId ? `<#${config.channelId}>` : 'غير مُكوّنة', inline: true },
          { name: 'النظام', value: getCountingSystemLabel(config.system), inline: true },
          { name: 'العد القادم', value: getExpectedCountValue(config), inline: true },
          { name: 'السلسلة الحالية', value: `${config.currentStreak}`, inline: true },
          { name: 'أفضل سلسلة', value: `${config.bestStreak || 0}`, inline: true },
          { name: 'آخر مشارك', value: config.lastUserId ? `<@${config.lastUserId}>` : 'لا يوجد', inline: true },
        ];

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'حالة لعبة العد',
              description: 'نظرة عامة على إعدادات لعبة العد الحالية.',
              fields,
              color: 'primary',
            }),
          ],
        });
      }

      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'قم بتفعيل لعبة العد أولاً باستخدام الأمر `/count setup`.' });
        }

        const startNumber = interaction.options.getInteger('start') || 1;
        await resetCountingGame(interaction.client, guildId, startNumber);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'إعادة تعيين لعبة العد',
              `تم إعادة تعيين تسلسل العد. ابدأ مرة أخرى بالرقم **${startNumber}** في القناة <#${config.channelId}>.`,
            ),
          ],
        });
      }

      if (subcommand === 'leaderboard') {
        const leaderboard = buildCountingLeaderboard(config, interaction.guild);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'لوحة متصدرين لعبة العد',
              description: leaderboard.length > 0 ? leaderboard.join('\n') : 'لم يتم تسجيل أي أقام عد حتى الآن.',
              color: 'primary',
            }),
          ],
        });
      }

      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'الرجاء اختيار إجراء صحيح للعبة العد.' });
    } catch (error) {
      logger.error('Count command error:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'حدث خطأ ما أثناء إدارة لعبة العد.' });
    }
  },
};

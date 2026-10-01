import { PermissionsBitField, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('تم رفض الصلاحية')
                .setDescription('تحتاج إلى صلاحية **إدارة السيرفر** (Manage Server) لتكوين روم أعياد الميلاد.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const channel = interaction.options.getChannel('channel');
            const guildId = interaction.guildId;
            const guildConfig = await getGuildConfig(client, guildId);

            if (channel) {
                guildConfig.birthdayChannelId = channel.id;
                await setGuildConfig(client, guildId, guildConfig);
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('تم تفعيل إعلانات أعياد الميلاد')
                    .setDescription(`سيتم الآن نشر إعلانات أعياد الميلاد في الروم ${channel}.`);
                return InteractionHelper.safeReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                guildConfig.birthdayChannelId = null;
                await setGuildConfig(client, guildId, guildConfig);
                const embed = new EmbedBuilder()
                    .setColor(0xFFFF00)
                    .setTitle('تم تعطيل إعلانات أعياد الميلاد')
                    .setDescription('لم يتم تحديد روم — وعليه تم تعطيل إعلانات أعياد الميلاد.');
                return InteractionHelper.safeReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            logger.error('birthday_setchannel error:', error);
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⚠️ خطأ في الإعدادات')
                .setDescription('تعذر حفظ إعدادات روم أعياد الميلاد.');
            return InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

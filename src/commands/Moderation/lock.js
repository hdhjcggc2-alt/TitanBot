import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("lock")
        .setDescription(
            "قفل الروم الحالي (منع رتبة الجميع @everyone من إرسال الرسائل)",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "الإشراف",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Lock interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'lock'
            });
            return;
        }

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (currentPermissions.has(PermissionFlagsBits.SendMessages) === false) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `الروم ${channel} مقفل بالفعل.` });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: false },
                { type: 0, reason: `تم قفل الروم بواسطة ${interaction.user.tag}` },
            );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "قفل الروم",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'بدون فئة',
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔒 **تم قفل الروم**`,
                        `الروم ${channel} مقفل الآن. لا يمكن لأحد التحدث هنا بعد الآن.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Lock command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'حدث خطأ غير متوقع أثناء محاولة قفل الروم. تأكد من صلاحيات البوت (أحتاج إلى صلاحية إدارة الرومات - Manage Channels).' });
        }
    }
};

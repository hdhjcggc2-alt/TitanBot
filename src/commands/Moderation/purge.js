import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("حذف عدد محدد من الرسائل دفعة واحدة")
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("عدد الرسائل المراد حذفها (من 1 إلى 100)")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "الإشراف",
    abuseProtection: { maxAttempts: 5, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferSuccess) {
            logger.warn(`Purge interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'purge'
            });
            return;
        }

        const amount = interaction.options.getInteger("amount");
        const channel = interaction.channel;

        if (amount < 1 || amount > 100)
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'الرجاء تحديد رقم بين 1 و 100.' });

        try {
            const fetched = await channel.messages.fetch({ limit: amount });
            const deleted = await channel.bulkDelete(fetched, true);
            const deletedCount = deleted.size;

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "مسح رسائل",
                    target: `${channel} (${deletedCount} رسالة)`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `تم حذف ${deletedCount} رسالة`,
                    metadata: {
                        channelId: channel.id,
                        messageCount: deletedCount,
                        requestedAmount: amount,
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "تم مسح الرسائل",
                        `تم بنجاح حذف ${deletedCount} رسالة في ${channel}.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            setTimeout(() => {
                interaction.deleteReply().catch(err => 
                    logger.debug('Failed to auto-delete purge response:', err)
                );
            }, 3000);
        } catch (error) {
            logger.error('Purge command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'حدث خطأ غير متوقع أثناء عملية الحذف. ملاحظة: لا يمكن حذف الرسائل التي أقدم من 14 يوماً دفعة واحدة.' });
        }
    }
};

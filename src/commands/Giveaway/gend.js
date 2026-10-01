import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "إنهاء مسابقة نشطة فوراً واختيار الفائز (أو الفائزين).",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("معرف الرسالة (Message ID) الخاص بالمسابقة المراد إنهاؤها.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Giveaway command used outside guild',
                ErrorTypes.VALIDATION,
                'يمكن استخدام هذا الأمر داخل السيرفرات فقط.',
                { userId: interaction.user.id }
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'User lacks ManageGuild permission',
                ErrorTypes.PERMISSION,
                "تحتاج إلى صلاحية **إدارة السيرفر (Manage Server)** لإنهاء المسابقة.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway end initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotError(
                'Invalid message ID format',
                ErrorTypes.VALIDATION,
                'الرجاء إدخال معرف رسالة (Message ID) صحيح.',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new TitanBotError(
                `Giveaway not found: ${messageId}`,
                ErrorTypes.VALIDATION,
                "لم يتم العثور على أي مسابقة بهذا المعرف في قاعدة البيانات.",
                { messageId, guildId: interaction.guildId }
            );
        }

        const endResult = await endGiveawayService(
            interaction.client,
            giveaway,
            interaction.guildId,
            interaction.user.id
        );

        const updatedGiveaway = endResult.giveaway;
        const winners = endResult.winners;

        const channel = await interaction.client.channels.fetch(
            updatedGiveaway.channelId,
        ).catch(err => {
            logger.warn(`Could not fetch channel ${updatedGiveaway.channelId}:`, err.message);
            return null;
        });

        if (!channel || !channel.isTextBased()) {
            throw new TitanBotError(
                `Channel not found: ${updatedGiveaway.channelId}`,
                ErrorTypes.VALIDATION,
                "تعذر العثور على القناة التي أقيمت فيها المسابقة. ولكن تم تحديث حالة المسابقة.",
                { channelId: updatedGiveaway.channelId, messageId }
            );
        }

        const message = await channel.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(`Could not fetch message ${messageId}:`, err.message);
                return null;
            });

        if (!message) {
            throw new TitanBotError(
                `Message not found: ${messageId}`,
                ErrorTypes.VALIDATION,
                "تعذر العثور على رسالة المسابقة. ولكن تم تحديث حالة المسابقة.",
                { messageId, channelId: updatedGiveaway.channelId }
            );
        }

        await saveGiveaway(
            interaction.client,
            interaction.guildId,
            updatedGiveaway,
        );

        const newEmbed = createGiveawayEmbed(updatedGiveaway, "ended", winners);
        const newRow = createGiveawayButtons(true);

        await message.edit({
            content: "🎉 **انتهت المسابقة** 🎉",
            embeds: [newEmbed],
            components: [newRow],
        });

        if (winners.length > 0) {
            const winnerMentions = winners
                .map((id) => `<@${id}>`)
                .join(",");
            const winnerPingMsg = await channel.send({
                content: `🎉 تهانينا ${winnerMentions}! لقد فزتم بجائزة **${updatedGiveaway.prize}**! يرجى التواصل مع منظم المسابقة <@${updatedGiveaway.hostId}> لاستلام جائزتكم.`,
            });
            updatedGiveaway.winnerPingMessageId = winnerPingMsg.id;
            await saveGiveaway(interaction.client, interaction.guildId, updatedGiveaway);

            logger.info(`Giveaway ended with ${winners.length} winner(s): ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `انتهت المسابقة بفوز ${winners.length} مستخدم(ين)`,
                        channelId: channel.id,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: 'الجائزة',
                                value: updatedGiveaway.prize || 'جائزة غامضة!',
                                inline: true
                            },
                            {
                                name: 'الفائزون',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: 'عدد المشاركات',
                                value: endResult.participantCount.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway winner event:', logError);
            }
        } else {
            await channel.send({
                content: `انتهت المسابقة الخاصة بـ **${updatedGiveaway.prize}** بدون وجود مشاركات صحيحة.`,
            });
            logger.info(`Giveaway ended with no winners: ${messageId}`);
        }

        logger.info(`Giveaway successfully ended by ${interaction.user.tag}: ${messageId}`);

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "انتهت المسابقة ✅",
                    `تم إنهاء المسابقة لجائزة **${updatedGiveaway.prize}** بنجاح في القناة ${channel}. تم اختيار ${winners.length} فائز من أصل ${endResult.participantCount} مشارك.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

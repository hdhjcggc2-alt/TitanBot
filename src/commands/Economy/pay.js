import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, addMoney, removeMoney, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import EconomyService from '../../services/economyService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('تحويل وإرسال جزء من نقودك إلى مستخدم آخر')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('المستخدم المراد الدفع له')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('المبلغ المراد تحويله')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const senderId = interaction.user.id;
            const receiver = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");
            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Pay command initiated`, { 
                senderId, 
                receiverId: receiver.id,
                amount,
                guildId
            });

            if (receiver.bot) {
                throw createError(
                    "Cannot pay bot",
                    ErrorTypes.VALIDATION,
                    "لا يمكنك إرسال الأموال إلى بوت.",
                    { receiverId: receiver.id, isBot: true }
                );
            }
            
            if (receiver.id === senderId) {
                throw createError(
                    "Cannot pay self",
                    ErrorTypes.VALIDATION,
                    "لا يمكنك تحويل الأموال لنفسك.",
                    { senderId, receiverId: receiver.id }
                );
            }
            
            if (amount <= 0) {
                throw createError(
                    "Invalid payment amount",
                    ErrorTypes.VALIDATION,
                    "يجب أن يكون المبلغ أكبر من الصفر.",
                    { amount, senderId }
                );
            }

            const [senderData, receiverData] = await Promise.all([
                getEconomyData(client, guildId, senderId),
                getEconomyData(client, guildId, receiver.id)
            ]);

            if (!senderData) {
                throw createError(
                    "Failed to load sender economy data",
                    ErrorTypes.DATABASE,
                    "فشل تحميل بيانات الاقتصاد الخاصة بك. يرجى المحاولة مرة أخرى لاحقاً.",
                    { userId: senderId, guildId }
                );
            }
            
            if (!receiverData) {
                throw createError(
                    "Failed to load receiver economy data",
                    ErrorTypes.DATABASE,
                    "فشل تحميل بيانات الاقتصاد الخاصة بالمستلم. يرجى المحاولة مرة أخرى لاحقاً.",
                    { userId: receiver.id, guildId }
                );
            }

            const result = await EconomyService.transferMoney(
                client, 
                guildId, 
                senderId, 
                receiver.id, 
                amount
            );

            const updatedSenderData = await getEconomyData(client, guildId, senderId);
            const updatedReceiverData = await getEconomyData(client, guildId, receiver.id);

            const embed = successEmbed(
                'تم التحويل بنجاح',
                `لقد قمت بتحويل مبلغ **$${amount.toLocaleString()}** إلى اللاعب **${receiver.username}** بنجاح!`
            )
                .addFields(
                    {
                        name: "مبلغ التحويل",
                        value: `$${amount.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "رصيدك الجديد",
                        value: `$${updatedSenderData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                )
                .setFooter({
                    text: `تم الدفع إلى ${receiver.tag}`,
                    iconURL: receiver.displayAvatarURL(),
                });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info(`[ECONOMY] Payment sent successfully`, {
                senderId,
                receiverId: receiver.id,
                amount,
                senderBalance: updatedSenderData.wallet,
                receiverBalance: updatedReceiverData.wallet
            });

            try {
                const receiverEmbed = createEmbed({ 
                    title: "حوالة مالية واردة!", 
                    description: `قام **${interaction.user.username}** بإرسال مبلغ **$${amount.toLocaleString()}** إليك.` 
                }).addFields({
                    name: "رصيدك النقدي الجديد",
                    value: `$${updatedReceiverData.wallet.toLocaleString()}`,
                    inline: true,
                });
                await receiver.send({ embeds: [receiverEmbed] });
            } catch (e) {
                    logger.warn(`Could not DM user ${receiver.id}: ${e.message}`);
            }
    }, { command: 'pay' })
};

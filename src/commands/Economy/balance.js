import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('التحقق من رصيدك أو رصيد شخص آخر')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('العضو المراد التحقق من رصيده')
                .setRequired(false)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userOption = interaction.options.getUser("user");
        const targetUser = userOption || interaction.user;
        const guildId = interaction.guildId;

        logger.info(`[ECONOMY] Balance check - userOption: ${userOption?.id || 'null'}, targetUser: ${targetUser.id}, guildId: ${guildId}, isPrefix: ${!!interaction._commandStartTime}`);

        logger.debug(`[ECONOMY] Balance check for ${targetUser.id}`, { userId: targetUser.id, guildId });

        if (targetUser.bot) {
            throw createError(
                "Bot user queried for balance",
                ErrorTypes.VALIDATION,
                "البوتات لا تمتلك رصيداً مالياً في النظام."
            );
        }

        const userData = await getEconomyData(client, guildId, targetUser.id);

        logger.info(`[ECONOMY] Economy data retrieved - userData:`, userData);

        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "فشل في تحميل بيانات الاقتصاد. يرجى المحاولة مرة أخرى لاحقاً.",
                { userId: targetUser.id, guildId }
            );
        }

        const maxBank = getMaxBankCapacity(userData);

        const wallet = typeof userData.wallet === 'number' ? userData.wallet : 0;
        const bank = typeof userData.bank === 'number' ? userData.bank : 0;

            const embed = createEmbed({
                title: `رصيد ${targetUser.username}`,
                description: `إليك الحالة المالية الحالية لـ ${targetUser.username}.`,
            })
                .addFields(
                    {
                        name: "💵 الكاش (المحفظة)",
                        value: `$${wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 البنك",
                        value: `$${bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "💰 المجموع الكلي",
                        value: `$${(wallet + bank).toLocaleString()}`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: `بواسطة ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL(),
                });

            logger.info(`[ECONOMY] Balance retrieved`, { userId: targetUser.id, wallet, bank });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'balance' })
};

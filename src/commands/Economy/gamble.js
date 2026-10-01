import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const BASE_WIN_CHANCE = 0.4;
const CLOVER_WIN_BONUS = 0.1;
const CHARM_WIN_BONUS = 0.08;
const PAYOUT_MULTIPLIER = 2.0;
const GAMBLE_COOLDOWN = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('المقامرة بأموالك للحصول على فرصة لمضاعفتها')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('مبلغ النقود المراد المقامرة به')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const betAmount = interaction.options.getInteger("amount");
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "فشل تحميل بيانات الاقتصاد الخاصة بك. يرجى المحاولة مرة أخرى لاحقاً.",
                    { userId, guildId }
                );
            }

            const lastGamble = userData.lastGamble || 0;
            const inventory = userData.inventory || {};
            let cloverCount = inventory["lucky_clover"] || 0;
            let charmCount = inventory["lucky_charm"] || 0;

            if (now < lastGamble + GAMBLE_COOLDOWN) {
                const remaining = lastGamble + GAMBLE_COOLDOWN - now;
                const minutes = Math.floor(remaining / (1000 * 60));
                const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

                throw createError(
                    "Gamble cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `عليك الهدوء والانتظار قليلاً قبل المقامرة مرة أخرى. انتظر لمدة **${minutes} دقيقة و ${seconds} ثانية**.`,
                    { remaining, cooldownType: 'gamble' }
                );
            }

            if (userData.wallet < betAmount) {
                throw createError(
                    "Insufficient cash for gamble",
                    ErrorTypes.VALIDATION,
                    `أنت تملك $${userData.wallet.toLocaleString()} نقداً فقط، لكنك تحاول المراهنة بمبلغ $${betAmount.toLocaleString()}.`,
                    { required: betAmount, current: userData.wallet }
                );
            }

            let winChance = BASE_WIN_CHANCE;
            let cloverMessage = "";
            let usedClover = false;
            let usedCharm = false;

            if (cloverCount > 0) {
                winChance += CLOVER_WIN_BONUS;
                userData.inventory["lucky_clover"] -= 1;
                cloverMessage = `\n🍀 **تم استهلاك نفل الحظ (Lucky Clover):** تم تعزيز فرصة فوزك!`;
                usedClover = true;
            }
            
            else if (charmCount > 0) {
                winChance += CHARM_WIN_BONUS;
                userData.inventory["lucky_charm"] -= 1;
                cloverMessage = `\n🍀 **تم استخدام تعويذة الحظ (${charmCount - 1} استخدامات متبقية):** تم تعزيز فرصة فوزك!`;
                usedCharm = true;
            }

            const win = Math.random() < winChance;
            let cashChange = 0;
            let resultEmbed;

            if (win) {
                const amountWon = Math.floor(betAmount * PAYOUT_MULTIPLIER);
                cashChange = amountWon - betAmount;

                resultEmbed = successEmbed(
                    "🎉 لقد فزت!",
                    `لقد قمت بالمقامرة بنجاح وحولت رهانك البالغ **$${betAmount.toLocaleString()}** إلى **$${amountWon.toLocaleString()}**!${cloverMessage}`,
                );
            } else {
                cashChange = -betAmount;

                resultEmbed = warningEmbed(
                    "💔 لقد خسرت...",
                    `لم تكن النتيجة لصالحك. لقد خسرت رهانك البالغ **$${betAmount.toLocaleString()}**.`,
                );
            }

            userData.wallet = Math.max(0, (userData.wallet || 0) + cashChange);
            userData.lastGamble = now;

            await setEconomyData(client, guildId, userId, userData);

            const newCash = userData.wallet;

            resultEmbed.addFields({
                name: "رصيد النقود الجديد",
                value: `$${newCash.toLocaleString()}`,
                inline: true,
            });

            if (usedClover) {
                resultEmbed.setFooter({
                    text: `لديك ${userData.inventory["lucky_clover"]} من نفل الحظ متبقية. كانت فرصة الفوز ${Math.round(winChance * 100)}%.`,
                });
            } else if (usedCharm) {
                resultEmbed.setFooter({
                    text: `لديك ${userData.inventory["lucky_charm"]} من استخدامات تعويذة الحظ متبقية. كانت فرصة الفوز ${Math.round(winChance * 100)}%.`,
                });
            } else {
                resultEmbed.setFooter({
                    text: `ستكون المقامرة القادمة متاحة خلال 5 دقائق. فرصة الفوز الأساسية: ${Math.round(BASE_WIN_CHANCE * 100)}%.`,
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'gamble' })
};

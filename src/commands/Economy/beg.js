import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 30 * 60 * 1000;
const MIN_WIN = Number(botConfig?.economy?.begMin) || 50;
const MAX_WIN = Number(botConfig?.economy?.begMax) || 200;
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('التوسل للحصول على مبلغ مالي بسيط'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "فشل في تحميل بيانات الاقتصاد الخاصة بك. يرجى المحاولة مرة أخرى لاحقاً.",
                    { userId, guildId }
                );
            }

            const lastBeg = userData.lastBeg || 0;
            const remainingTime = lastBeg + COOLDOWN - Date.now();

            if (remainingTime > 0) {
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);

                let timeMessage =
                    minutes > 0 ? `${minutes} دقيقة` : `${seconds} ثانية`;

                throw createError(
                    "Beg cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `أنت متعب من التوسل! حاول مرة أخرى بعد **${timeMessage}**.`,
                    { remainingTime, minutes, seconds, cooldownType: 'beg' }
                );
            }

            const success = Math.random() < SUCCESS_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (success) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                newCash += amountWon;

                const successMessages = [
                    `ألقى شخص لطيف مبلغ **$${amountWon.toLocaleString()}** في كوبك.`,
                    `لقد لمحت محفظة منسية! التقطت مبلغ **$${amountWon.toLocaleString()}** وهربت.`,
                    `أشفق عليك أحدهم وأعطاك **$${amountWon.toLocaleString()}**!`,
                    `وجدت مبلغ **$${amountWon.toLocaleString()}** تحت مقعد في الحديقة.`,
                ];

                replyEmbed = successEmbed(
                    'عملية توسل ناجحة',
                    successMessages[
                        Math.floor(Math.random() * successMessages.length)
                    ]
                );
            } else {
                const failMessages = [
                    "طاردتك الشرطة، ولم تحصل على أي شيء.",
                    "صرخ أحدهم في وجهك: 'ابحث عن عمل!' ومضى في طريقه.",
                    "سرق سنجاب العملة المعدنية الوحيدة التي كانت معك.",
                    "حاولت التوسل، لكنك شعرت بالحرج الشديد وتراجعْت.",
                ];

                replyEmbed = warningEmbed(
                    'محاولة فاشلة',
                    failMessages[Math.floor(Math.random() * failMessages.length)]
                );
            }

            userData.wallet = newCash;
            userData.lastBeg = Date.now();

            await setEconomyData(client, guildId, userId, userData);

            await InteractionHelper.safeEditReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};

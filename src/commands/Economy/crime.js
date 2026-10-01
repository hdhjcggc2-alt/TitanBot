import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000;
const JAIL_TIME = 2 * 60 * 60 * 1000;
const FINE_RATE = 0.2;

const CRIME_TYPES = [
    { name: "Pickpocketing", arName: "نبش الأجياب (النشل)", min: 100, max: 500, risk: 0.3 },
    { name: "Burglary", arName: "السطو على منزل", min: 300, max: 1000, risk: 0.4 },
    { name: "Bank Heist", arName: "سطو مسلح على بنك", min: 1000, max: 5000, risk: 0.6 },
    { name: "Art Theft", arName: "سرقة لوحة فنية", min: 2000, max: 10000, risk: 0.7 },
    { name: "Cybercrime", arName: "جريمة إلكترونية", min: 5000, max: 20000, risk: 0.8 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('ارتكاب جريمة لكسب المال (محفوفة بالمخاطر)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('نوع الجريمة المراد ارتكابها')
                .setRequired(true)
                .addChoices(
                    { name: 'Pickpocketing (نشل)', value: 'pickpocketing' },
                    { name: 'Burglary (سطو منزلي)', value: 'burglary' },
                    { name: 'Bank Heist (سطو على بنك)', value: 'bank-heist' },
                    { name: 'Art Theft (سرقة فنية)', value: 'art-theft' },
                    { name: 'Cybercrime (جريمة إلكترونية)', value: 'cybercrime' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastCrime = userData.cooldowns?.crime || 0;
            const isJailed = userData.jailedUntil && userData.jailedUntil > now;

            if (isJailed) {
                const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
                throw createError(
                    "User is in jail",
                    ErrorTypes.RATE_LIMIT,
                    `أنت مسجون لمدة **${timeLeft}** دقيقة أخرى!`,
                    { jailTimeRemaining: userData.jailedUntil - now }
                );
            }

            if (now < lastCrime + CRIME_COOLDOWN) {
                const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
                throw createError(
                    "Crime cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `يجب عليك الانتظار لمدة **${timeLeft}** دقيقة أخرى قبل ارتكاب جريمة جديدة.`,
                    { remaining: lastCrime + CRIME_COOLDOWN - now, cooldownType: 'crime' }
                );
            }

            const crimeType = interaction.options.getString("type").toLowerCase();
            const crime = CRIME_TYPES.find(
                c => c.name.toLowerCase().replace(/\s+/g, '-') === crimeType
            );

            if (!crime) {
                throw createError(
                    "Invalid crime type",
                    ErrorTypes.VALIDATION,
                    "يرجى اختيار نوع جريمة صحيح.",
                    { crimeType }
                );
            }

            const isSuccess = Math.random() > crime.risk;
            const amountEarned = isSuccess
                ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
                : 0;

            userData.cooldowns = userData.cooldowns || {};
            userData.cooldowns.crime = now;

            if (isSuccess) {
                userData.wallet = (userData.wallet || 0) + amountEarned;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = successEmbed(
                    "🕵️ تمت الجريمة بنجاح!",
                    `لقد نفذت عملية **${crime.arName}** بنجاح وكسبت **$${amountEarned.toLocaleString()}** عملة!`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } else {
                const potentialHaul = Math.floor((crime.min + crime.max) / 2);
                const fine = Math.min(Math.floor(potentialHaul * FINE_RATE), userData.wallet || 0);
                userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
                userData.jailedUntil = now + JAIL_TIME;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = warningEmbed(
                    "🚔 فشلت الجريمة!",
                    `لقد تم القبض عليك أثناء محاولة تنفيذ **${crime.arName}** وأُرسلت إلى السجن!\n` +
                    `تم تغريمك بمبلغ **$${fine.toLocaleString()}** وستبقى في السجن لمدة ساعتين.`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }
    }, { command: 'crime' })
};

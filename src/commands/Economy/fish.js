import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'سمك القاروص (Bass)', emoji: '🐟', rarity: 'common' },
    { name: 'سمك السلمون (Salmon)', emoji: '🐟', rarity: 'common' },
    { name: 'سمك التراوت (Trout)', emoji: '🐟', rarity: 'common' },
    { name: 'سمك التونة (Tuna)', emoji: '🐠', rarity: 'uncommon' },
    { name: 'سمك أبو سيف (Swordfish)', emoji: '🐠', rarity: 'uncommon' },
    { name: 'أخطبوط (Octopus)', emoji: '🐙', rarity: 'rare' },
    { name: 'سرطان البحر (Lobster)', emoji: '🦞', rarity: 'rare' },
    { name: 'سمك القرش (Shark)', emoji: '🦈', rarity: 'epic' },
    { name: 'حوت (Whale)', emoji: '🐋', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    "لقد قمت برمي صنارتك في المياه صافية الصفاء...",
    "أنت تنتظر بصبر بينما تعوم عوامة الصيد الخاصة بك...",
    "بعد دقائق قليلة من الانتظار، تشعر بشدّة في الصنارة...",
    "تتموج المياه عندما يلتقط شيء ما طعمك...",
    "أنت تسحب صيدتك بدقة ومهارة فائقة...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('الذهاب للصيد لاصطياد الأسماك وكسب الأموال'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
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

            const lastFish = userData.lastFish || 0;
            const inventory = userData.inventory || {};
            const hasFishingRod = inventory["fishing_rod"] || 0;

            if (now < lastFish + FISH_COOLDOWN) {
                const remaining = lastFish + FISH_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `أنت متعب قليلاً ولا يمكنك الصيد الآن. استرح لمدة **${hours} ساعة و ${minutes} دقيقة** قبل الصيد مرة أخرى.`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            const rand = Math.random();
            let fishCaught;
            
            if (rand < 0.5) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'common')[Math.floor(Math.random() * 3)];
            } else if (rand < 0.75) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'uncommon')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.9) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'rare')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.98) {
                fishCaught = FISH_TYPES.find(f => f.rarity === 'epic');
            } else {
                fishCaught = FISH_TYPES.find(f => f.rarity === 'legendary');
            }

            const baseEarned = Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
            ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasFishingRod > 0) {
                finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
                multiplierMessage = `\n🎣 **مكافأة صنارة الصيد: +50%**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet = (userData.wallet || 0) + finalEarned;
            userData.lastFish = now;

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F'
            };

            const rarityNamesArabic = {
                common: 'شائع',
                uncommon: 'غير شايع',
                rare: 'نادر',
                epic: 'ملحمي',
                legendary: 'أسطوري'
            };

            const embed = createEmbed({
                title: 'نجحت رحلة الصيد!',
                description: `${catchMessage}\n\nلقد صطدت **${fishCaught.emoji} ${fishCaught.name}**! لقد قمت ببيعها مقابل **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
                color: rarityColors[fishCaught.rarity]
            })
                .addFields(
                    {
                        name: "رصيد النقود الجديد",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "الندرة",
                        value: rarityNamesArabic[fishCaught.rarity] || fishCaught.rarity,
                        inline: true,
                    }
                )
                .setFooter({ text: `ستكون رحلة الصيد القادمة متاحة خلال 45 دقيقة.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};

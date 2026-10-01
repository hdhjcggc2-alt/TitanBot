import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const MINE_COOLDOWN = 60 * 60 * 1000;
const BASE_MIN_REWARD = 400;
const BASE_MAX_REWARD = 1200;
const PICKAXE_MULTIPLIER = 1.2;
const DIAMOND_PICKAXE_MULTIPLIER = 2.0;

const MINE_LOCATIONS = [
    "منجم ذهب مهجور",
    "كهف مظلم ورطب",
    "محجر صخور خلفي",
    "فتحة بركانية من الزجاج البركاني",
    "خندق معادن في أعماق البحار",
];

export default {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('الذهاب للتعدين لكسب الأموال'),

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

            const lastMine = userData.lastMine || 0;
            const inventory = userData.inventory || {};
            const hasDiamondPickaxe = inventory["diamond_pickaxe"] || 0;
            const hasPickaxe = inventory["pickaxe"] || 0;

            if (now < lastMine + MINE_COOLDOWN) {
                const remaining = lastMine + MINE_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Mining cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `معولك بحاجة للبرود والراحة. انتظر لمدة **${hours} ساعة و ${minutes} دقيقة** قبل التعدين مرة أخرى.`,
                    { remaining, cooldownType: 'mine' }
                );
            }

            const baseEarned =
                Math.floor(
                    Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1),
                ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasDiamondPickaxe > 0) {
                finalEarned = Math.floor(baseEarned * DIAMOND_PICKAXE_MULTIPLIER);
                multiplierMessage = `\n💎 **مكافأة المعول الماسي: +100%**`;
            } else if (hasPickaxe > 0) {
                finalEarned = Math.floor(baseEarned * PICKAXE_MULTIPLIER);
                multiplierMessage = `\n⛏️ **مكافأة المعول: +20%**`;
            }

            const location =
                MINE_LOCATIONS[
                    Math.floor(Math.random() * MINE_LOCATIONS.length)
                ];

            userData.wallet = (userData.wallet || 0) + finalEarned;
            userData.lastMine = now;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 نجحت رحلة التعدين!",
                `لقد استكشفت **${location}** واستطعت العثور على معادن بقيمة **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
            )
                .addFields({
                    name: "رصيد النقود الجديد",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                })
                .setFooter({ text: `ستكون عملية التعدين القادمة متاحة خلال ساعة واحدة.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'mine' })
};

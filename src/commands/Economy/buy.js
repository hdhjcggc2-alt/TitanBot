import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { shopItems } from '../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('شراء عنصر من المتجر')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('معرف (ID) العنصر المراد شراؤه')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('الكمية المراد شراؤها (الافتراضي: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const itemId = interaction.options.getString("item_id").toLowerCase();
            const quantity = interaction.options.getInteger("quantity") || 1;

            const item = SHOP_ITEMS.find(i => i.id === itemId);

            if (!item) {
                throw createError(
                    `Item ${itemId} not found`,
                    ErrorTypes.VALIDATION,
                    `معرف العنصر \`${itemId}\` غير موجود في المتجر.`,
                    { itemId }
                );
            }

            if (quantity < 1) {
                throw createError(
                    "Invalid quantity",
                    ErrorTypes.VALIDATION,
                    "يجب أن تكون الكمية المراد شراؤها 1 أو أكثر.",
                    { quantity }
                );
            }

            const totalCost = item.price * quantity;

            const guildConfig = await getGuildConfig(client, guildId);
            const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

            const userData = await getEconomyData(client, guildId, userId);

            if (userData.wallet < totalCost) {
                throw createError(
                    "Insufficient funds",
                    ErrorTypes.VALIDATION,
                    `تحتاج إلى **$${totalCost.toLocaleString()}** لشراء ${quantity}x من **${item.name}**، ولكن لا يوجد في محفظتك سوى **$${userData.wallet.toLocaleString()}**.`,
                    { required: totalCost, current: userData.wallet, itemId, quantity }
                );
            }

            if (item.type === "role" && itemId === "premium_role") {
                if (!PREMIUM_ROLE_ID) {
                    throw createError(
                        "Premium role not configured",
                        ErrorTypes.CONFIGURATION,
                        "لم يتم تكوين **رتبة المتجر المميزة** من قبل مشرفي السيرفر بعد.",
                        { itemId }
                    );
                }
                if (interaction.member.roles.cache.has(PREMIUM_ROLE_ID)) {
                    throw createError(
                        "Role already owned",
                        ErrorTypes.VALIDATION,
                        `أنت تمتلك بالفعل رتبة **${item.name}**.`,
                        { itemId, roleId: PREMIUM_ROLE_ID }
                    );
                }
                if (quantity > 1) {
                    throw createError(
                        "Invalid quantity for role",
                        ErrorTypes.VALIDATION,
                        `يمكنك شراء رتبة **${item.name}** مرة واحدة فقط.`,
                        { itemId, quantity }
                    );
                }
            }

            userData.wallet -= totalCost;

            let successDescription = `لقد قمت بشراء ${quantity}x من **${item.name}** بنجاح مقابل **$${totalCost.toLocaleString()}**!`;

            if (item.type === "role" && itemId === "premium_role") {
                const member = interaction.member;

                const role = interaction.guild.roles.cache.get(PREMIUM_ROLE_ID);

                if (!role) {
                    throw createError(
                        "Role not found",
                        ErrorTypes.CONFIGURATION,
                        "رتبة المتجر المميزة المكوّنة لم تعد موجودة في هذا السيرفر.",
                        { roleId: PREMIUM_ROLE_ID }
                    );
                }

                try {
                    await member.roles.add(
                        role,
                        `شراء رتبة: ${item.name}`,
                    );
                    successDescription += `\n\n**👑 تم منحك الرتبة ${role.toString()} بنجاح!**`;
                } catch (roleError) {
                    userData.wallet += totalCost;
                    await setEconomyData(client, guildId, userId, userData);
                    throw createError(
                        "Role assignment failed",
                        ErrorTypes.DISCORD_API,
                        "تم خصم المبلغ بنجاح، ولكن تعذر منحك الرتبة. تم استرداد أموالك إلى محفظتك.",
                        { roleId: PREMIUM_ROLE_ID, originalError: roleError.message }
                    );
                }
            } else if (item.type === "upgrade") {
                userData.upgrades[itemId] = true;
                successDescription += `\n\n**✨ الترقية الخاصة بك أصبحت مفعلة الآن!**`;
            } else if (item.type === "consumable" || item.type === "tool") {
                userData.inventory[itemId] =
                    (userData.inventory[itemId] || 0) + quantity;
                if (item.type === "tool") {
                    successDescription += `\n\n**🛠️ تمت إضافة ${item.name} إلى حقيبة أغراضك!**`;
                }
            }

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 تمت عملية الشراء بنجاح",
                successDescription,
            ).addFields({
                name: "الرصيد الجديد",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }, { command: 'buy' })
};

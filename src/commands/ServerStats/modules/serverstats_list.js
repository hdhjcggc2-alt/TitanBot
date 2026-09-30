import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji as getCounterTypeEmoji, getCounterTypeLabel, getGuildCounterStats } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function handleList(interaction, client) {
    const guild = interaction.guild;

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'أنت بحاجة إلى صلاحية **إدارة القنوات (Manage Channels)** لعرض العدادات.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);
        const stats = await getGuildCounterStats(guild);

        const validCounters = [];
        const orphanedCounters = [];
        
        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);
            if (channel) {
                validCounters.push(counter);
            } else {
                orphanedCounters.push(counter);
                logger.info(`Removing orphaned counter ${counter.id} (type: ${counter.type}, deleted channel: ${counter.channelId}) from guild ${guild.id}`);
            }
        }

        if (orphanedCounters.length > 0) {
            await saveServerCounters(client, guild.id, validCounters);
            logger.info(`Cleaned up ${orphanedCounters.length} orphaned counter(s) from guild ${guild.id}`);
        }

        if (validCounters.length === 0) {
            const embed = createEmbed({
                title: "عدادات السيرفر",
                description: "لم يتم إعداد أي عدادات لهذا السيرفر حتى الآن.\n\nاستخدم الأمر `/serverstats create` لإنشاء أول عداد لك!",
                color: getColor('warning')
            });

            embed.addFields({
                name: "**أنواع العدادات المتاحة**",
                value: "**الأعضاء + البوتات** - إجمالي أعضاء السيرفر\n **الأعضاء فقط** - الأعضاء البشريين فقط\n **البوتات فقط** - البوتات المضافة للسيرفر فقط",
                inline: false
            });

            embed.addFields({
                name: "**أمثلة الاستخدام**",
                value: "`/serverstats create type:members channel_type:voice category:Stats`\n`/serverstats create type:bots channel_type:text category:Server Info`\n`/serverstats list`",
                inline: false
            });

            embed.setFooter({ 
                text: "نظام العدادات • يتم التحديث التلقائي كل 15 دقيقة" 
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);
            return;
        }

        const embed = createEmbed({
            title: `عدادات السيرفر (${validCounters.length})`,
            description: "إليك جميع العدادات المفعّلة حالياً في هذا السيرفر.\n\nتتحدث العدادات تلقائياً كل 15 دقيقة.",
            color: getColor('info')
        });

        for (let i = 0; i < validCounters.length; i++) {
            const counter = validCounters[i];
            const channel = guild.channels.cache.get(counter.channelId);
            
            if (!channel) {
                logger.warn(`Counter ${counter.id} still has missing channel after cleanup`);
                continue;
            }

            const currentCount = getCurrentCount(stats, counter.type);
            const status = channel.name.includes(':') ? '✅ نشط' : '⚠️ لم يحدث بعد';
            
            embed.addFields({
                name: `${getCounterTypeEmoji(counter.type)} عداد رقم ${i + 1} - ${channel.name}`,
                value: `**المعرف (ID):** \`${counter.id}\`\n**النوع:** ${getCounterTypeDisplay(counter.type)}\n**القناة:** ${channel}\n**العدد الحالي:** ${currentCount}\n**الحالة:** ${status}\n**تاريخ الإنشاء:** ${new Date(counter.createdAt).toLocaleDateString('ar-EG')}`,
                inline: false
            });
        }

        embed.addFields({
            name: "**الإحصائيات**",
            value: `**إجمالي العدادات:** ${validCounters.length}\n**العدادات النشطة:** ${validCounters.filter(c => {
                const channel = guild.channels.cache.get(c.channelId);
                return channel && channel.name.includes(':');
            }).length}\n**التحديث القادم:** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
            inline: false
        });

        embed.addFields({
            name: "**أوامر الإدارة**",
            value: "`/serverstats create` - إنشاء عداد جديد\n`/serverstats update` - تحديث عداد موجود\n`/serverstats delete` - حذف عداد",
            inline: false
        });

        embed.setFooter({ 
            text: "نظام العدادات • يتم التحديث التلقائي كل 15 دقيقة" 
        });
        embed.setTimestamp();

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);

    } catch (error) {
        logger.error("Error displaying counters:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'حدث خطأ أثناء جلب العدادات. يرجى المحاولة مرة أخرى.' }).catch(logger.error);
    }
}

function getCounterTypeDisplay(type) {
    return `${getCounterTypeEmoji(type)} ${getCounterTypeLabel(type)}`;
}

function getCounterEmoji(type) {
    return getCounterTypeEmoji(type);
}

function getCurrentCount(stats, type) {
    switch (type) {
        case "members":
            return stats.totalCount;
        case "bots":
            return stats.botCount;
        case "members_only":
            return stats.humanCount;
        default:
            return 0;
    }
}

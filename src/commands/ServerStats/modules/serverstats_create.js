import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function handleCreate(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'أنت بحاجة إلى صلاحية **إدارة القنوات (Manage Channels)** لإنشاء العدادات.' }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'يرجى تحديد فئة (Category) صالحة لقناة العداد.' }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const baseChannelName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);

        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateChannel = guild.channels.cache.get(duplicateType.channelId);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `يوجد بالفعل عداد من نوع **${getCounterTypeLabel(type)}** في هذا السيرفر${duplicateChannel ? ` في ${duplicateChannel}` : ''}. يرجى حذفه أولاً قبل إنشاء عداد آخر.` }).catch(logger.error);
            return;
        }

        const targetChannel = await guild.channels.create({
            name: baseChannelName,
            type: targetChannelType,
            parent: category.id,
            reason: `Counter channel created by ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);
        if (existingCounter) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `يوجد بالفعل عداد مرتبطة بالقناة **${targetChannel.name}**. يرجى حذفه أولاً أو اختيار نوع آخر.` }).catch(logger.error);
            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type: type,
            channelId: targetChannel.id,
            guildId: guild.id,
            createdAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await targetChannel.delete('Counter creation failed during save').catch(() => null);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'فشل في حفظ بيانات العداد. يرجى المحاولة مرة أخرى.' }).catch(logger.error);
            return;
        }

        const updated = await updateCounter(client, guild, newCounter);
        if (!updated) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'تم إنشاء العداد ولكن تعذر تغيير اسم القناة حالياً. سيتم تحديث العداد في التشغيل المجدول القادم.' }).catch(logger.error);
            return;
        }

        const channelTypeAr = targetChannel.type === ChannelType.GuildVoice ? 'صوتية' : 'كتابية';

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "تم إنشاء العداد بنجاح!",
                `**النوع:** ${getCounterTypeLabel(type)}\n` +
                `**نوع القناة:** ${channelTypeAr}\n` +
                `**الفئة:** ${category}\n` +
                `**القناة:** ${targetChannel}\n` +
                `**اسم القناة:** ${targetChannel.name}\n` +
                `**معرف العداد:** \`${newCounter.id}\`\n\n` +
                `سيتم تحديث العداد تلقائياً كل 15 دقيقة.\n\n` +
                `استخدم الأمر \`/serverstats list\` لعرض كافة العدادات.`
            )]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error creating counter:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'حدث خطأ أثناء إنشاء العداد. يرجى المحاولة مرة أخرى.' }).catch(logger.error);
    }
}

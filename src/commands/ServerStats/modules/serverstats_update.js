import { PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function handleUpdate(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'أنت بحاجة إلى صلاحية **إدارة القنوات (Manage Channels)** لتحديث العدادات.' }).catch(logger.error);
        return;
    }

    if (!newType) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'يجب عليك تحديد نوع جديد للعداد لتحديثه.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `لم يتم العثور على عداد بالمعرف \`${counterId}\`. استخدم الأمر \`/serverstats list\` لعرض جميع العدادات.` }).catch(logger.error);
            return;
        }

        const counter = counters[counterIndex];
        const oldChannel = guild.channels.cache.get(counter.channelId);

        if (!oldChannel) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'القناة الخاصة بهذا العداد لم تعد موجودة. لا يمكنك تحديث عداد لقناة محذوفة.' }).catch(logger.error);
            return;
        }

        if (newType !== counter.type) {
            const existingTypeCounter = counters.find(c => c.type === newType && c.id !== counter.id);
            if (existingTypeCounter) {
                const existingChannel = guild.channels.cache.get(existingTypeCounter.channelId);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `يوجد بالفعل عداد من نوع **${getCounterTypeLabel(newType)}** في هذا السيرفر${existingChannel ? ` في ${existingChannel}` : ''}. يرجى حذفه أولاً قبل استخدام هذا النوع مجدداً.` }).catch(logger.error);
                return;
            }
        }

        const oldType = counter.type;

        counter.type = newType;
        counter.updatedAt = new Date().toISOString();

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'فشل في حفظ بيانات العداد المحدثة. يرجى المحاولة مرة أخرى.' }).catch(logger.error);
            return;
        }

        const updatedCounter = counters[counterIndex];
        const updated = await updateCounter(client, guild, updatedCounter);
        if (!updated) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'تم تحديث العداد ولكن تعذر تغيير اسم القناة حالياً. سيتم تحديث اسم القناة تلقائياً عند التشغيل المجدول القادم.' }).catch(logger.error);
            return;
        }

        const finalChannel = guild.channels.cache.get(updatedCounter.channelId);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "تم تحديث العداد بنجاح!",
                `**معرف العداد:** \`${counterId}\`\n` +
                `**تغيير النوع:** ${getCounterEmoji(oldType)} ${getCounterTypeLabel(oldType)} ← ${getCounterEmoji(newType)} ${getCounterTypeLabel(newType)}\n\n` +
                `**الإعدادات الحالية:**\n` +
                `**النوع:** ${getCounterEmoji(updatedCounter.type)} ${getCounterTypeLabel(updatedCounter.type)}\n` +
                `**القناة:** ${finalChannel}\n` +
                `**اسم القناة:** ${finalChannel.name}\n\n` +
                `سيتم تحديث العداد تلقائياً كل 15 دقيقة.`
            )]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error updating counter:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'حدث خطأ أثناء تحديث العداد. يرجى المحاولة مرة أخرى.' }).catch(logger.error);
    }
}

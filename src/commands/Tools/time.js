import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('عرض الوقت الحالي في مناطق زمنية مختلفة')
        .addStringOption(option =>
            option.setName('timezone')
                .setDescription('المنطقة الزمنية المراد عرضها (مثال: UTC, America/New_York, Asia/Riyadh)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const timezone = interaction.options.getString('timezone') || 'UTC';

                let timeString;
                try {
                    timeString = new Date().toLocaleString('ar-SA', {
                        timeZone: timezone,
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    });
                } catch (error) {
                    logger.warn(`Invalid timezone requested: ${timezone}`);
                    await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'منطقة زمنية غير صالحة. يرجى استخدام معرف منطقة زمنية صحيح (مثل: UTC, America/New_York, Europe/London, Asia/Riyadh)',
                    });
                    return;
                }

                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '🕒 الوقت الحالي',
                    `**${timezone}:**${timeString}\n` +
                    `**الطابع الزمني (Unix):** \`${unixTimestamp}\`\n` +
                    `**سلسلة ISO:** \`${now.toISOString()}\``
                );

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            'فشل الحصول على الوقت الحالي. يرجى المحاولة مرة أخرى.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};

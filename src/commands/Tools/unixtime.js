import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unixtime')
        .setDescription('الحصول على الطابع الزمني الحالي (Unix timestamp)'),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '⏱️ الطابع الزمني الحالي (Unix Timestamp)',
                    `**الثواني منذ حقبة يونكس (Unix Epoch):** \`${unixTimestamp}\`\n` +
                    `**الميلي ثانية منذ حقبة يونكس:** \`${now.getTime()}\`\n\n` +
                    `**صيغة قابلة للقراءة (UTC):** ${now.toUTCString()}\n` +
                    `**سلسلة ISO:** ${now.toISOString()}`
                );
                embed.setColor(getColor('success'));

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            },
            'فشل الحصول على الطابع الزمني. يرجى المحاولة مرة أخرى.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};

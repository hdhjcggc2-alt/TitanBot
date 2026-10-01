import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('تشغيل مقطع صوتي أو أغنية عبر الرابط أو البحث')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('اسم الأغنية أو الرابط (يوتيوب، سبوتيفاي، إلخ)')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const query = interaction.options.getString('query');
        const channel = interaction.member?.voice?.channel;

        if (!channel) {
            throw createError(
                "Voice channel required",
                ErrorTypes.VALIDATION,
                "يجب أن تكون متصلاً بروم صوتي لتشغيل الموسيقى.",
                { userId: interaction.user.id }
            );
        }

        // كود مشغل الموسيقى (Riffy / LavaLink) الخاص بك
        const embed = successEmbed(
            "🎶 جاري التشغيل",
            `تم استلام طلب البحث بنجاح عن: \`${query}\``
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'play' })
};

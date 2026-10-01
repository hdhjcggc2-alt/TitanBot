import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('تشغيل مقطع صوتي أو أغنية عبر الرابط أو البحث (يدعم يوتيوب وسبوتيفاي)')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('اكتب اسم الأغنية أو ضع الرابط هنا')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        // تأخير الاستجابة لمنع انتهاء مهلة التفاعل من ديسكورد
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const query = interaction.options.getString('query');
        const channel = interaction.member?.voice?.channel;

        // التحقق من وجود المستخدم داخل روم صوتي
        if (!channel) {
            const errorEmbedMsg = errorEmbed(
                "خطأ في الاتصال",
                "يجب أن تكون متصلاً بروم صوتي (Voice Channel) لتشغيل الموسيقى!"
            );
            return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbedMsg] });
        }

        // التحقق من صلاحيات البوت في الروم الصوتي
        const botChannel = interaction.guild?.members.me?.voice.channel;
        if (botChannel && botChannel.id !== channel.id) {
            const errorEmbedMsg = errorEmbed(
                "روم مختلف",
                "البوت مشغل بالفعل في روم صوتي آخر!"
            );
            return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbedMsg] });
        }

        try {
            // هنا يتم ربط مشغل الصوت (مثل Riffy أو Lavalink) الخاص بمشروعك
            // مثال على بدء البحث والتشغيل:
            // const player = client.riffy.createConnection({ ... });

            const embed = successEmbed(
                "🎶 جاري البحث والتشغيل",
                `تم استلام طلبك بنجاح والبحث عن:\n\`${query}\``
            );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        } catch (error) {
            console.error("Play command error:", error);
            const errorEmbedMsg = errorEmbed(
                "فشل التشغيل",
                "حدث خطأ أثناء محاولة تشغيل الأغنية. يجدر التحقق من سيرفر الصوت (Lavalink)."
            );
            await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbedMsg] });
        }
    }, { command: 'play' })
};
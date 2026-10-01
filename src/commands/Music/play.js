import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'الموسيقى',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('تشغيل أغنية أو إضافتها إلى قائمة الانتظار عبر البحث أو الرابط')
        .addStringOption((opt) =>
            opt.setName('query')
               .setDescription('اكتب اسم الأغنية، الفنان، أو الصق الرابط مباشرة')
               .setRequired(true),
        )
        .addStringOption((opt) =>
            opt.setName('platform')
               .setDescription('اختر منصة البحث المفضلة (اختياري)')
               .setRequired(false)
               .addChoices(
                   { name: 'يوتيوب (YouTube)', value: 'ytsearch' },
                   { name: 'يوتيوب ميوزك (YouTube Music)', value: 'ytmsearch' },
                   { name: 'سبوتيفاي (Spotify)', value: 'spsearch' }
               )
        ),

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        let query = interaction.options.getString('query').trim();
        const platform = interaction.options.getString('platform');

        // إذا لم يكن الإدخال رابطاً مباشراً وتم تحديد منصة بحث، نقوم بدمج البادئة المناسبة تماماً مثل المنصات الكبرى
        const isUrl = /^https?:\/\//i.test(query);
        if (platform && !isUrl) {
            query = `${platform}:${query}`;
        } else if (!isUrl) {
            // البادئة الافتراضية للبحث في حال لم يحدد المستخدم منصة (مثل البحث عن الأغاني بالاسم)
            query = `ytsearch:${query}`;
        }

        const result = await playQuery(client, interaction, query);
        await replyMusicSuccess(interaction, result.embed);
    },
};

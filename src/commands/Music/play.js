import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'الموسيقى',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('تشغيل أغنية أو إضافتها إلى قائمة الانتظار')
        .addStringOption((opt) =>
            opt.setName('query')
               .setDescription('اسم الأغنية، رابط مباشر، أو مصطلح بحث')
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

        // إذا قام المستخدم بتحديد منصة بحث معينة ولم يكن النص رابطاً مباشراً، نقوم بدمج البادئة الخاصة بها
        const isUrl = /^https?:\/\//i.test(query);
        if (platform && !isUrl) {
            query = `${platform}:${query}`;
        }

        const result = await playQuery(client, interaction, query);
        await replyMusicSuccess(interaction, result.embed);
    },
};

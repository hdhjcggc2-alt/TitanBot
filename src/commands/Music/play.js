import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('تشغيل')
        .setDescription('تشغيل أغنية أو إضافتها إلى قائمة الانتظار')
        .addStringOption((opt) =>
            opt.setName('البحث').setDescription('اسم الأغنية أو رابط اليوتيوب/المنصات').setRequired(true),
        ),

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const result = await playQuery(client, interaction, interaction.options.getString('البحث'));
        await replyMusicSuccess(interaction, result.embed);
    },
};

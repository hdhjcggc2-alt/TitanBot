import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { joinVoiceChannel, replyMusicSuccess } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'الموسيقى',
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('الانضمام إلى القناة الصوتية الخاصة بك دون بدء التشغيل'),

    async execute(interaction, config, client) {
        const deferred = await deferMusicCommand(interaction);
        if (!deferred) {
            return;
        }

        const embed = await joinVoiceChannel(client, interaction);
        await replyMusicSuccess(interaction, embed);
    },
};

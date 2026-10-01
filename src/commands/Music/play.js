import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue via search or URL')
        .addStringOption((opt) =>
            opt.setName('query')
               .setDescription('Song name, artist, or direct URL')
               .setRequired(true),
        )
        .addStringOption((opt) =>
            opt.setName('platform')
               .setDescription('Choose preferred search platform (optional)')
               .setRequired(false)
               .addChoices(
                   { name: 'YouTube', value: 'ytsearch' },
                   { name: 'YouTube Music', value: 'ytmsearch' },
                   { name: 'Spotify', value: 'spsearch' }
               )
        ),

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        let query = interaction.options.getString('query').trim();
        const platform = interaction.options.getString('platform');

        const isUrl = /^https?:\/\//i.test(query);
        if (platform && !isUrl) {
            query = `${platform}:${query}`;
        } else if (!isUrl) {
            query = `ytsearch:${query}`;
        }

        const result = await playQuery(client, interaction, query);
        await replyMusicSuccess(interaction, result.embed);
    },
};

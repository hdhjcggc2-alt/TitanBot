import axios from 'axios';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction) {
        try {
            const term = interaction.options.getString('term');

            if (term.length < 2) {
                logger.warn('Urban command - term too short', {
                    userId: interaction.user.id,
                    term: term,
                    guildId: interaction.guildId
                });
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'يرجى إدخال مصطلح يتكون من حرفين على الأقل.' });
            }

            let deferTimer = null;
            const clearDeferTimer = () => {
                if (deferTimer) {
                    clearTimeout(deferTimer);
                    deferTimer = null;
                }
            };

            deferTimer = setTimeout(() => {
                InteractionHelper.safeDefer(interaction).catch((deferError) => {
                    logger.debug('Urban command defer fallback failed', {
                        error: deferError?.message,
                        interactionId: interaction.id,
                        commandName: 'urban'
                    });
                });
            }, 1500);

            const response = await axios.get(
                `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
                { timeout: 5000 }
            );
            clearDeferTimer();

            if (!response.data?.list?.length) {
                return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `لم يتم العثور على تعريفات للمصطلح "${term}" في Urban Dictionary.` });
            }

            const definition = response.data.list[0];
            const cleanDefinition = definition.definition.replace(/\[\vert{}\]/g, '');
            const cleanExample = definition.example.replace(/\[\vert{}\]/g, '');

            const formattedDefinition = cleanDefinition
                .replace(/\n\s*\n/g, '\n\n')
                .slice(0, 2000);

            const formattedExample = cleanExample
                ? `*"${cleanExample.replace(/\n/g, ' ').slice(0, 500)}..."*`
                : '*لا يوجد مثال موضح*';

            const embed = createEmbed({
                title: definition.word,
                description: formattedDefinition,
                color: 'info'
            })
            .setURL(definition.permalink)
            .addFields(
                {
                    name: 'مثال',
                    value: formattedExample,
                    inline: false
                },
                {
                    name: 'الإحصائيات',
                    value: `👍 ${definition.thumbs_up.toLocaleString()} • 👎 ${definition.thumbs_down.toLocaleString()}`,
                    inline: true
                },
                {
                    name: 'الكاتب',
                    value: definition.author || 'مجهول',
                    inline: true
                }
            )
            .setFooter({
                text: 'Urban Dictionary',
                iconURL: 'https://i.imgur.com/8aQrX3a.png'
            });

            await InteractionHelper.safeReply(interaction, { embeds: [embed] });

            logger.info('Urban Dictionary definition retrieved', {
                userId: interaction.user.id,
                term: term,
                guildId: interaction.guildId,
                commandName: 'urban'
            });

        } catch (error) {
            logger.error('Urban Dictionary error', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                term: interaction.options.getString('term'),
                guildId: interaction.guildId,
                apiStatus: error.response?.status,
                commandName: 'urban'
            });

            if (error.response?.status === 404 || !error.response) {
                await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `لم يتم العثور على تعريفات للمصطلح "${interaction.options.getString('term')}" في Urban Dictionary.` });
            } else if (error.response?.status === 429) {
                await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'طلبات كثيرة جداً إلى Urban Dictionary. يرجى المحاولة مرة أخرى بعد بضع دقائق.' });
            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'urban',
                    source: 'urban_dictionary_api'
                });
            }
        }
    },
};

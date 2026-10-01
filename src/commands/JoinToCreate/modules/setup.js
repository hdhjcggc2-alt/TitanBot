import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig } from '../../../utils/database.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        try {
            const triggerChannel = await interaction.guild.channels.create({
                name: 'Join to Create',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            const embed = successEmbed(
                '✅ اكتمل إعداد نظام الإنشاء التلقائي',
                `تم إنشاء قناة التشغيل: ${triggerChannel}\n\n` +
                `**الإعدادات:**\n` +
                `• قالب اسم القناة المؤقتة: \`${nameTemplate}\`\n` +
                `• الحد الأقصى للمستخدمين: ${userLimit === 0 ? 'بلا حدود' : userLimit + ' مستخدمين'}\n` +
                `• جودة الصوت (Bitrate): ${bitrate} kbps\n` +
                `${category ? `• القسم: ${category.name}` : '• القسم: بدون (القسم الرئيسي)'}\n\n` +
                `عندما ينضم المستخدمون إلى هذه القناة، سيتم إنشاء قناة صوتية مؤقتة لهم.`
            );

            try {
                if (interaction.deferred) {
                    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                } else {
                    await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                logger.error('Error responding to interaction:', responseError);
                
                try {
                    if (!interaction.replied) {
                        await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    logger.error('All response attempts failed:', e);
                }
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Error in JoinToCreate setup:', error);
            throw new TitanBotError(
                `Setup failed: ${error.message}`,
                ErrorTypes.DISCORD_API,
                'فشل إعداد نظام الإنشاء التلقائي.'
            );
        }
    }
};

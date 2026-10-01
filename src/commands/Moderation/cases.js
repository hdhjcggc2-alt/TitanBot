import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('cases')
        .setDescription('عرض سجلات وحالات الإشراف في السيرفر')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
        .setDMPermission(false)
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('تصفية الحالات حسب النوع أو الإجراء')
                .addChoices(
                    { name: 'جميع الحالات', value: 'all' },
                    { name: 'الحظر (Bans)', value: 'Member Banned' },
                    { name: 'الطرد (Kicks)', value: 'Member Kicked' },
                    { name: 'الإسكات (Timeouts)', value: 'Member Timed Out' },
                    { name: 'التحذيرات (Warnings)', value: 'User Warned' }
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('تصفية الحالات لمستخدم معين')
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('عدد الحالات المراد إظهارها (الافتراضي: 10)')
                .setMinValue(1)
                .setMaxValue(50)
        ),

    category: 'الإشراف',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Cases interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'cases'
            });
            return;
        }

        try {
            const filterType = interaction.options.getString('filter') || 'all';
            const targetUser = interaction.options.getUser('user');
            const limit = interaction.options.getInteger('limit') || 10;

            const filters = {
                limit,
                action: filterType === 'all' ? undefined : filterType,
                userId: targetUser?.id
            };

            const cases = await getModerationCases(interaction.guild.id, filters);

            if (cases.length === 0) {
                throw new Error(targetUser 
                    ? `لم يتم العثور على حالات إشراف للمستخدم ${targetUser.tag}`
                    : `لم يتم العثور على أي حالات ${filterType === 'all' ? '' : filterType} في هذا السيرفر.`
                );
            }

            const CASES_PER_PAGE = 5;
            const totalPages = Math.ceil(cases.length / CASES_PER_PAGE);
            let currentPage = 1;

            const createCasesEmbed = (page) => {
                const startIndex = (page - 1) * CASES_PER_PAGE;
                const endIndex = startIndex + CASES_PER_PAGE;
                const pageCases = cases.slice(startIndex, endIndex);

                const embed = createEmbed({
                    title: 'سجلات حالات الإشراف',
                    description: `عرض حالات الإشراف لسيرفر **${interaction.guild.name}**\n\n**الصفحة ${page} من ${totalPages}**`
                });

                pageCases.forEach(case_ => {
                    const date = new Date(case_.createdAt).toLocaleDateString();
                    const time = new Date(case_.createdAt).toLocaleTimeString();
                    
                    embed.addFields({
                        name: `حالة #${case_.caseId} - ${case_.action}`,
                        value: `**الهدف:** ${case_.target}\n**المسؤول:** ${case_.executor}\n**التاريخ:** ${date} في ${time}\n**السبب:** ${case_.reason || 'لم يتم تقديم سبب'}`,
                        inline: false
                    });
                });

                embed.setFooter({
                    text: `إجمالي الحالات: ${cases.length} | التصفية: ${filterType}${targetUser ? ` | المستخدم: ${targetUser.tag}` : ''}`
                });

                return embed;
            };

            const createNavigationRow = (page) => {
                const row = new ActionRowBuilder();
                
                const prevButton = new ButtonBuilder()
                    .setCustomId('prev_page')
                    .setLabel('⬅️ السابق')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1);

                const pageInfoButton = new ButtonBuilder()
                    .setCustomId('page_info')
                    .setLabel(`صفحة ${page}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true);

                const nextButton = new ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('التالي ➡️️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages);

                row.addComponents(prevButton, pageInfoButton, nextButton);
                return row;
            };

            const message = await interaction.editReply({ 
                embeds: [createCasesEmbed(currentPage)], 
                components: [createNavigationRow(currentPage)]
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 120000
            });

            collector.on('collect', async (buttonInteraction) => {
                await buttonInteraction.deferUpdate();

                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.followUp({
                        content: 'لا يمكنك استخدام هذه الأزرار. قم بتنفيذ الأمر `/cases` للحصول على سجلك الخاص.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const { customId } = buttonInteraction;

                if (customId === 'prev_page' && currentPage > 1) {
                    currentPage--;
                } else if (customId === 'next_page' && currentPage < totalPages) {
                    currentPage++;
                }

                await interaction.editReply({
                    embeds: [createCasesEmbed(currentPage)],
                    components: [createNavigationRow(currentPage)]
                });
            });

            collector.on('end', async () => {
                const disabledRow = createNavigationRow(currentPage);
                disabledRow.components.forEach(button => button.setDisabled(true));
                
                try {
                    await message.edit({
                        components: [disabledRow]
                    });
                } catch (error) {
                }
            });

        } catch (error) {
            logger.error('Error in cases command:', error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'حدث خطأ أثناء استرجاع حالات الإشراف. الرجاء المحاولة مرة أخرى لاحقاً.' });
        }
    }
};

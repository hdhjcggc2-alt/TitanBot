import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { 
    getJoinToCreateConfig, 
    updateJoinToCreateConfig,
    removeJoinToCreateTrigger,
    addJoinToCreateTrigger
} from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('trigger_channel');
        const guildId = interaction.guild.id;

        const currentConfig = await getJoinToCreateConfig(client, guildId);

        if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
            throw new TitanBotError(
                `Channel ${triggerChannel.id} is not a Join to Create trigger`,
                ErrorTypes.VALIDATION,
                `القناة ${triggerChannel} غير مُعرّفة كقناة إنشاء تلقائي.`
            );
        }

        const embed = new EmbedBuilder()
            .setTitle('إعدادات نظام الإنشاء التلقائي')
            .setDescription(`تخصيص إعدادات القناة ${triggerChannel}`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: 'قالب اسم القناة الحالي',
                    value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                    inline: false
                },
                {
                    name: 'الحد الأقصى للمستخدمين الحالي',
                    value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.userLimit ?? currentConfig.userLimit) === 0 ? 'بلا حدود' : (currentConfig.channelOptions?.[triggerChannel.id]?.userLimit ?? currentConfig.userLimit) + ' مستخدمين'}`,
                    inline: true
                },
                {
                    name: 'جودة الصوت (Bitrate) الحالية',
                    value: `${((currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) || 64000) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'اختر أحد الخيارات أدناه للتعديل' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`jointocreate_config_${triggerChannel.id}`)
            .setPlaceholder('اختر خيار التكوين المطلوب...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('تغيير قالب اسم القناة')
                    .setDescription('تعديل القالب المستخدم لتسمية القنوات المؤقتة')
                    .setValue('name_template'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('تغيير حد المستخدمين')
                    .setDescription('تحديد الحد الأقصى للمستخدمين في كل قناة مؤقتة')
                    .setValue('user_limit'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('تغيير جودة الصوت')
                    .setDescription('ضبط جودة الصوت للقنوات المؤقتة')
                    .setValue('bitrate'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('إزالة قناة التشغيل هذه')
                    .setDescription('إزالة هذه القناة من نظام الإنشاء التلقائي')
                    .setValue('remove_trigger'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('عرض الإعدادات الحالية')
                    .setDescription('عرض كافة تفاصيل التكوين الحالي')
                    .setValue('view_settings')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
            components: [row],
        }).catch(error => {
            logger.error('Failed to edit reply in config_setup:', error);
        });

        const collector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.user.id === interaction.user.id && i.customId === `jointocreate_config_${triggerChannel.id}`,
            time: 60000
        });

        collector.on('collect', async (selectInteraction) => {
            await selectInteraction.deferUpdate();

            const selectedOption = selectInteraction.values[0];

            try {
                switch (selectedOption) {
                    case 'name_template':
                        await handleNameTemplateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'user_limit':
                        await handleUserLimitChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'bitrate':
                        await handleBitrateChange(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'remove_trigger':
                        await handleRemoveTrigger(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                    case 'view_settings':
                        await handleViewSettings(selectInteraction, triggerChannel, currentConfig, client);
                        break;
                }
            } catch (error) {
                if (error instanceof TitanBotError) {
                    logger.debug(`Configuration validation error: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected configuration menu error:', error);
                }
                
                const errorMessage = error instanceof TitanBotError 
                    ? error.userMessage || 'حدث خطأ أثناء معالجة اختيارك.'
                    : 'حدث خطأ أثناء معالجة اختيارك.';
                    
                await replyUserError(selectInteraction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: errorMessage
                }).catch(() => {});
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    selectMenu.setDisabled(true)
                );
                
                await InteractionHelper.safeEditReply(interaction, {
                    components: [disabledRow],
                }).catch(() => {});
            }
        });
            } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Unexpected error in config_setup:', error);
            throw new TitanBotError(
                `Config setup failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'فشل إعداد نظام الإنشاء التلقائي.'
            );
        }
    }
};

async function handleNameTemplateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('تكوين قالب اسم القناة')
        .setDescription('الرجاء إدخال قالب اسم القناة الجديد في الشات أدناه.')
        .addFields(
            {
                name: 'المتغيرات المتاحة',
                value: '• `{username}` - اسم المستخدم\n• `{display_name}` - الاسم المعروض\n• `{user_tag}` - معرف المستخدم (Tag)\n• `{guild_name}` - اسم السيرفر',
                inline: false
            },
            {
                name: 'القالب الحالي',
                value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'اكتب القالب الجديد في المحادثة أدناه' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();
            
            if (!newTemplate || newTemplate.length > 100) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'يجب أن يكون القالب بين 1 و 100 حرف.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                nameTemplate: newTemplate
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('تم تحديث القالب', `تم تغيير قالب اسم القناة إلى \`${newTemplate}\``)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Template validation error: ${error.message}`);
            } else {
                logger.error('Template update error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'تعذر تحديث قالب اسم القناة.'
                : 'تعذر تحديث قالب اسم القناة.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'لم يتم استلام أي رد. تم إلغاء تحديث القالب.'
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('تكوين حد المستخدمين')
        .setDescription('الرجاء إدخال الحد الأقصى الجديد للمستخدمين (من 0 إلى 99، حيث 0 يعني بلا حدود).')
        .addFields(
            {
                name: 'الحد الحالي',
                value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.userLimit ?? currentConfig.userLimit) === 0 ? 'بلا حدود' : (currentConfig.channelOptions?.[triggerChannel.id]?.userLimit ?? currentConfig.userLimit) + ' مستخدمين'}`,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'اكتب العدد الجديد في المحادثة أدناه' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newLimit = parseInt(message.content.trim());
            
            if (newLimit < 0 || newLimit > 99) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'يجب أن يكون حد المستخدمين بين 0 و 99.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                userLimit: newLimit
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('تم تحديث الحد', `تم تغيير الحد الأقصى للمستخدمين إلى ${newLimit === 0 ? 'بلا حدود' : newLimit + ' مستخدمين'}`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`User limit validation error: ${error.message}`);
            } else {
                logger.error('User limit update error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'تعذر تحديث حد المستخدمين.'
                : 'تعذر تحديث حد المستخدمين.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'لم يتم استلام رد صحيح. تم إلغاء التحديث.'
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('تكوين جودة الصوت (Bitrate)')
        .setDescription('الرجاء إدخال جودة الصوت الجديدة بالكيلوبت (من 8 إلى 384).')
        .addFields(
            {
                name: 'الجودة الحالية',
                value: `${((currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) || 64000) / 1000} kbps`,
                inline: false
            },
            {
                name: 'قيم شائعة',
                value: '• 64 kbps - جودة عادية\n• 96 kbps - جودة جيدة\n• 128 kbps - جودة عالية\n• 256 kbps - جودة عالية جداً',
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'اكتب القيمة الجديدة في المحادثة أدناه' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newBitrate = parseInt(message.content.trim());
            
            if (newBitrate < 8 || newBitrate > 384) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'يجب أن تكون جودة الصوت بين 8 و 384 kbps.'
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                bitrate: newBitrate * 1000
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('تم تحديث الجودة', `تم تغيير جودة الصوت إلى ${newBitrate} kbps`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Bitrate validation error: ${error.message}`);
            } else {
                logger.error('Bitrate update error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'تعذر تحديث جودة الصوت.'
                : 'تعذر تحديث جودة الصوت.';
                
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: errorMessage
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'لم يتم استلام رد صحيح. تم إلغاء التحديث.'
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('إزالة قناة التشغيل')
        .setDescription(`هل أنت متأكد من أنك تريد إزالة القناة ${triggerChannel} من نظام الإنشاء التلقائي؟`)
        .setColor('#ff6600')
        .setFooter({ text: 'لا يمكن التراجع عن هذا الإجراء' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_remove_${triggerChannel.id}`)
            .setLabel('إزالة القناة')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_remove_${triggerChannel.id}`)
            .setLabel('إلغاء')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({ 
        embeds: [embed], 
        components: [row],
        flags: MessageFlags.Ephemeral 
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id && 
                     (i.customId === `confirm_remove_${triggerChannel.id}` || i.customId === `cancel_remove_${triggerChannel.id}`),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId === `confirm_remove_${triggerChannel.id}`) {
            try {
                const success = await removeJoinToCreateTrigger(client, interaction.guild.id, triggerChannel.id);
                
                if (success) {
                    await buttonInteraction.followUp({
                        embeds: [successEmbed('تمت إزالة القناة', `تمت إزالة القناة ${triggerChannel} من نظام الإنشاء التلقائي بنجاح.`)],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await replyUserError(buttonInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: 'تعذر إزالة قناة التشغيل.'
                    });
                }
            } catch (error) {
                if (error instanceof TitanBotError) {
                    logger.debug(`Trigger removal validation error: ${error.message}`);
                } else {
                    logger.error('Remove trigger error:', error);
                }
                
                const errorMessage = error instanceof TitanBotError
                    ? error.userMessage || 'حدث خطأ أثناء إزالة قناة التشغيل.'
                    : 'حدث خطأ أثناء إزالة قناة التشغيل.';
                    
                await replyUserError(buttonInteraction, {
                    type: ErrorTypes.CONFIGURATION,
                    message: errorMessage
                }).catch(() => {});
            }
        } else {
            await buttonInteraction.followUp({
                embeds: [successEmbed('تم الإلغاء', 'تم إلغاء عملية إزالة القناة.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            replyUserError(interaction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'انتهت
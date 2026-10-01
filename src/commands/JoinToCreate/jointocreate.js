import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, LabelBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    initializeJoinToCreate,
    getChannelConfiguration,
    updateChannelConfig,
    removeTriggerChannel,
    hasManageGuildPermission,
    logConfigurationChange,
    getConfiguration
} from '../../services/joinToCreateService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("jointocreate")
        .setDescription("إدارة نظام القنوات الصوتية المؤقتة (Join to Create)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("إعداد قناة صوتية جديدة للإنشاء التلقائي.")
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("القسم (Category) الذي سيتم إنشاء القنوات فيه.")
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addStringOption((option) =>
                    option
                        .setName("channel_name")
                        .setDescription("اختر قالباً لتسمية القنوات الصوتية المؤقتة.")
                        .addChoices(
                            { name: "غرفة {username} (الافتراضي)", value: "{username}'s Room" },
                            { name: "قناة {username}", value: "{username}'s Channel" },
                            { name: "استراحة {username}", value: "{username}'s Lounge" },
                            { name: "مساحة {username}", value: "{username}'s Space" },
                            { name: "غرفة {displayName}", value: "{displayName}'s Room" },
                            { name: "صوتية {username}", value: "{username}'s VC" },
                            { name: "غرفة أغاني {username}", value: "{username}'s Music Room" },
                            { name: "غرفة قيمنق {username}", value: "{username}'s Gaming Room" },
                            { name: "غرفة دردشة {username}", value: "{username}'s Chat Room" },
                            { name: "غرفة خاصة {username}", value: "{username}'s Private Room" }
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("user_limit")
                        .setDescription("الحد الأقصى للمستخدمين في القنوات المؤقتة. (0 = بلا حدود)")
                )
                .addIntegerOption((option) =>
                    option
                        .setName("bitrate")
                        .setDescription("جودة الصوت (Bitrate) بالقنوات المؤقتة بالكيلوبت (8-96).")
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("تعديل وتكوين نظام الإنشاء التلقائي الحالي.")
                .addChannelOption((option) =>
                    option
                        .setName("trigger_channel")
                        .setDescription("قناة التشغيل (Trigger) المراد تعديلها.")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice)
                )
        ),
    category: "أدوات",

    async execute(interaction, config, client) {
        try {
            if (!hasManageGuildPermission(interaction.member)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    'تحتاج إلى صلاحية **إدارة السيرفر (Manage Server)** لاستخدام هذا الأمر.'
                );
            }

            const subcommand = interaction.options.getSubcommand();
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            if (subcommand === "setup") {
                await handleSetupSubcommand(interaction, client);
                return;
            } else if (subcommand === "dashboard") {
                await handleConfigSubcommand(interaction, client);
                return;
            }

        } catch (error) {
            try {
                let errorMessage = 'حدث خطأ أثناء تنفيذ هذا الأمر.';
                
                if (error instanceof TitanBotError) {
                    errorMessage = error.userMessage || 'حدث خطأ. يرجى المحاولة مرة أخرى.';
                    logger.debug(`TitanBotError [${error.type}]:${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in jointocreate command:', error);
                    errorMessage = 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى أو الاتصال بالدعم.';
                }

                return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: errorMessage });
            } catch (replyError) {
                logger.error('Failed to send error message:', replyError);
            }
        }
    }
};

async function handleSetupSubcommand(interaction, client) {
    try {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        logger.debug(`Setting up Join to Create in guild ${guildId} with template:${nameTemplate}`);

        const existingConfig = await getConfiguration(client, guildId);
        
        if (Array.isArray(existingConfig.triggerChannels) && existingConfig.triggerChannels.length > 0) {
            const activeTriggerChannels = [];
            const staleTriggerChannelIds = [];

            for (const existingChannelId of existingConfig.triggerChannels) {
                const existingChannel = await interaction.guild.channels.fetch(existingChannelId).catch(() => null);
                if (existingChannel) {
                    activeTriggerChannels.push(existingChannel);
                } else {
                    staleTriggerChannelIds.push(existingChannelId);
                }
            }

            if (staleTriggerChannelIds.length > 0) {
                for (const staleChannelId of staleTriggerChannelIds) {
                    logger.info(`Cleaning up stale JTC trigger ${staleChannelId} from guild${guildId}`);
                    await removeTriggerChannel(client, guildId, staleChannelId);
                }
            }

            if (activeTriggerChannels.length > 0) {
                const primaryTrigger = activeTriggerChannels[0];
                const errorMessage = `هذا السيرفر يمتلك بالفعل قناة إنشاء تلقائي مفعلة: ${primaryTrigger}\n\nاستخدم أمر \`/jointocreate dashboard\` لتعديلها، أو قم بحذفها أولاً قبل إنشاء واحدة جديدة.`;

                throw new TitanBotError(
                    'Guild already has a Join to Create channel',
                    ErrorTypes.VALIDATION,
                    errorMessage,
                    {
                        guildId,
                        activeTriggerCount: activeTriggerChannels.length,
                        expected: true,
                        suppressErrorLog: true
                    }
                );
            }
        }

        logger.debug('Creating Join to Create trigger channel...');
        let triggerChannel = await interaction.guild.channels.create({
            name: 'Join to Create',
            type: ChannelType.GuildVoice,
            parent: category?.id,
            userLimit: 0,
            bitrate: 64000,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                },
            ],
        });

        logger.debug(`Created trigger channel ${triggerChannel.id}, initializing config...`);

        const config = await initializeJoinToCreate(client, guildId, triggerChannel.id, {
            nameTemplate: nameTemplate,
            userLimit: userLimit,
            bitrate: bitrate * 1000,
            categoryId: category?.id
        });

        await logConfigurationChange(client, guildId, interaction.user.id, 'Initialized Join to Create', {
            channelId: triggerChannel.id,
            nameTemplate,
            userLimit,
            bitrate
        });

        logger.info(`Successfully created Join to Create system in guild ${guildId}`);

        const responseEmbed = successEmbed(
            '✅ اكتمل الإعداد بنجاح',
            `تم إنشاء قناة الإنشاء التلقائي: ${triggerChannel}\n\n` +
            `**الإعدادات:**\n` +
            `• القالب: \`${nameTemplate}\`\n` +
            `• الحد الأقصى للمستخدمين: ${userLimit === 0 ? 'بلا حدود' : userLimit + ' مستخدمين'}\n` +
            `• جودة الصوت (Bitrate): ${bitrate} kbps\n` +
            `${category ? `• القسم: ${category.name}` : '• القسم: القسم الرئيسي (Root)'}`
        );

        return await InteractionHelper.safeEditReply(interaction, { embeds: [responseEmbed] });

    } catch (error) {
        logger.error('Error in handleSetupSubcommand:', error);
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Setup failed: ${error.message}`,
            ErrorTypes.DISCORD_API,
            'فشل إعداد نظام الإنشاء التلقائي. يرجى التحقق من صلاحيات البوت.'
        );
    }
}

async function handleConfigSubcommand(interaction, client) {
    try {
        const triggerChannel = interaction.options.getChannel('trigger_channel');
        const guildId = interaction.guild.id;

        const currentConfig = await getChannelConfiguration(client, guildId, triggerChannel.id);
        const channelConfig = currentConfig.channelConfig || {};

        const configEmbed = new EmbedBuilder()
            .setTitle('إعدادات نظام الإنشاء التلقائي')
            .setDescription(`لوحة تحكم القناة ${triggerChannel}`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: 'قالب اسم القناة',
                    value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate || "{username}'s Room"}\``,
                    inline: false
                },
                {
                    name: 'الحد الأقصى للمستخدمين',
                    value: `${(channelConfig.userLimit ?? currentConfig.userLimit ?? 0) === 0 ? 'بلا حدود' : (channelConfig.userLimit ?? currentConfig.userLimit ?? 0) + ' مستخدمين'}`,
                    inline: true
                },
                {
                    name: 'جودة الصوت (Bitrate)',
                    value: `${(channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'استخدم الأزرار أدناه لتعديل الإعدادات • يُسمح بقناة تشغيل واحدة فقط لكل سيرفر' })
            .setTimestamp();

        const nameButton = new ButtonBuilder()
            .setCustomId(`jtc_config_name_${triggerChannel.id}`)
            .setLabel('📝 قالب الاسم')
            .setStyle(ButtonStyle.Primary);

        const limitButton = new ButtonBuilder()
            .setCustomId(`jtc_config_limit_${triggerChannel.id}`)
            .setLabel('👥 حد المستخدمين')
            .setStyle(ButtonStyle.Primary);

        const bitrateButton = new ButtonBuilder()
            .setCustomId(`jtc_config_bitrate_${triggerChannel.id}`)
            .setLabel('🎵 جودة الصوت')
            .setStyle(ButtonStyle.Primary);

        const deleteButton = new ButtonBuilder()
            .setCustomId(`jtc_config_delete_${triggerChannel.id}`)
            .setLabel('🗑️ حذف القناة')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(nameButton, limitButton, bitrateButton, deleteButton);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [configEmbed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        if (!message || typeof message.createMessageComponentCollector !== 'function') {
            throw new TitanBotError(
                'Failed to fetch interaction reply for collector setup',
                ErrorTypes.DISCORD_API,
                'فشل فتح عناصر تحكم الإعدادات. يرجى تشغيل الأمر `/jointocreate dashboard` مرة أخرى.'
            );
        }

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000
        });

        collector.on('collect', async (buttonInteraction) => {
            try {
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ تحتاج إلى صلاحية **إدارة السيرفر (Manage Server)** لاستخدام هذه الأزرار.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const customId = buttonInteraction.customId;

                if (customId.includes('jtc_config_name_')) {
                    await handleNameTemplateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_limit_')) {
                    await handleUserLimitModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_bitrate_')) {
                    await handleBitrateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_delete_')) {
                    await handleChannelDeletion(buttonInteraction, triggerChannel, currentConfig, client);
                }
            } catch (error) {
                const userMessage = error instanceof TitanBotError
                    ? error.userMessage || 'حدث خطأ ما.'
                    : 'حدث خطأ أثناء معالجة طلبك.';

                if (error instanceof TitanBotError) {
                    logger.debug(`Button interaction validation error: ${error.message}`, error.context || {});
                } else {
                    logger.error('Unexpected error in config button interaction:', error);
                }

                await buttonInteraction.reply({
                    content: `❌ ${userMessage}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                nameButton.setDisabled(true),
                limitButton.setDisabled(true),
                bitrateButton.setDisabled(true),
                deleteButton.setDisabled(true)
            );

            message.edit({
                components: [disabledRow],
                embeds: [configEmbed.setFooter({ text: 'انتهت صلاحية جلسة الإعدادات. قم بتشغيل الأمر مرة أخرى لإجراء التعديلات.' })]
            }).catch(() => {});
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Error in handleConfigSubcommand:', error);
        throw new TitanBotError(
            `Config failed: ${error.message}`,
            ErrorTypes.DATABASE,
            'فشل تحميل الإعدادات.'
        );
    }
}

async function handleNameTemplateModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const TEMPLATE_OPTIONS = [
            { label: "غرفة {username} (الافتراضي)", value: "{username}'s Room" },
            { label: "قناة {username}",        value: "{username}'s Channel" },
            { label: "استراحة {username}",         value: "{username}'s Lounge" },
            { label: "مساحة {username}",          value: "{username}'s Space" },
            { label: "غرفة {displayName}",        value: "{displayName}'s Room" },
            { label: "صوتية {username}",             value: "{username}'s VC" },
            { label: "غرفة أغاني {username}",  value: "{username}'s Music Room" },
            { label: "غرفة قيمنق {username}", value: "{username}'s Gaming Room" },
            { label: "غرفة دردشة {username}",   value: "{username}'s Chat Room" },
            { label: "غرفة خاصة {username}",   value: "{username}'s Private Room" },
        ];

        const currentTemplate = currentConfig.channelConfig?.nameTemplate
            || currentConfig.channelNameTemplate
            || "{username}'s Room";

        const templateSelect = new StringSelectMenuBuilder()
            .setCustomId('template')
            .setPlaceholder('اختر قالب اسم القناة...')
            .setOptions(
                TEMPLATE_OPTIONS.map(o => ({
                    label: o.label,
                    value: o.value,
                    default: o.value === currentTemplate,
                })),
            );

        const templateLabel = new LabelBuilder()
            .setLabel('قالب اسم القناة المؤقتة')
            .setStringSelectMenuComponent(templateSelect);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_name_modal_${triggerChannel.id}`)
            .setTitle('تعديل قالب اسم القناة')
            .addLabelComponents(templateLabel);

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_name_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ تحتاج إلى صلاحية **إدارة السيرفر (Manage Server)** لتعديل هذه الإعدادات.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const [newTemplate] = modalSubmission.fields.getStringSelectValues('template');

        await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            nameTemplate: newTemplate
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Updated channel name template', {
            channelId: triggerChannel.id,
            newTemplate
        });

        await modalSubmission.reply({
            embeds: [successEmbed('تم التحديث', `تم تغيير قالب اسم القناة إلى \`${newTemplate}\``)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Unexpected error in name template modal:', error);
        throw new TitanBotError(
            `Modal error: ${error.message}`,
            ErrorTypes.UNKNOWN,
            'حدث خطأ أثناء تحديث قالب الاسم.'
        );
    }
}

async function handleUserLimitModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const currentLimit = currentConfig.channelConfig?.userLimit ?? currentConfig.userLimit ?? 0;

        const limitInput = new TextInputBuilder()
            .setCustomId('limit_input')
            .setLabel('الحد الأقصى للمستخدمين (0 = بلا حدود)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('مثال: 5
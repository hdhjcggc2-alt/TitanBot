    imgMenuCollector.on('collect', async imgInter => {
        try {
            const picked = imgInter.values[0];

            if (picked === 'clear_thumbnail') {
                state.thumbnail = null;
                await imgInter.deferUpdate().catch(() => {});
            } else if (picked === 'clear_image') {
                state.image = null;
                await imgInter.deferUpdate().catch(() => {});
            } else {
                const isThumb = picked === 'set_thumbnail';
                const modal = new ModalBuilder()
                    .setCustomId('eb_image_modal')
                    .setTitle(isThumb ? 'تحديد الصورة المصغرة (Thumbnail)' : 'تحديد الصورة الكبيرة')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('image_url')
                                .setLabel('رابط الصورة (يجب أن يبدأ بـ http/https)')
                                .setStyle(TextInputStyle.Short)
                                .setValue((isThumb ? state.thumbnail : state.image) || '')
                                .setPlaceholder('https://example.com/image.png')
                                .setRequired(true),
                        ),
                    );

                const shown = await InteractionHelper.safeShowModal(imgInter, modal);
                if (!shown) return;

                const submitted = await imgInter
                    .awaitModalSubmit({
                        filter: i => i.customId === 'eb_image_modal' && i.user.id === imgInter.user.id,
                        time: 60_000,
                    })
                    .catch(() => null);

                if (!submitted) return;

                const url = submitted.fields.getTextInputValue('image_url').trim();

                if (!isValidUrl(url)) {
                    await replyUserError(submitted, {
                        type: ErrorTypes.USER_INPUT,
                        message: 'رابط الصورة غير صالح. يجب أن يكون رابطاً مباشراً يبدأ بـ `https://` أو `http://`.',
                    });
                    return;
                }

                if (isThumb) {
                    state.thumbnail = url;
                } else {
                    state.image = url;
                }

                await submitted.deferUpdate().catch(() => {});
            }

            await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('فشل التفاعل في قائمة اختيار الصور:', error.message);
        }
    });
}

async function handleAddField(selectInteraction, rootInteraction, state) {
    if (state.fields.length >= MAX_FIELDS) {
        return replyUserError(selectInteraction, {
            type: ErrorTypes.USER_INPUT,
            message: `لقد وصلت إلى الحد الأقصى وهو ${MAX_FIELDS} حقل.`,
        });
    }

    const modal = new ModalBuilder()
        .setCustomId('eb_add_field_modal')
        .setTitle('إضافة حقل جديد')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('field_name')
                    .setLabel('عنوان الحقل (256 حرف كحد أقصى)')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(256)
                    .setRequired(true)
                    .setPlaceholder('عنوان الحقل'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('field_value')
                    .setLabel('محتوى الحقل (1024 حرف كحد أقصى)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1024)
                    .setRequired(true)
                    .setPlaceholder('محتوى الحقل...'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('field_inline')
                    .setLabel('بجانب بعضهم؟ (اكتب yes/نعم أو no/لا)')
                    .setStyle(TextInputStyle.Short)
                    .setValue('no')
                    .setMaxLength(3)
                    .setRequired(false),
            ),
        );

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_add_field_modal' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name   = submitted.fields.getTextInputValue('field_name').trim();
    const value  = submitted.fields.getTextInputValue('field_value').trim();
    const inline = ['yes', 'y', 'true', 'نعم'].includes(submitted.fields.getTextInputValue('field_inline').trim().toLowerCase());

    state.fields.push({ name, value, inline });

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleEditField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const fieldOptions = state.fields.map((f, idx) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(`${idx + 1}.${f.name.substring(0, 50)}`)
            .setValue(`${idx}`)
            .setDescription(f.value.length > 50 ? f.value.substring(0, 47) + '...' : f.value),
    );

    const fieldSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_edit_field_pick')
        .setPlaceholder('اختر الحقل المراد تعديله...')
        .addOptions(fieldOptions);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('تعديل حقل')
                .setDescription('حدد الحقل الذي تريد تعديل عنوانه، محتواه، أو خيار العرض بجانب الحقول الأخرى.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(fieldSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const collector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'eb_edit_field_pick',
        time: 60_000,
        max: 1,
    });

    collector.on('collect', async fieldInter => {
        try {
            const idx = parseInt(fieldInter.values[0], 10);
            const targetField = state.fields[idx];
            if (!targetField) return;

            const modal = new ModalBuilder()
                .setCustomId('eb_edit_field_modal')
                .setTitle(`تعديل الحقل #${idx + 1}`)
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('field_name')
                            .setLabel('عنوان الحقل')
                            .setStyle(TextInputStyle.Short)
                            .setValue(targetField.name)
                            .setMaxLength(256)
                            .setRequired(true),
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('field_value')
                            .setLabel('محتوى الحقل')
                            .setStyle(TextInputStyle.Paragraph)
                            .setValue(targetField.value)
                            .setMaxLength(1024)
                            .setRequired(true),
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('field_inline')
                            .setLabel('بجانب بعضهم؟ (اكتب yes/نعم أو no/لا)')
                            .setStyle(TextInputStyle.Short)
                            .setValue(targetField.inline ? 'yes' : 'no')
                            .setMaxLength(3)
                            .setRequired(false),
                    ),
                );

            const shown = await InteractionHelper.safeShowModal(fieldInter, modal);
            if (!shown) return;

            const submitted = await fieldInter
                .awaitModalSubmit({
                    filter: i => i.customId === 'eb_edit_field_modal' && i.user.id === fieldInter.user.id,
                    time: 120_000,
                })
                .catch(() => null);

            if (!submitted) return;

            targetField.name   = submitted.fields.getTextInputValue('field_name').trim();
            targetField.value  = submitted.fields.getTextInputValue('field_value').trim();
            targetField.inline = ['yes', 'y', 'true', 'نعم'].includes(submitted.fields.getTextInputValue('field_inline').trim().toLowerCase());

            await submitted.deferUpdate().catch(() => {});
            await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('فشل التفاعل عند تعديل الحقل:', error.message);
        }
    });
}

async function handleRemoveField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const fieldOptions = state.fields.map((f, idx) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(`${idx + 1}.${f.name.substring(0, 50)}`)
            .setValue(`${idx}`)
            .setDescription(f.value.length > 50 ? f.value.substring(0, 47) + '...' : f.value),
    );

    const fieldSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_remove_field_pick')
        .setPlaceholder('اختر الحقل المراد إزالته...')
        .addOptions(fieldOptions);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('إزالة حقل')
                .setDescription('اختر الحقل الذي تريد حذفه من الـ Embed.')
                .setColor(getColor('error')),
        ],
        components: [new ActionRowBuilder().addComponents(fieldSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const collector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'eb_remove_field_pick',
        time: 60_000,
        max: 1,
    });

    collector.on('collect', async fieldInter => {
        try {
            const idx = parseInt(fieldInter.values[0], 10);
            if (!isNaN(idx) && idx >= 0 && idx < state.fields.length) {
                state.fields.splice(idx, 1);
            }
            await fieldInter.deferUpdate().catch(() => {});
            await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('فشل التفاعل عند حذف الحقل:', error.message);
        }
    });
}

async function handlePostEmbed(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('eb_channel_pick')
        .setPlaceholder('اختر القناة لإرسال الـ Embed...')
        .setChannelTypes([
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
        ]);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('نشر الـ Embed')
                .setDescription('اختر القناة التي تريد إرسال هذا الـ Embed إليها.')
                .setColor(getColor('success')),
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const collector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'eb_channel_pick',
        time: 60_000,
        max: 1,
    });

    collector.on('collect', async chanInter => {
        try {
            const targetChannel = chanInter.channels.first();
            if (!targetChannel) return;

            const permissions = targetChannel.permissionsFor(chanInter.client.user);
            if (!permissions || !permissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
                await replyUserError(chanInter, {
                    type: ErrorTypes.PERMISSION,
                    message: `لا أملك الصلاحيات الكافية لإرسال الرسائل في القناة ${targetChannel}.`,
                });
                return;
            }

            const embedToSend = buildPreviewEmbed(state);
            await targetChannel.send({ embeds: [embedToSend] });

            await chanInter.deferUpdate().catch(() => {});
            await chanInter.followUp({
                embeds: [
                    successEmbed(
                        'تم نشر الـ Embed بنجاح',
                        `تم إرسال الـ Embed الخاص بك بنجاح إلى القناة ${targetChannel}!`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            logger.info('تم نشر Embed مخصص بنجاح', {
                userId: chanInter.user.id,
                guildId: chanInter.guildId,
                targetChannelId: targetChannel.id,
            });
        } catch (error) {
            logger.error('حدث خطأ أثناء إرسال الـ Embed المخصص:', error);
            await replyUserError(chanInter, {
                type: ErrorTypes.UNKNOWN,
                message: 'تعذر إرسال الـ Embed إلى القناة المحددة. يرجى التحقق من الصلاحيات والتأكد من صحة البيانات.',
            });
        }
    });
}

async function handleJsonExport(selectInteraction, state) {
    const embedData = buildPreviewEmbed(state).toJSON();
    const jsonString = JSON.stringify(embedData, null, 2);

    await selectInteraction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle('تصدير بيانات JSON')
                .setDescription('إليك التنسيق الخام (Raw JSON) للـ Embed الخاص بك:')
                .setColor(getColor('info')),
        ],
        content: `\`\`\`json\n${jsonString.substring(0, 1900)}\n\`\`\``,
        flags: MessageFlags.Ephemeral,
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('embedbuilder')
        .setDescription('مُنشئ الـ Embed التفاعلي المتقدم')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: 'Utility',

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn('فشل تأخير تفاعل EmbedBuilder', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            return;
        }

        const state = {
            title: null,
            description: null,
            color: 'primary',
            author: null,
            footer: null,
            thumbnail: null,
            image: null,
            timestamp: false,
            fields: [],
        };

        await refreshDashboard(interaction, state);

        const collector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i => i.user.id === interaction.user.id && i.customId.startsWith('eb_main_'),
            time: IDLE_TIMEOUT,
        });

        collector.on('collect', async btnInter => {
            try {
                const action = btnInter.customId.replace('eb_main_', '');

                switch (action) {
                    case 'edit_content':
                        await handleEditContent(btnInter, interaction, state);
                        break;
                    case 'set_color':
                        await handleSetColor(btnInter, interaction, state);
                        break;
                    case 'set_images':
                        await handleSetImages(btnInter, interaction, state);
                        break;
                    case 'add_field':
                        await handleAddField(btnInter, interaction, state);
                        break;
                    case 'edit_field':
                        await handleEditField(btnInter, interaction, state);
                        break;
                    case 'remove_field':
                        await handleRemoveField(btnInter, interaction, state);
                        break;
                    case 'post_embed':
                        await handlePostEmbed(btnInter, interaction, state);
                        break;
                    case 'toggle_timestamp':
                        state.timestamp = !state.timestamp;
                        await btnInter.deferUpdate().catch(() => {});
                        await refreshDashboard(interaction, state);
                        break;
                    case 'json_export':
                        await handleJsonExport(btnInter, state);
                        break;
                    case 'reset_all':
                        state.title = null;
                        state.description = null;
                        state.color = 'primary';
                        state.author = null;
                        state.footer = null;
                        state.thumbnail = null;
                        state.image = null;
                        state.timestamp = false;
                        state.fields = [];
                        await btnInter.deferUpdate().catch(() => {});
                        await refreshDashboard(interaction, state);
                        break;
                }
            } catch (error) {
                logger.error('حدث خطأ في تفاعل لوحة التحكم لـ EmbedBuilder:', error);
            }
        });

        collector.on('end', () => {
            const disabledRows = buildMainMenu(state).map(row =>
                new ActionRowBuilder().addComponents(
                    row.components.map(btn => ButtonBuilder.from(btn).setDisabled(true)),
                ),
            );

            InteractionHelper.safeEditReply(interaction, {
                components: disabledRows,
            }).catch(() => {});
        });
    },
};

                        : '\n> **ملاحظة:** تعذر العثور على اللوحة الحالية. استخدم زر **إعادة نشر اللوحة** من لوحة التحكم لإعادتها.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleStaffRole(interaction, rootInteraction, guildConfig, guildId, client) {
    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('ticket_cfg_staff_role_select')
        .setPlaceholder('اختر رتبة طاقم الدعم...')
        .setMinValues(1)
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(roleSelect);

    const reply = await interaction.reply({
        embeds: [
            infoEmbed(
                '🛡️ اختر رتبة طاقم الدعم',
                'اختر الرتبة التي ستتمكن من رؤية التذاكر وإدارتها والرد عليها.',
            ),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
        fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        time: 60_000,
        filter: i => i.user.id === interaction.user.id,
    });

    collector.on('collect', async i => {
        const selectedRoleId = i.values[0];
        guildConfig.ticketStaffRoleId = selectedRoleId;
        await setGuildConfig(client, guildId, guildConfig);

        await i.reply({
            embeds: [
                successEmbed(
                    '✅ تم تحديث رتبة طاقم الدعم',
                    `تم تعيين رتبة الدعم الفني إلى <@&${selectedRoleId}>.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await interaction.deleteReply().catch(() => {});
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        collector.stop('handled');
    });

    collector.on('end', (_, reason) => {
        if (reason === 'time') {
            interaction.deleteReply().catch(() => {});
        }
    });
}

async function handleOpenCategory(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_open_cat_select')
        .setPlaceholder('اختر فئة التذاكر المفتوحة...')
        .addChannelTypes(ChannelType.GuildCategory);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    const reply = await selectInteraction.reply({
        embeds: [
            infoEmbed(
                '📁 اختر فئة التذاكر المفتوحة',
                'اختر الفئة (Category) التي سيتم إنشاء قنوات التذاكر الجديدة داخلها.',
            ),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
        fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        time: 60_000,
        filter: i => i.user.id === selectInteraction.user.id,
    });

    collector.on('collect', async i => {
        const selectedCategoryId = i.values[0];
        guildConfig.ticketCategoryId = selectedCategoryId;
        await setGuildConfig(client, guildId, guildConfig);

        await i.reply({
            embeds: [
                successEmbed(
                    '✅ تم تحديث فئة التذاكر المفتوحة',
                    `سيتم إنشاء التذاكر الجديدة الآن داخل الفئة <#${selectedCategoryId}>.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await selectInteraction.deleteReply().catch(() => {});
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        collector.stop('handled');
    });

    collector.on('end', (_, reason) => {
        if (reason === 'time') {
            selectInteraction.deleteReply().catch(() => {});
        }
    });
}

async function handleClosedCategory(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_closed_cat_select')
        .setPlaceholder('اختر فئة التذاكر المغلقة...')
        .addChannelTypes(ChannelType.GuildCategory);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    const reply = await selectInteraction.reply({
        embeds: [
            infoEmbed(
                '📂 اختر فئة التذاكر المغلقة',
                'اختر الفئة (Category) التي سيتم نقل القنوات إليها عند إغلاق التذكرة.',
            ),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
        fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        time: 60_000,
        filter: i => i.user.id === selectInteraction.user.id,
    });

    collector.on('collect', async i => {
        const selectedCategoryId = i.values[0];
        guildConfig.ticketClosedCategoryId = selectedCategoryId;
        await setGuildConfig(client, guildId, guildConfig);

        await i.reply({
            embeds: [
                successEmbed(
                    '✅ تم تحديث فئة التذاكر المغلقة',
                    `سيتم نقل التذاكر المغلقة الآن إلى الفئة <#${selectedCategoryId}>.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await selectInteraction.deleteReply().catch(() => {});
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        collector.stop('handled');
    });

    collector.on('end', (_, reason) => {
        if (reason === 'time') {
            selectInteraction.deleteReply().catch(() => {});
        }
    });
}

async function handleMaxTickets(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_max_tickets_modal')
        .setTitle('🔢 الحد الأقصى للتذاكر لكل مستخدم')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('max_tickets_input')
                    .setLabel('الحد الأقصى للتذاكر (1 - 10)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(guildConfig.maxTicketsPerUser || 3))
                    .setMaxLength(2)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('3'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_max_tickets_modal' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const valueStr = submitted.fields.getTextInputValue('max_tickets_input').trim();
    const parsed = parseInt(valueStr, 10);

    if (isNaN(parsed) || parsed < 1 || parsed > 10) {
        return replyUserError(submitted, {
            type: ErrorTypes.VALIDATION,
            message: 'يرجى إدخال رقم صحيح بين **1** و **10**.',
        });
    }

    guildConfig.maxTicketsPerUser = parsed;
    await setGuildConfig(client, guildId, guildConfig);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ تم تحديث الحد الأقصى للتذاكر',
                `يمكن لكل مستخدم الآن فتح حد أقصى قدره **${parsed}** تذكرة (تذاكر) مفتوحة في نفس الوقت.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleLogsChannel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_logs_chan_select')
        .setPlaceholder('اختر روم السجلات...')
        .addChannelTypes(ChannelType.GuildText);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    const reply = await selectInteraction.reply({
        embeds: [
            infoEmbed(
                '🎫 اختر روم سجلات التذاكر',
                'اختر الروم النصي الذي يتلقى أحداث وسجلات نظام التذاكر والتقييمات.',
            ),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
        fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        time: 60_000,
        filter: i => i.user.id === selectInteraction.user.id,
    });

    collector.on('collect', async i => {
        const selectedChannelId = i.values[0];
        guildConfig.ticketLogsChannelId = selectedChannelId;
        await setGuildConfig(client, guildId, guildConfig);

        await i.reply({
            embeds: [
                successEmbed(
                    '✅ تم تحديث روم السجلات',
                    `سيتم إرسال سجلات وأحداث التذاكر الآن إلى <#${selectedChannelId}>.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await selectInteraction.deleteReply().catch(() => {});
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        collector.stop('handled');
    });

    collector.on('end', (_, reason) => {
        if (reason === 'time') {
            selectInteraction.deleteReply().catch(() => {});
        }
    });
}

async function handleTranscriptChannel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_transcript_chan_select')
        .setPlaceholder('اختر روم النسخ الاحتياطية (Transcripts)...')
        .addChannelTypes(ChannelType.GuildText);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    const reply = await selectInteraction.reply({
        embeds: [
            infoEmbed(
                '📜 اختر روم السجلات النصية (Transcripts)',
                'اختر الروم الذي سيتم إرسال النسخ النصية والملفات المحفوظة للتذاكر المحذوفة إليه تلقائياً.',
            ),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
        fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        time: 60_000,
        filter: i => i.user.id === selectInteraction.user.id,
    });

    collector.on('collect', async i => {
        const selectedChannelId = i.values[0];
        guildConfig.ticketTranscriptChannelId = selectedChannelId;
        await setGuildConfig(client, guildId, guildConfig);

        await i.reply({
            embeds: [
                successEmbed(
                    '✅ تم تحديث روم السجلات النصية',
                    `سيتم إرسال نسخ التذاكر (Transcripts) عند الحذف إلى <#${selectedChannelId}>.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await selectInteraction.deleteReply().catch(() => {});
        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
        collector.stop('handled');
    });

    collector.on('end', (_, reason) => {
        if (reason === 'time') {
            selectInteraction.deleteReply().catch(() => {});
        }
    });
}

async function handleRepostPanel(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    await btnInteraction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const sent = await repostTicketPanel(client, btnInteraction.guild, guildConfig, guildId);

        await btnInteraction.editReply({
            embeds: [
                successEmbed(
                    '📌 تم إعادة نشر اللوحة',
                    `تم إعادة نشر لوحة إنشاء التذاكر بنجاح في <#${guildConfig.ticketPanelChannelId}>.`,
                ),
            ],
        });
    } catch (error) {
        await btnInteraction.editReply({
            embeds: [
                warningEmbed(
                    '⚠️️ تعذر إعادة نشر اللوحة',
                    error.message || 'حدث خطأ أثناء محاولة إعادة نشر اللوحة.',
                ),
            ],
        });
    }

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleDmOnClose(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    const current = guildConfig.dmOnClose !== false;
    guildConfig.dmOnClose = !current;
    await setGuildConfig(client, guildId, guildConfig);

    const statusStr = guildConfig.dmOnClose ? 'مفعّلة' : 'معطّلة';

    await btnInteraction.reply({
        embeds: [
            successEmbed(
                '📬 إرسال خاص عند الإغلاق',
                `خاصية إرسال الرسائل الخاصة عند إغلاق التذكرة **${statusStr}** الآن.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId, client);
}

async function handleDeleteSystem(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    const confirmButton = new ButtonBuilder()
        .setCustomId(`ticket_cfg_confirm_delete_${guildId}`)
        .setLabel('تأكيد الحذف')
        .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
        .setCustomId(`ticket_cfg_cancel_delete_${guildId}`)
        .setLabel('إلغاء')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    const reply = await btnInteraction.reply({
        embeds: [
            warningEmbed(
                '⚠️ حذف نظام التذاكر',
                'هل أنت تأكد من رغبتك في حذف إعدادات نظام التذاكر؟\nسيؤدي هذا إلى مسح إعدادات اللوحة والفئات ورتبة الدعم.\n*(لن يتم حذف القنوات والتذاكر الحالية القائمة)*',
            ),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
        fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: i => i.user.id === btnInteraction.user.id,
    });

    collector.on('collect', async i => {
        if (i.customId === `ticket_cfg_confirm_delete_${guildId}`) {
            delete guildConfig.ticketPanelChannelId;
            delete guildConfig.ticketPanelMessageId;
            delete guildConfig.ticketCategoryId;
            delete guildConfig.ticketClosedCategoryId;
            delete guildConfig.ticketStaffRoleId;
            delete guildConfig.ticketPanelMessage;
            delete guildConfig.ticketButtonLabel;
            delete guildConfig.maxTicketsPerUser;
            delete guildConfig.ticketLogsChannelId;
            delete guildConfig.ticketTranscriptChannelId;

            await setGuildConfig(client, guildId, guildConfig);

            await i.reply({
                embeds: [
                    successEmbed(
                        '🗑️ تم حذف النظام',
                        'تم حذف إعدادات نظام التذاكر بنجاح من هذا السيرفر.',
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            await btnInteraction.deleteReply().catch(() => {});
            await InteractionHelper.safeEditReply(rootInteraction, {
                embeds: [
                    infoEmbed(
                        '🎫 لوحة التحكم مغلقة',
                        'تم حذف نظام التذاكر. استخدم `/ticket setup` للبدء من جديد.',
                    ),
                ],
                components: [],
            }).catch(() => {});
            collector.stop('deleted');
        } else {
            await i.reply({
                embeds: [infoEmbed('إلغاء', 'تم إلغاء عملية حذف نظام التذاكر.')],
                flags: MessageFlags.Ephemeral,
            });
            await btnInteraction.deleteReply().catch(() => {});
            collector.stop('cancelled');
        }
    });

    collector.on('end', (_, reason) => {
        if (reason === 'time') {
            btnInteraction.deleteReply().catch(() => {});
        }
    });
}

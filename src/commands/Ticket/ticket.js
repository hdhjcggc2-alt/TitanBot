import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("إدارة نظام التذاكر في السيرفر.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "إعداد لوحة إنشاء التذاكر في روم محدد.",
                )
                .addChannelOption((option) =>
                    option
                        .setName("panel_channel")
                        .setDescription(
                            "الروم الذي سيتم إرسال لوحة التذاكر فيه.",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )

                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "الرسالة الرئيسية/الوصف للوحة التذاكر.",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "النص المكتوب على زر إنشاء التذكرة (الافتراضي: إنشاء تذكرة)",
                        )
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "الفئة (Category) التي ستنشأ فيها التذاكر الجديدة (اختياري).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription(
                            "الفئة التي سيتم نقل التذاكر المغلقة إليها (اختياري).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription(
                            "الرتبة التي يمكنها الوصول إلى التذاكر (اختياري).",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("الحد الأقصى للتذاكر التي يمكن للمستخدم فتحها (الافتراضي: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("إرسال رسالة خاصة للمستخدم عند إغلاق تذكرته (الافتراضي: مفعل)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("فتح لوحة التحكم التفاعلية لنظام التذاكر"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            logger.warn('Ticket command permission denied', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'أنت بحاجة إلى صلاحية `إدارة القنوات (Manage Channels)` لاستخدام هذا الأمر.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "dashboard") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "setup") {
            const existingConfig = await getGuildConfig(client, interaction.guildId);
            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `يوجد بالفعل نظام تذاكر مفعّل في هذا السيرفر (اللوحة في <#${existingConfig.ticketPanelChannelId}>).\n\nيُدعم نظام تذاكر واحد فقط لكل سيرفر. استخدم \`/ticket dashboard\` لتعديل أو تحديث الإعدادات الحالية، أو اختر **حذف النظام** من لوحة التحكم لإزالته والبدء من جديد.` });
            }

            const panelChannel =
                interaction.options.getChannel("panel_channel");
            const categoryChannel = interaction.options.getChannel("category");
            const closedCategoryChannel = interaction.options.getChannel("closed_category");
            const staffRole = interaction.options.getRole("staff_role");
            const panelMessage = interaction.options.getString("panel_message") || "اضغط على الزر أدناه لإنشاء تذكرة دعم فني.";
            const buttonLabel =
                interaction.options.getString("button_label") ||
                "إنشاء تذكرة";
            const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
            const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

            const setupEmbed = createEmbed({ 
                title: "تذاكر الدعم الفني", 
                description: panelMessage,
                color: getColor('info')
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig;
                    currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                    currentConfig.ticketClosedCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                    currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                    currentConfig.ticketPanelMessage = panelMessage;
                    currentConfig.ticketButtonLabel = buttonLabel;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmOnClose = dmOnClose;

                    await setGuildConfig(client, interaction.guildId, currentConfig);
                    logger.info('Ticket configuration saved', {
                        guildId: interaction.guildId,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                    });
                } else {
                    logger.error('Ticket setup: database unavailable, panel sent but configuration was NOT saved', {
                        guildId: interaction.guildId,
                    });
                }

                let successMessage = `تم إرسال لوحة إنشاء التذاكر بنجاح إلى ${panelChannel}.\n`;
                
                if (categoryChannel) {
                    successMessage += `سيتم إنشاء التذاكر الجديدة في فئة **${categoryChannel.name}**.\n`;
                } else {
                    successMessage += 'سيتم إنشاء التذاكر الجديدة في فئة جديدة باسم "Tickets".\n';
                }
                
                if (closedCategoryChannel) {
                    successMessage += `سيتم نقل التذاكر المغلقة إلى **${closedCategoryChannel.name}**.\n`;
                }
                
                if (staffRole) {
                    successMessage += `رتبة **${staffRole.name}** سيكون لديها صلاحية الوصول للتذاكر.\n`;
                }
                
                successMessage += `\n**الحد الأقصى للتذاكر لكل مستخدم:** ${maxTicketsPerUser}\n**إرسال رسالة خاصة عند الإغلاق:** ${dmOnClose ? 'مفعل' : 'معطل'}`;

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "تم إعداد لوحة التذاكر",
                            successMessage,
                        ),
                    ],
                });

                logger.info('Ticket panel setup completed', {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guildId,
                    panelChannelId: panelChannel.id,
                    categoryId: categoryChannel?.id,
                    closedCategoryId: closedCategoryChannel?.id,
                    staffRoleId: staffRole?.id,
                    maxTickets: maxTicketsPerUser,
                    dmOnClose: dmOnClose,
                    commandName: 'ticket_setup'
                });

                const logEmbed = createEmbed({
                    title: "إعداد نظام التذاكر (سجل الإعدادات)",
                    description: `تم إعداد لوحة التذاكر في ${panelChannel} بواسطة ${interaction.user}.`,
                    color: getColor('warning')
                })
                    .addFields(
                        {
                            name: "روم اللوحة",
                            value: panelChannel.toString(),
                            inline: true,
                        },
                        {
                            name: "فئة التذاكر",
                            value: categoryChannel
                                ? categoryChannel.toString()
                                : "لم تحدد.",
                            inline: true,
                        },
                        {
                            name: "فئة التذاكر المغلقة",
                            value: closedCategoryChannel
                                ? closedCategoryChannel.toString()
                                : "لم تحدد.",
                            inline: true,
                        },
                        {
                            name: "رتبة الدعم (Staff)",
                            value: staffRole
                                ? staffRole.toString()
                                : "لم تحدد.",
                            inline: true,
                        },
                        {
                            name: "الحد الأقصى للتذاكر",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "إرسال خاص عند الإغلاق",
                            value: dmOnClose ? 'مفعل' : 'معطل',
                            inline: true,
                        },
                        {
                            name: "المشرف",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

            } catch (error) {
                logger.error('Ticket setup error', {
                    error: error.message,
                    stack: error.stack,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket_setup'
                });
                if (interaction.deferred || interaction.replied) {
                    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'تعذر إرسال لوحة التذاكر أو حفظ الإعدادات. يرجى التحقق من صلاحيات البوت (خاصة صلاحية إرسال الرسائل في الروم المحدد) والاتصال بقاعدة البيانات.' }).catch(err => {
                        logger.error('Failed to send error reply', {
                            error: err.message,
                            guildId: interaction.guildId
                        });
                    });
                } else {
                    await handleInteractionError(interaction, error, {
                        commandName: 'ticket_setup',
                        source: 'ticket_setup_command'
                    });
                }
            }
        }
    }
};

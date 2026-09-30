import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { handleCreate } from './modules/serverstats_create.js';
import { handleList } from './modules/serverstats_list.js';
import { handleUpdate } from './modules/serverstats_update.js';
import { handleDelete } from './modules/serverstats_delete.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription("إدارة إحصائيات السيرفر لعرض عدد الأعضاء وبيانات القنوات")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("إنشاء قناة إحصائيات جديدة داخل فئة معينة")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("نوع الإحصائيات المراد تتبعها")
                        .setRequired(true)
                        .addChoices(
                            { name: "الأعضاء + البوتات", value: "members" },
                            { name: "الأعضاء فقط", value: "members_only" },
                            { name: "البوتات فقط", value: "bots" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("channel_type")
                        .setDescription("نوع القناة المراد إنشاؤها للعداد")
                        .setRequired(true)
                        .addChoices(
                            { name: "قناة صونية (موصى بها)", value: "voice" },
                            { name: "قناة كتابية", value: "text" }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription("الفئة (Category) التي سيتم إنشاء قناة الإحصائيات داخلها")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("عرض جميع عدادات الإحصائيات المفعّلة في السيرفر")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("update")
                .setDescription("تحديث عداد إحصائيات موجود حالياً")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("معرف العداد (ID) المراد تحديثه")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("نوع التتبع الجديد للعداد")
                        .setRequired(false)
                        .addChoices(
                            { name: "الأعضاء + البوتات", value: "members" },
                            { name: "الأعضاء فقط", value: "members_only" },
                            { name: "البوتات فقط", value: "bots" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("حذف عداد إحصائيات موجود")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("معرف العداد (ID) المراد حذفه")
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "create":
                await handleCreate(interaction, client);
                break;
            case "list":
                await handleList(interaction, client);
                break;
            case "update":
                await handleUpdate(interaction, client);
                break;
            case "delete":
                await handleDelete(interaction, client);
                break;
            default:
                await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'أمر فرعي غير معروف.' });
        }
    }
};

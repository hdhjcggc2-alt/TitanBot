import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Music: "🎵",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    "Reaction Roles": "🎭",
    Community: "👥",
    Birthday: "🎂",
    "Join To Create": "🔌",
    Verification: "✅",
};

// ترجمة مسميات الفئات البرمجية إلى اللغة العربية تلقائياً أو بشكل مخصص
const CATEGORY_TRANSLATIONS = {
    Core: "الأساسية",
    Moderation: "الإشراف",
    Economy: "الاقتصاد",
    Music: "الموسيقى",
    Fun: "الترفيه",
    Leveling: "المستويات",
    Utility: "الأدوات",
    Ticket: "التذاكر",
    Welcome: "الترحيب",
    Giveaway: "الفعاليات والهدايا",
    Counter: "العدادات",
    Tools: "الأدوات المساعدة",
    Search: "البحث",
    "Reaction Roles": "رتب التفاعل",
    Community: "المجتمع",
    Birthday: "أعياد الميلاد",
    "Join To Create": "إنشاء غرف صوتية",
    Verification: "التحقق"
};

function formatCategoryName(rawCategory) {
    const formatted = rawCategory
        .replace(/_/g, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
        
    return CATEGORY_TRANSLATIONS[formatted] || formatted;
}

export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 جميع الأوامر",
            description: "تصفح كافة الأوامر المتاحة في قائمة واحدة متكاملة",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const rawFormatted = category
                .replace(/_/g, '')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/\b\w/g, (char) => char.toUpperCase());
            const categoryName = CATEGORY_TRANSLATIONS[rawFormatted] || rawFormatted;
            const icon = CATEGORY_ICONS[rawFormatted] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `عرض الأوامر الخاصة بفئة ${categoryName}`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "البوت";
    const embed = createEmbed({
        title: `📖 قائمة مساعدة ${botName}`,
        description: 'قم بإعداد سيرفرك، اختر ما تريد تفعيله، ثم تصفح الأوامر أدناه بسهولة.',
        color: 'primary',
        thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }),
        fields: [
            {
                name: '🚀 البدء السريع',
                value: [
                    '**1. بدء الإعداد** — قم بتشغيل الأمر `/configwizard` لتعيين البادئة، رتبة الإشراف، وسجلات السيرفر.',
                    '**2. تفعيل الأنظمة** — استخدم `/commands dashboard` لتشغيل أو إيقاف الفئات المختلفة.',
                    '**3. تصفح الأوامر** — استخدم القائمة المنسدلة أدناه لعرض الفئات والأوامر المتاحة.',
                ].join('\n'),
                inline: false,
            },
            {
                name: 'ℹ️ كيف يعمل النظام',
                value: [
                    '• تتيح لك لوحة التحكم إدارة كل ميزة بشكل مرئي وسهل',
                    '• يتم حفظ جميع الإعدادات المخصصة لكل سيرفر على حدة',
                    '• تعمل أوامر البادئة والأوامر التفاعلية (Slash Commands) بكفاءة فور تفعيلها',
                ].join('\n'),
                inline: false,
            },
            {
                name: '\u200B',
                value: `-# هذا البوت [مفتوح المصدر](https://youtu.be/1jCZX8s3bJE?si=NPOYx-vxVE1I5vJK)`,
                inline: false,
            },
        ],
    });

    embed.setFooter({ 
        text: "صُنع بكل حب ❤️" 
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("الإبلاغ عن مشكلة")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("سيرفر الدعم الفني")
        .setURL("https://discord.gg/QnWNz2dKCE")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "اختر فئة لعرض الأوامر الخاصة بها",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("عرض قائمة المساعدة التفاعلية وكافة الأوامر المتاحة"),

    async execute(interaction, guildConfig, client) {
        
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                if (!InteractionHelper.isInteractionValid(interaction)) {
                    return;
                }

                const closedEmbed = createEmbed({
                    title: "تم إغلاق قائمة المساعدة",
                    description: "انتهت صلاحية لوحة المساعدة. يمكنك استخدام أمر /help مرة أخرى لإظهارها.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                logger.debug('Help menu close edit failed (interaction may have expired):', error?.message);
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};

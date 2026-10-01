import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ChannelType,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildConfig, setConfigValue } from '../../services/config/guildConfig.js';
import ConfigService from '../../services/config/configService.js';
import { logger } from '../../utils/logger.js';
import { botConfig, getCommandPrefix } from '../../config/bot.js';

const DASHBOARD_CUSTOM_ID = 'config_select';
const WIZARD_BUTTON_ID = 'config_wizard';
const activeWizardSessions = new Set();

const DM_DISABLED_HELP = [
    '1. انقر بزر الماوس الأيمن على اسم هذا السيرفر (الهاتف: اضغط على اسم السيرفر في الأعلى).',
    '2. افتح **إعدادات الخصوصية** (Privacy Settings).',
    '3. قم بتفعيل خيار **السماح بالرسائل الخاصة من أعضاء السيرفر**.',
    '4. انقر فوق **بدء معالج الإعداد** مرة أخرى.',
].join('\n');

async function notifyWizardStarted(buttonInteraction) {
    await buttonInteraction.followUp({
        embeds: [infoEmbed(
            'بدء معالج الإعداد',
            'تحقق من رسائلك الخاصة (DM) — لقد أرسلت لك سؤال الإعداد الأول هناك.\n\nأجب على كل سؤال في الرسائل الخاصة. اكتب `skip` للاحتفاظ بالقيمة الحالية.',
        )],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});
}

async function notifyWizardDmBlocked(buttonInteraction) {
    await replyUserError(buttonInteraction, {
        type: ErrorTypes.USER_INPUT,
        message: `تعذر إرسال رسالة خاصة لك. يرجى تفعيل استقبال الرسائل الخاصة من أعضاء السيرفر ثم المحاولة مرة أخرى.\n\n${DM_DISABLED_HELP}`,
    }).catch(() => {});
}

function formatChannelMention(guild, channelId) {
    if (!channelId) {
        return '`غير مُحدد`';
    }
    const channel = guild.channels.cache.get(channelId);
    return channel ? `<#${channelId}>` : `#${channelId}`;
}

function formatRoleMention(guild, roleId) {
    if (!roleId) {
        return '`غير مُحدد`';
    }
    const role = guild.roles.cache.get(roleId);
    return role ? `<@&${roleId}>` : `@${roleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) {
        return '`غير مُكوّن`';
    }

    const typeLabels = ['يلعب', 'يبث', 'يستمع إلى', 'يشاهد', '', 'يتنافس في'];
    const typeLabel = typeLabels[activity.type];
    if (!typeLabel) {
        return activity.name;
    }

    return `${typeLabel} **${activity.name}**`;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;
    return [
        `🎨 الأساسي \`${colors.primary}\` · النجاح \`${colors.success}\``,
        `⚠️ التحذير \`${colors.warning}\` · الخطأ \`${colors.error}\``,
    ].join('\n');
}

function buildDashboardEmbed(config, guild) {
    const setupDone = config.setupWizardCompleted;

    return createEmbed({
        title: '⚙️ إعدادات السيرفر',
        description: `الإعدادات الأساسية لـ **${guild.name}**. اختر أحد الخيارات أدناه أو قم بتشغيل معالج الإعداد.`,
        color: 'info',
        fields: [
            {
                name: '⌨️ بادئة الأوامر',
                value: `\`${config.prefix || getCommandPrefix()}\``,
                inline: true,
            },
            {
                name: '🛡️ رتبة المشرفين',
                value: formatRoleMention(guild, config.modRole),
                inline: true,
            },
            {
                name: '📋 قناة السجلات',
                value: formatChannelMention(guild, config.logging?.channels?.audit),
                inline: true,
            },
            {
                name: '💚 حالة البوت',
                value: getBotPresenceText(),
                inline: false,
            },
            {
                name: '🎨 ألوان الرسائل المدمجة (Embeds)',
                value: `${getThemeColorLines()}\n-# يتم تعيين الألوان في ملف إعدادات البوت وتطبيقها بشكل عام.`,
                inline: false,
            },
            {
                name: '⚡ صلاحيات الأوامر',
                value: 'استخدم `/commands dashboard` لتفعيل أو تعطيل الأوامر والأوامر الفرعية.',
                inline: false,
            },
            {
                name: `${setupDone ? '✅' : '📝'} الإعداد`,
                value: setupDone
                    ? 'تم إكمال معالج الإعداد — يمكنك إعادة تشغيله في أي وقت لتحديث الإعدادات.'
                    : 'قم بتشغيل معالج الإعداد لتكوين سيرفرك بسرعة.',
                inline: false,
            },
        ],
        footer: 'تغلق لوحة التحكم بعد 10 دقائق من عدم النشاط',
    });
}

function buildSettingsSelect(guildId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ اختر إعداداً لتعديله...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('بادئة الأوامر')
                    .setDescription('تغيير بادئة أوامر النصوص')
                    .setValue('prefix')
                    .setEmoji('⌨️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('رتبة المشرفين')
                    .setDescription('Rتبة المستخدمة لأوامر الإشراف')
                    .setValue('modRole')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('قناة السجلات')
                    .setDescription('القناة المخصصة لرسائل سجلات النظام')
                    .setValue('logChannelId')
                    .setEmoji('📋'),
            ),
    );
}

function buildButtonRow(config, guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WIZARD_BUTTON_ID}:${guildId}`)
            .setLabel(config.setupWizardCompleted ? 'إعادة تشغيل معالج الإعداد' : 'بدء معالج الإعداد')
            .setEmoji('📝')
            .setStyle(config.setupWizardCompleted ? ButtonStyle.Secondary : ButtonStyle.Success),
    );
}

function extractId(value) {
    if (!value || typeof value !== 'string') return null;

    const channelMention = value.match(/<#!?(\d{17,19})>/);
    if (channelMention) return channelMention[1];

    const roleMention = value.match(/<@&(\d{17,19})>/);
    if (roleMention) return roleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

async function askQuestion(dmChannel, userId, prompt, stepNumber, totalSteps) {
    await dmChannel.send({
        embeds: [createEmbed({
            title: `سؤال الإعداد ${stepNumber}/${totalSteps}`,
            description: prompt,
            color: 'primary',
        })],
    });

    const collected = await dmChannel.awaitMessages({
        filter: (message) => message.author.id === userId && !message.author.bot,
        max: 1,
        time: 180_000,
    }).catch(() => null);

    if (!collected || !collected.size) {
        await dmChannel.send({
            embeds: [buildUserErrorEmbed(ErrorTypes.RATE_LIMIT, 'لم تقم بالرد في الوقت المحدد. قم بتشغيل معالج الإعداد مرة أخرى عندما تكون جاهزاً.')],
        });
        return null;
    }

    const answer = collected.first().content.trim();
    if (answer.toLowerCase() === 'cancel') {
        await dmChannel.send({
            embeds: [infoEmbed('تم إلغاء الإعداد', 'تم إيقاف معالج الإعداد. لا تزال إجاباتك المحفوظة مفعلة.')],
        });
        return { cancelled: true };
    }

    return { answer };
}

function formatSavedAck(key, value, guild) {
    if (key === 'prefix') {
        return `تم حفظ بادئة السيرفر كـ \`${value}\`.`;
    }

    if (key === 'logChannelId') {
        if (value === null) {
            return 'تم مسح قناة السجلات.';
        }
        const channel = guild.channels.cache.get(value);
        return `تم حفظ قناة السجلات كـ ${channel ?? `<#${value}>`}.`;
    }

    if (key === 'modRole') {
        if (value === null) {
            return 'تم مسح رتبة المشرفين.';
        }
        const role = guild.roles.cache.get(value);
        return `تم حفظ رتبة المشرفين كـ ${role ?? `<@&${value}>`}.`;
    }

    default: return 'تم حفظ الإعداد.';
}

async function validateGuildChannelId(guild, channelId) {
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        throw new Error('لم يتم العثور على هذه القناة في هذا السيرفر أو أنها ليست قناة نصية.');
    }
    return channel.id;
}

async function validateGuildRoleId(guild, roleId) {
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        throw new Error('لم يتم العثور على هذه الرتبة في هذا السيرفر.');
    }
    return role.id;
}

async function refreshDashboard(rootInteraction, config, guild) {
    const embed = buildDashboardEmbed(config, guild);
    const components = [buildButtonRow(config, guild.id), buildSettingsSelect(guild.id)];
    await InteractionHelper.safeEditReply(rootInteraction, { embeds: [embed], components }).catch(() => {});
}

async function runSetupWizard(buttonInteraction, config, guild, client, rootInteraction) {
    const user = buttonInteraction.user;

    if (activeWizardSessions.has(user.id)) {
        await buttonInteraction.followUp({
            embeds: [warningEmbed('الإعداد قيد التشغيل بالفعل', 'لديك بالفعل معالج إعداد مفتوح في رسائلك الخاصة. قم بالرد هناك للمتابعة، أو اكتب `cancel` لإيقافه.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
    }

    activeWizardSessions.add(user.id);

    let dmChannel;

    try {
        dmChannel = await user.createDM();
    } catch (error) {
        logger.warn('Failed to create DM channel for setup wizard', { userId: user.id, error: error.message });
        await notifyWizardDmBlocked(buttonInteraction);
        return;
    } finally {
        if (!dmChannel) {
            activeWizardSessions.delete(user.id);
        }
    }

    const prompts = [
        {
            key: 'prefix',
            skipMessage: 'الاحتفاظ بادئة السيرفر الحالية.',
            question: 'ما هي بادئة الأوامر التي يجب أن يستخدمها هذا السيرفر؟\nالحالية: `' + (config.prefix || getCommandPrefix()) + '`\nرد بـ `skip` للاحتفاظ بها، أو `cancel` للإلغاء.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (/\s/.test(normalized) || normalized.length < 1 || normalized.length > 10) {
                    throw new Error('يجب أن تتكون البادئة من 1 إلى 10 أحرف بدون مسافات.');
                }
                return normalized;
            },
        },
        {
            key: 'logChannelId',
            skipMessage: 'الاحتفاظ بقناة السجلات الحالية.',
            question: 'ما هي القناة التي يجب أن تتلقى سجلات البوت؟\nأرسل منشن للقناة، معرف القناة (ID)، أو اكتب `none` للمسح، `skip` للاحتفاظ بالقيمة الحالية، أو `cancel` للإلغاء.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('يرجى تقديم منشن قناة صالح أو معرف (ID) من هذا السيرفر.');
                return validateGuildChannelId(guild, id);
            },
        },
        {
            key: 'modRole',
            skipMessage: 'الاحتفاظ برتبة المشرفين الحالية.',
            question: 'ما هي الرتبة التي يجب أن يحصل عليها المشرفون؟\nأرسل منشن للرتبة، معرف الرتبة (ID)، أو اكتب `none` للمسح، `skip` للاحتفاظ بالقيمة الحالية، أو `cancel` للإلغاء.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('يرجى تقديم منشن رتبة صالح أو معرف (ID) من هذا السيرفر.');
                return validateGuildRoleId(guild, id);
            },
        },
    ];

    const changes = {};
    const errors = [];
    let wizardCancelled = false;

    try {
        try {
            await dmChannel.send({
                embeds: [createEmbed({
                    title: '📝 معالج الإعداد',
                    description: 'أجب على كل سؤال في هذه الرسائل الخاصة.\n\n• اكتب `skip` للاحتفاظ بالقيمة الحالية\n• اكتب `cancel` لإيقاف المعالج',
                    color: 'info',
                })],
            });
        } catch (error) {
            logger.warn('Failed to send setup wizard DM', { userId: user.id, error: error.message });
            await notifyWizardDmBlocked(buttonInteraction);
            return;
        }

        await notifyWizardStarted(buttonInteraction);

        for (let index = 0; index < prompts.length; index++) {
            const prompt = prompts[index];
            let answered = false;

            while (!answered) {
                const result = await askQuestion(
                    dmChannel,
                    user.id,
                    prompt.question,
                    index + 1,
                    prompts.length,
                );

                if (result === null || result.cancelled) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                try {
                    const value = await prompt.parse(result.answer);

                    if (value === undefined) {
                        await dmChannel.send({
                            embeds: [infoEmbed('تم التخطي', prompt.skipMessage)],
                        });
                    } else {
                        await ConfigService.updateSetting(client, guild.id, prompt.key, value, user.id);
                        changes[prompt.key] = value;
                        await dmChannel.send({
                            embeds: [successEmbed('تم الحفظ', formatSavedAck(prompt.key, value, guild))],
                        });

                        try {
                            const updatedConfig = await getGuildConfig(client, guild.id);
                            await refreshDashboard(rootInteraction, updatedConfig, guild);
                        } catch (refreshError) {
                            logger.debug('Failed to refresh dashboard during setup wizard', { error: refreshError.message });
                        }
                    }

                    answered = true;
                } catch (error) {
                    errors.push(`• ${prompt.key}: ${error.message}`);
                    await dmChannel.send({
                        embeds: [buildUserErrorEmbed(ErrorTypes.VALIDATION, `${error.message}\n\nيرجى الرد مرة أخرى بإجابة صحيحة، أو \`skip\`، أو \`cancel\`.`)],
                    });
                }
            }

            if (wizardCancelled) {
                break;
            }
        }

        if (!wizardCancelled) {
            try {
                await setConfigValue(client, guild.id, 'setupWizardCompleted', true);
            } catch (error) {
                logger.warn('Failed to persist setupWizardCompleted flag', { guildId: guild.id, error: error.message });
            }
        }

        const summaryTitle = wizardCancelled
            ? (Object.keys(changes).length > 0 ? 'تم إيقاف الإعداد' : 'تم إلغاء الإعداد')
            : 'اكتمل الإعداد';

        const summaryBody = wizardCancelled
            ? (Object.keys(changes).length > 0
                ? `تم إيقاف الإعداد مبكراً. تم حفظ **${Object.keys(changes).length}** إعداد/إعدادات قبل الإيقاف.`
                : 'تم إيقاف معالج الإعداد قبل حفظ أي تغييرات.')
            : (Object.keys(changes).length > 0
                ? `تم تحديث **${Object.keys(changes).length}** إعداد/إعدادات.${errors.length > 0 ? ' تطلبت بعض الإجابات محاولات جديدة.' : ''}`
                : 'لم يتم تطبيق أي تغييرات.');

        const summaryEmbed = createEmbed({
            title: wizardCancelled ? `⚠️ ${summaryTitle}` : `✅ ${summaryTitle}`,
            description: summaryBody,
            color: wizardCancelled ? 'warning' : (errors.length > 0 ? 'warning' : 'success'),
        });

        if (errors.length > 0) {
            const uniqueErrors = [...new Set(errors)];
            summaryEmbed.addFields({ name: 'المشكلات', value: uniqueErrors.join('\n').slice(0, 1024) });
        }

        await dmChannel.send({ embeds: [summaryEmbed] });

        try {
            const updatedConfig = await getGuildConfig(client, guild.id);
            await refreshDashboard(rootInteraction, updatedConfig, guild);
        } catch (error) {
            logger.debug('Failed to refresh dashboard after wizard completion', { error: error.message });
        }
    } finally {
        activeWizardSessions.delete(user.id);
    }
}

async function showSettingModal(selectInteraction, guildId, setting) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    if (setting === 'logChannelId') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📋 تحديث قناة السجلات');

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('log_channel')
            .setPlaceholder('اختر قناة نصية...')
            .setMinValues(1)
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true);

        const channelLabel = new LabelBuilder()
            .setLabel('قناة السجلات')
            .setDescription('القناة التي سيتم إرسال رسائل سجلات النظام إليها')
            .setChannelSelectMenuComponent(channelSelect);

        modal.addLabelComponents(channelLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRole') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ تحديث رتبة المشرفين');

        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('mod_role')
            .setPlaceholder('اختر رتبة المشرفين...')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true);

        const roleLabel = new LabelBuilder()
            .setLabel('رتبة المشرفين')
            .setDescription('Rتبة المستخدمة لأوامر الإشراف')
            .setRoleSelectMenuComponent(roleSelect);

        modal.addLabelComponents(roleLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle('تحديث بادئة السيرفر');

    const textInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('البادئة الجديدة (1-10 أحرف، بدون مسافات)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await selectInteraction.showModal(modal);
}

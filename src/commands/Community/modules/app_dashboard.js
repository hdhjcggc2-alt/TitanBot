import { getColor, getDefaultApplicationQuestions, botConfig } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    CheckboxBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplicationRoleSettings,
    getApplications,
    deleteApplication,
} from '../../../utils/database.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { setLogChannel, resolveApplicationLogChannel, resolveLogChannel } from '../../../services/loggingService.js';

async function buildDashboardEmbed(settings, roles, guild, client) {
    const guildConfig = await getGuildConfig(client, guild.id);
    const applicationsChannel = resolveLogChannel(guildConfig, 'applications') || settings.logChannelId;
    const logChannel = applicationsChannel ? `<#${applicationsChannel}>` : '`غير محدد`';
    const managerRoleList =
        settings.managerRoles?.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
            : '`لا توجد رتب مشرفة`';
    const roleList =
        roles.length > 0
            ? roles.map(r => `<@&${r.roleId}> —${r.name}`).join('\n')
            : '`لا توجد رتب تقديم مُعدة`';
    const questionCount = settings.questions?.length ?? 0;
    const firstQ =
        settings.questions?.[0]
            ? `\`${settings.questions[0].length > 55 ? settings.questions[0].substring(0, 55) + '…' : settings.questions[0]}\``
            : '`غير محدد`';

    return new EmbedBuilder()
        .setTitle('📊 لوحة تحكم طلبات التقديم')
        .setDescription(`إدارة إعدادات طلبات التقديم الخاصة بـ **${guild.name}**.\nاختر خياراً من القائمة أدناه لتعديل الإعدادات.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'حالة التقديمات', value: settings.enabled ? '✅ مفعل' : '❌ معطل', inline: true },
            { name: 'روم السجلات', value: logChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: 'رتب المشرفين', value: managerRoleList, inline: false },
            { name: 'الأسئلة', value: `${questionCount} أسئلة مُعدة — الأول: ${firstQ}`, inline: false },
            { name: 'رتب التقديم', value: roleList, inline: false },
            {
                name: 'فترة الاحتفاظ بالطلبات',
                value: `المعلقة: **${settings.pendingApplicationRetentionDays ?? 30} يوم** · المراجَعة: **${settings.reviewedApplicationRetentionDays ?? 14} يوم**`,
                inline: false,
            },
        )
        .setFooter({ text: 'تُغلق لوحة التحكم بعد 15 دقيقة من عدم النشاط' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${guildId}`)
        .setPlaceholder('اختر إعداداً للتعديل...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('روم السجلات')
                .setDescription('تعيين الروم التي يتم تسجيل الطلبات الجديدة فيها')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('رتب المشرفين')
                .setDescription('إضافة أو إزالة رتبة قادرة على إدارة الطلبات')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('تعديل الأسئلة')
                .setDescription('تخصيص الأسئلة المعروضة في نموذج التقديم')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('إضافة رتبة تقديم')
                .setDescription('إضافة رتبة جديدة يمكن للأعضاء التقديم عليها')
                .setValue('role_add')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('إزالة رتبة تقديم')
                .setDescription('إزالة رتبة من قائمة التقديمات النشطة')
                .setValue('role_remove')
                .setEmoji('➖'),
            new StringSelectMenuOptionBuilder()
                .setLabel('فترة الاحتفاظ')
                .setDescription('تعيين مدة الاحتفاظ بالطلبات المعلقة والمراجعة')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

function buildApplicationSelectMenu(guildId, currentRoleId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${currentRoleId}`)
        .setPlaceholder('اختر إعداداً لهذا التقديم...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('روم السجلات الخاصة')
                .setDescription('تعيين روم سجلات مخصصة لهذا التقديم')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('تعديل الأسئلة الخاصة')
                .setDescription('تخصيص أسئلة هذا التقديم حصرياً')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('العودة للوحة العامة')
                .setDescription('الرجوع إلى لوحة إعدادات التقديمات العامة')
                .setValue('back_global')
                .setEmoji('🔙'),
        );
}

function buildButtonRow(settings, guildId, disabled = false) {
    const systemOn = settings.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_cfg_toggle_${guildId}`)
            .setLabel(systemOn ? 'تعطيل التقديمات' : 'تفعيل التقديمات')
            .setStyle(systemOn ? ButtonStyle.Danger : ButtonStyle.Success)
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [await buildDashboardEmbed(settings, roles, rootInteraction.guild, client)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client, selectedAppName = null) {
        try {
            const guildId = interaction.guild.id;

            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            const [settings, roles] = await Promise.all([
                getApplicationSettings(client, guildId),
                getApplicationRoles(client, guildId),
            ]);

            const guildConfig = await getGuildConfig(client, guildId);
            const applicationsChannel = resolveLogChannel(guildConfig, 'applications') || settings.logChannelId;

            const isCompletelyUnconfigured = 
                !applicationsChannel && 
                !settings.enabled && 
                (settings.managerRoles?.length ?? 0) === 0 && 
                roles.length === 0;

            if (isCompletelyUnconfigured) {
                throw new TitanBotError(
                    'نظام التقديمات غير مُعَد',
                    ErrorTypes.CONFIGURATION,
                    'لم يتم تكوين نظام التقديمات حتى الآن. يرجى تشغيل الأمر `/app-admin setup` لإنشاء أول تقديم.',
                );
            }

            if (roles.length === 0) {
                await showGlobalDashboard(interaction, settings, roles, guildId, client);
                return;
            }

            if (selectedAppName) {
                const selectedRole = roles.find(r => r.name.toLowerCase() === selectedAppName.toLowerCase());
                if (selectedRole) {
                    await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
                    return;
                }
            }

            const defaultRole = roles[0];
            await showApplicationDashboard(interaction, defaultRole, settings, roles, guildId, client);

        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in app_dashboard:', error);
            throw new TitanBotError(
                `فشل فتح لوحة تحكم التقديمات: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'تعذر فتح لوحة تحكم طلبات التقديم.',
            );
        }
    },
};

async function showGlobalDashboard(interaction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [await buildDashboardEmbed(settings, roles, interaction.guild, client)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    });

    setupCollectors(interaction, settings, roles, guildId, client, null);
}

async function showApplicationDashboard(rootInteraction, selectedRole, settings, roles, guildId, client) {
    const roleObj = rootInteraction.guild.roles.cache.get(selectedRole.roleId);

    const guildConfig = await getGuildConfig(client, guildId);
    const appSettings = await getApplicationRoleSettings(client, guildId, selectedRole.roleId);
    const questions = appSettings.questions || settings.questions || [];
    const appLogChannelId = resolveApplicationLogChannel(guildConfig, appSettings, settings);
    const isEnabled = selectedRole.enabled !== false; 

    const logChannelDisplay = appLogChannelId 
        ? `<#${appLogChannelId}>` 
        : '`يستخدم روم السجلات العامة`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`يستخدم الأسئلة العامة`';
    
    const managerRolesDisplay = settings.managerRoles && settings.managerRoles.length > 0
        ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
        : '`لا توجد رتب مشرفة`';

    const embed = new EmbedBuilder()
        .setTitle('📋 لوحة تحكم التقديم المخصص')
        .setDescription(`إعدادات التقديم الخاصة برتبة **${selectedRole.name}**`)
        .setColor(isEnabled ? getColor('success') : getColor('error'))
        .addFields(
            { 
                name: 'الرتبة المستهدفة', 
                value: roleObj ? roleObj.toString() : `<@&${selectedRole.roleId}>`, 
                inline: true 
            },
            { 
                name: 'حالة التقديم', 
                value: isEnabled ? '✅ **مفعل**' : '❌ **معطل**', 
                inline: true 
            },
            { name: '\u200B', value: '\u200B', inline: true },
            { 
                name: 'الأسئلة', 
                value: questionsDisplay,
                inline: false 
            },
            { 
                name: 'روم السجلات', 
                value: logChannelDisplay,
                inline: true 
            },
            { 
                name: 'رتب المشرفين',
                value: managerRolesDisplay,
                inline: true 
            },
            { 
                name: 'فترة الاحتفاظ',
                value: `المعلقة: **${settings.pendingApplicationRetentionDays ?? 30} يوم** · المراجَعة: **${settings.reviewedApplicationRetentionDays ?? 14} يوم**`,
                inline: false 
            },
        )
        .setFooter({ text: 'تُغلق لوحة التحكم بعد 10 دقائق من عدم النشاط' })
        .setTimestamp();

    const configMenu = buildApplicationSelectMenu(guildId, selectedRole.roleId);

    const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_toggle_${selectedRole.roleId}`)
            .setLabel(isEnabled ? 'تعطيل التقديم' : 'تفعيل التقديم')
            .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_delete_${selectedRole.roleId}`)
            .setLabel('حذف التقديم')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const menuRow = new ActionRowBuilder().addComponents(configMenu);

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [embed],
        components: [menuRow, controlButtons],
    });

    setupCollectors(rootInteraction, settings, roles, guildId, client, selectedRole.roleId);
}

function setupCollectors(interaction, settings, roles, guildId, client, selectedRoleId) {
    const customIdPrefix = selectedRoleId ? `app_cfg_${selectedRoleId}` : `app_cfg_${guildId}`;
    
    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && 
            (selectedRoleId 
                ? i.customId === customIdPrefix
                : (i.customId === `app_cfg_${guildId}` || i.customId === `app_select_${guildId}`)),
        time: 600_000,
    });

    collector.on('collect', async selectInteraction => {
        const selectedOption = selectInteraction.values[0];
        try {
            if (!selectInteraction.isStringSelectMenu()) {
                return;
            }

            if (selectedOption === 'back_global') {
                const updatedSettings = await getApplicationSettings(client, guildId);
                const updatedRoles = await getApplicationRoles(client, guildId);
                await showGlobalDashboard(interaction, updatedSettings, updatedRoles, guildId, client);
                return;
            }

            // Placeholder handlers for dashboard configuration actions
            switch (selectedOption) {
                case 'log_channel':
                    await selectInteraction.reply({ content: 'جاري تحديث روم السجلات...', flags: MessageFlags.Ephemeral });
                    break;
                case 'manager_role':
                    await selectInteraction.reply({ content: 'جاري تحديث رتب المشرفين...', flags: MessageFlags.Ephemeral });
                    break;
                case 'questions':
                    await selectInteraction.reply({ content: 'جاري تعديل الأسئلة...', flags: MessageFlags.Ephemeral });
                    break;
                case 'role_add':
                    await selectInteraction.reply({ content: 'يرجى استخدام أمر `/app-admin setup` لإضافة رتبة جديدة.', flags: MessageFlags.Ephemeral });
                    break;
                case 'role_remove':
                    await selectInteraction.reply({ content: 'جاري إزالة رتبة التقديم...', flags: MessageFlags.Ephemeral });
                    break;
                case 'retention':
                    await selectInteraction.reply({ content: 'جاري تعديل فترة الاحتفاظ...', flags: MessageFlags.Ephemeral });
                    break;
            }
        } catch (error) {
            logger.error('Error handling dashboard selection:', error);
            await replyUserError(selectInteraction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'حدث خطأ أثناء معالجة خيارك.',
            }).catch(() => {});
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏳ انتهت مهلة لوحة التحكم')
                .setDescription('تم إغلاق لوحة التحكم هذه بسبب عدم النشاط. يرجى تشغيل الأمر مرة أخرى للمتابعة.')
                .setColor(getColor('error'));
                
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });
}

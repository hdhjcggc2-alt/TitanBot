import { botConfig, getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import { validateAutoVerifyCriteria } from '../../../services/verificationService.js';
import { botHasPermission } from '../../../utils/permissionGuard.js';

const autoVerifyDefaults = botConfig.verification?.autoVerify || {};
const minAccountAgeDays = autoVerifyDefaults.minAccountAge ?? 1;
const maxAccountAgeDays = autoVerifyDefaults.maxAccountAge ?? 365;
const defaultAccountAgeDays = autoVerifyDefaults.defaultAccountAgeDays ?? 7;

function buildDashboardEmbed(cfg, guild, conflictSummary = '') {
    const autoVerify = cfg.verification?.autoVerify;
    const autoVerifyRole = autoVerify?.roleId ? guild.roles.cache.get(autoVerify.roleId) : null;
    
    let criteriaDescription = "`غير محدد`";
    if (autoVerify?.criteria) {
        switch (autoVerify.criteria) {
            case "account_age":
                criteriaDescription = `\`عمر الحساب\` - \`${autoVerify.accountAgeDays} أيام\``;
                break;
            case "none":
                criteriaDescription = `\`بدون معايير\``;
                break;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🤖 لوحة تحكم التحقق التلقائي')
        .setDescription(`إدارة إعدادات التحقق التلقائي لسيرفر **${guild.name}**.\nاختر خياراً أدناه لتعديل الإعدادات.`)
        .setColor(getColor('info'))
        .addFields(
            { name: 'حالة النظام', value: autoVerify?.enabled ? 'مفعل' : 'معطل', inline: true },
            { name: 'الرتبة المستهدفة', value: autoVerifyRole ? autoVerifyRole.toString() : '`غير محددة`', inline: true },
            { name: 'المعيار', value: criteriaDescription, inline: true },
            { name: 'عمر الحساب', value: autoVerify?.accountAgeDays ? `\`${autoVerify.accountAgeDays}\` أيام` : '`غير محدد`', inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
        );

    if (conflictSummary) {
        embed.addFields({ name: 'تعارضات الإعدادات', value: conflictSummary, inline: false });
    }

    return embed
        .setFooter({ text: 'تغلق لوحة التحكم تلقائياً بعد 10 دقائق من الخمول' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`autoverify_cfg_${guildId}`)
        .setPlaceholder('اختر خياراً لتعديله...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('تغيير الرتبة')
                .setDescription('تحديد الرتبة الممنوحة تلقائياً')
                .setValue('role')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('تعديل أيام عمر الحساب')
                .setDescription('تحديد الحد الأدنى لسن الحساب بالأيام')
                .setValue('account_age')
                .setEmoji('📅'),
        );
}

function buildButtonRow(cfg, guildId, disabled = false) {
    const autoVerifyOn = cfg.verification?.autoVerify?.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`autoverify_cfg_criteria_${guildId}`)
            .setLabel('تغيير المعيار')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎯')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`autoverify_cfg_toggle_${guildId}`)
            .setLabel('التحقق التلقائي')
            .setStyle(autoVerifyOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji('🤖')
            .setDisabled(disabled),
    );
}

async function refreshDashboard(rootInteraction, cfg, guildId, client) {
    try {
        const selectMenu = buildSelectMenu(guildId);

        let conflictSummary = '';
        try {
            const welcomeConfig = await getWelcomeConfig(client, guildId);
            const verificationEnabled = Boolean(cfg.verification?.enabled);
            const autoRoleConfigured = Boolean(cfg.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
            
            const conflicts = [
                verificationEnabled ? 'نظام التحقق اليدوي مفعل' : null,
                autoRoleConfigured ? 'الرتب التلقائية (AutoRole) مفعّلة' : null
            ].filter(Boolean);
            
            if (conflicts.length > 0) {
                conflictSummary = conflicts.join('\n');
            }
        } catch (error) {
            logger.warn('Could not fetch autoverify dashboard conflicts:', error.message);
        }
        
        await InteractionHelper.safeEditReply(rootInteraction, {
            embeds: [buildDashboardEmbed(cfg, rootInteraction.guild, conflictSummary)],
            components: [
                buildButtonRow(cfg, guildId),
                new ActionRowBuilder().addComponents(selectMenu),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        logger.debug('Could not refresh autoverify dashboard (interaction may have expired):', error.message);
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);

            if (!guildConfig.verification?.autoVerify?.enabled) {
                
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
                
                const blockingMessage = [];
                if (verificationEnabled) blockingMessage.push('نظام التحقق اليدوي مفعل');
                if (autoRoleConfigured) blockingMessage.push('الرتب التلقائية (AutoRole) مفعّلة');

                const blockingText = blockingMessage.length > 0 
                    ? `\n\n⚠️ **لتفعيل التحقق التلقائي، يجب عليك أولاً تعطيل:**\n${blockingMessage.map(msg => `• ${msg}`).join('\n')}`
                    : '';

                return await InteractionHelper.safeReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🤖 لوحة تحكم التحقق التلقائي')
                            .setDescription(`لم يتم إعداد التحقق التلقائي بعد.${blockingText}\n\nاستخدم الأمر \`/autoverify setup\` لإعداده.`)
                            .setColor(getColor('warning'))
                            .setFooter({ text: 'تغلق لوحة التحكم تلقائياً بعد 10 دقائق من الخمول' })
                            .setTimestamp()
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            await InteractionHelper.safeDefer(interaction, { ephemeral: true });

            const selectMenu = buildSelectMenu(guildId);

            let conflictSummary = '';
            try {
                const welcomeConfig = await getWelcomeConfig(client, guildId);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);
                
                const conflicts = [
                    verificationEnabled ? 'نظام التحقق اليدوي مفعل' : null,
                    autoRoleConfigured ? 'الرتب التلقائية (AutoRole) مفعّلة' : null
                ].filter(Boolean);
                
                if (conflicts.length > 0) {
                    conflictSummary = conflicts.join('\n');
                }
            } catch (error) {
                logger.warn('Could not fetch autoverify dashboard conflicts:', error.message);
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildDashboardEmbed(guildConfig, interaction.guild, conflictSummary)],
                components: [
                    buildButtonRow(guildConfig, guildId),
                    new ActionRowBuilder().addComponents(selectMenu),
                ],
                flags: MessageFlags.Ephemeral,
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `autoverify_cfg_${guildId}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'role':
                            await handleRole(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'account_age':
                            await handleAccountAge(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(`Autoverify config validation error: ${error.message}`);
                    } else {
                        logger.error('Unexpected autoverify dashboard error:', error);
                    }

                    const errorMessage =
                        error instanceof TitanBotError
                            ? error.userMessage || 'حدث خطأ أثناء معالجة اختيارك.'
                            : 'حدث خطأ غير متوقع أثناء تحديث الإعدادات.';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferUpdate().catch(() => {});
                    }

                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.CONFIGURATION,
                        message: errorMessage,
                    }).catch(() => {});
                }
            });

            const btnCollector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id && 
                    (i.customId === `autoverify_cfg_toggle_${guildId}` || i.customId === `autoverify_cfg_criteria_${guildId}`),
                time: 600_000,
            });

            btnCollector.on('collect', async btnInteraction => {
                try {
                    if (btnInteraction.customId === `autoverify_cfg_criteria_${guildId}`) {
                        await handleCriteria(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `autoverify_cfg_toggle_${guildId}`) {
                        await btnInteraction.deferUpdate().catch(() => null);
                        guildConfig.verification.autoVerify.enabled = !guildConfig.verification.autoVerify.enabled;
                        await setGuildConfig(client, guildId, guildConfig);
                        
                        await btnInteraction.followUp({
                            embeds: [
                                successEmbed(
                                    '✅ تم تحديث الحالة',
                                    `التحقق التلقائي الآن **${guildConfig.verification.autoVerify.enabled ? 'مفعل' : 'معطل'}**.`,
                                ),
                            ],
                            flags: MessageFlags.Ephemeral,
                        });

                        await refreshDashboard(interaction, guildConfig, guildId, client);
                    }
                } catch (err) {
                    logger.debug('Button interaction error:', err.message);
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    btnCollector.stop();
                    try {
                        const timeoutEmbed = new EmbedBuilder()
                            .setTitle('انتهت مهلة لوحة التحكم')
                            .setDescription('تم إغلاق لوحة التحكم هذه بسبب عدم النشاط. يرجى إرسال الأمر مرة أخرى للمتابعة.')
                            .setColor(getColor('error'));
                        await InteractionHelper.safeEditReply(interaction, {
                            embeds: [timeoutEmbed],
                            components: [],
                            flags: MessageFlags.Ephemeral,
                        });
                    } catch (error) {
                        logger.debug('Could not update dashboard on timeout:', error.message);
                    }
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in autoverify_dashboard:', error);
            throw new TitanBotError(
                `Auto-verification dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'فشل في فتح لوحة تحكم التحقق التلقائي.',
            );
        }
    },
};

async function handleCriteria(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    
    if (!selectInteraction.deferred) {
        await selectInteraction.deferUpdate().catch(() => null);
    }
    
    const criteriaEmbed = new EmbedBuilder()
        .setTitle('اختر معيار التحقق')
        .setDescription('اختر الشرط المعتمد للتحقق التلقائي للأعضاء')
        .setColor(getColor('info'));

    const criteriaMenu = new StringSelectMenuBuilder()
        .setCustomId('autoverify_criteria_select')
        .setPlaceholder('اختر معياراً...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(`عمر الحساب (أقدم من ${defaultAccountAgeDays} أيام)`)
                .setDescription('تأكيد المستخدمين الذين تمتلك حساباتهم حداً أدنى من العمر')
                .setValue('account_age'),
            new StringSelectMenuOptionBuilder()
                .setLabel('بدون معايير (التحقق للجميع)')
                .setDescription('يحصل جميع الأعضاء الجدد على الرتبة فوراً')
                .setValue('none'),
        );

    await selectInteraction.followUp({
        embeds: [criteriaEmbed],
        components: [new ActionRowBuilder().addComponents(criteriaMenu)],
        flags: MessageFlags.Ephemeral,
    });

    const criteriaCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'autoverify_criteria_select',
        time: 60_000,
        max: 1,
    });

    criteriaCollector.on('collect', async criteriaInteraction => {
        await criteriaInteraction.deferUpdate();
        const newCriteria = criteriaInteraction.values[0];

        guildConfig.verification.autoVerify.criteria = newCriteria;

        if (newCriteria !== 'account_age') {
            guildConfig.verification.autoVerify.accountAgeDays = null;
        } else if (!guildConfig.verification.autoVerify.accountAgeDays) {
            guildConfig.verification.autoVerify.accountAgeDays = defaultAccountAgeDays;
        }

        await setGuildConfig(client, guildId, guildConfig);

        let criteriaDisplay = '';
        switch (newCriteria) {
            case 'account_age':
                criteriaDisplay = `عمر الحساب (${guildConfig.verification.autoVerify.accountAgeDays} أيام)`;
                break;
            case 'none':
                criteriaDisplay = 'بدون معايير';
                break;
        }

        await criteriaInteraction.followUp({
            embeds: [successEmbed('تم تحديث المعيار', `تم تغيير معيار التحقق التلقائي إلى **${criteriaDisplay}**.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    criteriaCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'لم يتم اختيار أي معيار. لم يتم تغيير الإعدادات.',
            }).catch(() => {});
        }
    });
}

async function handleRole(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('autoverify_role_select')
        .setPlaceholder('اختر رتبة...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('رتبة التحقق التلقائي')
                .setDescription('اختر الرتبة التي سيتم منحها تلقائياً للأعضاء الجدد.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'autoverify_role_select',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first();

        if (role.id === rootInteraction.guild.id || role.managed) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.VALIDATION,
                message: 'يرجى اختيار رتبة عادية قابلة للتعيين (ليست @everyone أو رتبة مخصصة للبوتات/الربط).',
            });
            return;
        }

        const botMember = rootInteraction.guild.members.me;
        if (role.position >= botMember.roles.highest.position) {
            await replyUserError(roleInteraction, {
                type: ErrorTypes.PERMISSION,
                message: 'يجب أن تكون الرتبة المحددة أقل من أعلى رتبة يمتلكها البوت في ترتيب رتب السيرفر.',
            });
            return;
        }

        guildConfig.verification.autoVerify.roleId = role.id;
        await setGuildConfig(client, guildId, guildConfig);

        await roleInteraction.followUp({
            embeds: [successEmbed('تم تحديث الرتبة', `تم تعيين رتبة التحقق التلقائي إلى ${role}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId, client);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            replyUserError(selectInteraction, {
                type: ErrorTypes.RATE_LIMIT,
                message: 'لم يتم اختيار أي رتبة. لم يتم تغيير الإعدادات.',
            }).catch(() => {});
        }
    });
}

async function handleAccountAge(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('autoverify_account_age_modal')
       
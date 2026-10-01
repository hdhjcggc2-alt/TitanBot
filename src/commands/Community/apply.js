import { getColor, getDefaultApplicationQuestions } from '../../config/bot.js';
import { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, withErrorHandling, createError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import ApplicationService from '../../services/applicationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logEvent, EVENT_TYPES, resolveApplicationLogChannel } from '../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../utils/logging/logEmbeds.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { 
    getApplicationSettings, 
    getUserApplications, 
    createApplication, 
    getApplication,
    getApplicationRoles,
    updateApplication,
    getApplicationRoleSettings
} from '../../utils/database.js';

function getApplicationStatusPresentation(statusValue) {
    const normalized = typeof statusValue === 'string' ? statusValue.trim().toLowerCase() : 'unknown';
    const statusLabel =
        normalized === 'pending' ? 'قيد المراجعة' :
        normalized === 'approved' ? 'مقبول' :
        normalized === 'denied' ? 'مرفوض' :
        'غير معروف';
    const statusEmoji =
        normalized === 'pending' ? '🟡' :
        normalized === 'approved' ? '🟢' :
        normalized === 'denied' ? '🔴' :
        '⚪';

    return { normalized, statusLabel, statusEmoji };
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("إدارة طلبات الحصول على الرتب")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("submit")
                .setDescription("تقديم طلب للحصول على رتبة معينة")
                .addStringOption((option) =>
                    option
                        .setName("application")
                        .setDescription("الطلب الذي تريد تقديمه")
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("status")
                .setDescription("التحقق من حالة طلبك المقدم")
                .addStringOption((option) =>
                    option
                        .setName("id")
                        .setDescription("معرف الطلب (اتركه فارغاً لعرض كافة طلباتك)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("عرض قائمة الطلبات المتاحة للتقديم عليها"),
        ),

    category: "Community",

    execute: withErrorHandling(async (interaction) => {
        if (!interaction.inGuild()) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'لا يمكن استخدام هذا الأمر إلا داخل السيرفرات.' });
        }

        const { options, guild, member } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand !== "submit") {
            const isListCommand = subcommand === "list";
            await InteractionHelper.safeDefer(interaction, { flags: isListCommand ? [] : ["Ephemeral"] });
        }

        logger.info(`Apply command executed: ${subcommand}`, {
            userId: interaction.user.id,
            guildId: guild.id,
            subcommand
        });

        const settings = await getApplicationSettings(
            interaction.client,
            guild.id,
        );
        
        if (!settings.enabled) {
            throw createError(
                'Applications are disabled',
                ErrorTypes.CONFIGURATION,
                'الطلبات معطلة حالياً في هذا السيرفر.',
                { guildId: guild.id }
            );
        }

        if (subcommand === "submit") {
            await handleSubmit(interaction, settings);
        } else if (subcommand === "status") {
            await handleStatus(interaction);
        } else if (subcommand === "list") {
            await handleList(interaction);
        }
    }, { type: 'command', commandName: 'apply' })
};

export async function handleApplicationModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    
    const customId = interaction.customId;
    if (!customId.startsWith('app_modal_')) return;
    
    const roleId = customId.split('_')[2];
    
    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    const applicationRole = applicationRoles.find(appRole => appRole.roleId === roleId);
    
    if (!applicationRole) {
        return await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: 'لم يتم العثور على إعدادات الطلب.' });
    }
    
    const role = interaction.guild.roles.cache.get(roleId);
    
    if (!role) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'لم يتم العثور على الرتبة المطلوبة.' });
    }
    
    const answers = [];
    const settings = await getApplicationSettings(interaction.client, interaction.guild.id);

    let questions = settings.questions?.length ? settings.questions : getDefaultApplicationQuestions();
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }
    
    for (let i = 0; i < questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`q${i}`);
        answers.push({
            question: questions[i],
            answer: answer
        });
    }
    
    try {
        const application = await ApplicationService.submitApplication(interaction.client, {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            roleId: roleId,
            roleName: applicationRole.name,
            username: interaction.user.tag,
            avatar: interaction.user.displayAvatarURL(),
            answers: answers
        });
        
        const embed = successEmbed(
            'تم تقديم الطلب بنجاح',
            `تم تقديم طلبك للحصول على رتبة **${applicationRole.name}** بنجاح!\n\n` +
            `معرف الطلب: \`${application.id}\`\n` +
            `يمكنك التحقق من حالة الطلب باستخدام الأمر \`/apply status id:${application.id}\``
        );
        
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
        
        const settings = await getApplicationSettings(interaction.client, interaction.guild.id);
        const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, roleId);
        const guildConfig = await getGuildConfig(interaction.client, interaction.guild.id);

        const logChannelId = resolveApplicationLogChannel(guildConfig, roleSettings, settings);

        if (logChannelId) {
            const logMessage = await logEvent({
                client: interaction.client,
                guildId: interaction.guild.id,
                eventType: EVENT_TYPES.APPLICATION_SUBMIT,
                channelId: logChannelId,
                data: {
                    title: 'تم تقديم طلب جديد',
                    lines: [
                        formatLogLine('المتقدم', `<@${interaction.user.id}> (${interaction.user.tag})`),
                        formatLogLine('الطلب', applicationRole.name),
                        formatLogLine('الرتبة', role.name),
                        formatLogLine('معرف الطلب', `\`${application.id}\``),
                    ],
                    inlineFields: [
                        { name: 'الحالة', value: '🟡 قيد المراجعة', inline: true },
                    ],
                    author: await resolveUserAuthor(interaction.client, interaction.user.id),
                },
            });

            if (logMessage) {
                await updateApplication(interaction.client, interaction.guild.id, application.id, {
                    logMessageId: logMessage.id,
                    logChannelId,
                });
            }
        }
        
    } catch (error) {
        logger.error('Error creating application:', {
            error: error.message,
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            roleId,
            stack: error.stack
        });
        
        await handleInteractionError(interaction, error, {
            type: 'modal',
            handler: 'application_submission'
        });
    }
}

async function handleList(interaction) {
    try {
        const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
        
        if (applicationRoles.length === 0) {
            return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'لا توجد أي طلبات متاحة حالياً.' });
        }

        const embed = createEmbed({
            title: "الطلبات المتاحة",
            description: "إليك قائمة الرتب التي يمكنك التقديم عليها:"
        });

        applicationRoles.forEach((appRole, index) => {
            const role = interaction.guild.roles.cache.get(appRole.roleId);
            embed.addFields({
                name: `${index + 1}.${appRole.name}`,
                value: `**الرتبة:** ${role ? `<@&${appRole.roleId}>` : 'الرتبة غير موجودة'}\n` +
                       `**طريقة التقديم:** \`/apply submit application:"${appRole.name}"\``,
                inline: false
            });
        });

        embed.setFooter({
            text: "استخدم /apply submit application:<الاسم> للتقديم على أي من هذه الرتب."
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error listing applications:', {
            error: error.message,
            guildId: interaction.guild.id,
            stack: error.stack
        });
        
        throw createError(
            'Failed to load applications',
            ErrorTypes.DATABASE,
            'فشل تحميل الطلبات. يرجى المحاولة مرة أخرى لاحقاً.',
            { guildId: interaction.guild.id }
        );
    }
}

async function handleSubmit(interaction, settings) {
    const applicationName = interaction.options.getString("application");
    const member = interaction.member;

    const applicationRoles = await getApplicationRoles(interaction.client, interaction.guild.id);
    
    const applicationRole = applicationRoles.find(appRole => 
        appRole.name.toLowerCase() === applicationName.toLowerCase()
    );

    if (!applicationRole) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'استخدم الأمر `/apply list` لعرض الطلبات المتاحة.' });
    }

    const userApps = await getUserApplications(
        interaction.client,
        interaction.guild.id,
        interaction.user.id,
    );
    const pendingApp = userApps.find((app) => app.status === "pending");

    if (pendingApp) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'لديك طلب قيد المراجعة بالفعل. يرجى الانتظار حتى يتم مراجعته.' });
    }

    const role = interaction.guild.roles.cache.get(applicationRole.roleId);
    if (!role) {
        return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'الرتبة الخاصة بهذا الطلب لم تعد موجودة.' });
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${applicationRole.roleId}`)
        .setTitle(`تقديم طلب لـ ${applicationRole.name}`);

    let questions = settings.questions?.length ? settings.questions : getDefaultApplicationQuestions();
    const roleSettings = await getApplicationRoleSettings(interaction.client, interaction.guild.id, applicationRole.roleId);
    if (roleSettings.questions && roleSettings.questions.length > 0) {
        questions = roleSettings.questions;
    }

    questions.forEach((question, index) => {
        const input = new TextInputBuilder()
            .setCustomId(`q${index}`)
            .setLabel(
                question.length > 45
                    ? `${question.substring(0, 42)}...`
                    : question,
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
    });

    await interaction.showModal(modal);
}

async function handleStatus(interaction) {
    const appId = interaction.options.getString("id");

    if (appId) {
        const application = await getApplication(
            interaction.client,
            interaction.guild.id,
            appId,
        );

        if (!application || application.userId !== interaction.user.id) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'لم يتم العثور على الطلب أو ليس لديك صلاحية لعرضه.' });
        }

        const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
        const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
            ? submittedAt.toLocaleString()
            : 'تاريخ غير معروف';
        const statusView = getApplicationStatusPresentation(application.status);
        const embed = createEmbed({
            title: `الطلب #${application.id} - ${application.roleName || 'رتبة غير معروفة'}`,
            description:
                `**معرف الطلب:** \`${application.id}\`\n` +
                `**الحالة:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                `**تاريخ التقديم:** ${submittedAtDisplay}`
        });

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    } else {
        const applications = await getUserApplications(
            interaction.client,
            interaction.guild.id,
            interaction.user.id,
        );

        if (applications.length === 0) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'لم تقم بتقديم أي طلبات حتى الآن.' });
        }

        const recentApplications = applications
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, 10);

        const embed = createEmbed({
            title: "طلباتك المقدمة",
            description: `عرض أحدث ${recentApplications.length} طلب/طلبات.`
        });

        recentApplications.forEach((application) => {
            const submittedAt = application?.createdAt ? new Date(application.createdAt) : null;
            const submittedAtDisplay = submittedAt && !Number.isNaN(submittedAt.getTime())
                ? submittedAt.toLocaleDateString()
                : 'تاريخ غير معروف';
            const statusView = getApplicationStatusPresentation(application.status);

            embed.addFields({
                name: `${statusView.statusEmoji} ${application.roleName || 'رتبة غير معروفة'} (${statusView.statusLabel})`,
                value:
                    `**المعرف:** \`${application.id}\`\n` +
                    `**الحالة:** ${statusView.statusEmoji} ${statusView.statusLabel}\n` +
                    `**تاريخ التقديم:** ${submittedAtDisplay}`,
                inline: true,
            });
        });

        if (applications.length > recentApplications.length) {
            embed.setFooter({ text: `عرض أحدث ${recentApplications.length} من إجمالي ${applications.length} طلب.` });
        }

        return InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: ["Ephemeral"] });
    }
}

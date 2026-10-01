import { EmbedBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { getLoggingStatus } from '../../../services/loggingService.js';
import {
  createLoggingDashboardComponents,
  createLoggingCategoryViewComponents,
  createLoggingFilterComponents,
  DASHBOARD_CATEGORIES,
  DASHBOARD_CATEGORY_LABELS,
  EVENT_TYPES_BY_CATEGORY,
} from '../../../utils/logging/loggingUi.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export function getCategoryStatus(enabledEvents, category, auditEnabled) {
  if (!auditEnabled) return false;
  const events = enabledEvents || {};
  if (events[`${category}.*`] === false) return false;
  const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
  if (categoryEvents.length === 0) return true;
  return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatChannelMention(guild, id) {
  if (!id) return '`غير مكوّن`';
  const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
  return channel ? channel.toString() : `⚠️ مفقود (${id})`;
}

function countEnabledCategories(enabledEvents, auditEnabled) {
  const enabled = DASHBOARD_CATEGORIES.filter((key) =>
    getCategoryStatus(enabledEvents, key, auditEnabled),
  ).length;
  return { enabled, total: DASHBOARD_CATEGORIES.length };
}

export async function buildLoggingDashboardView(interaction, client) {
  const guildConfig = await getGuildConfig(client, interaction.guildId);
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);

  const auditEnabled = Boolean(loggingStatus.enabled);
  const channels = loggingStatus.channels || {};

  const auditChannel = await formatChannelMention(interaction.guild, channels.audit);
  const applicationsChannel = await formatChannelMention(interaction.guild, channels.applications);
  const reportsChannel = await formatChannelMention(interaction.guild, channels.reports);
  const lifecycleChannel = await formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId);
  const transcriptChannel = await formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId);

  const ignore = loggingStatus.ignore || { users: [], channels: [] };
  const { enabled: enabledCount, total } = countEnabledCategories(loggingStatus.enabledEvents, auditEnabled);

  const embed = new EmbedBuilder()
    .setTitle('📝 لوحة تحكم السجلات (Logging Dashboard)')
    .setDescription(`إدارة سجلات السيرفر لـ **${interaction.guild.name}**. استخدم القائمة أدناه لتكوين الرومات، الفئات، والتصفية.`)
    .setColor(auditEnabled ? getColor('success') : getColor('warning'))
    .addFields(
      {
        name: 'حالة السجلات',
        value: auditEnabled ? '✅ مفعلة' : '❌ معطلة',
        inline: true,
      },
      {
        name: 'فئات الأحداث',
        value: auditEnabled ? `${enabledCount}/${total} مفعلة` : '`السجلات معطلة`',
        inline: true,
      },
      {
        name: 'فلاتر التجاهل',
        value: `${ignore.users?.length \vert{}\vert{} 0} أعضاء · ${ignore.channels?.length || 0} رومات`,
        inline: true,
      },
      {
        name: 'رومات السجلات',
        value: [
          `**التدقيف (Audit):** ${auditChannel}`,
          `**التقديمات (Applications):** ${applicationsChannel}`,
          `**البلاغات (Reports):** ${reportsChannel}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'رومات التذاكر (للقراءة فقط)',
        value: [
          `**سجلات التذاكر:** ${lifecycleChannel}`,
          `**النصوص المحفوظة (Transcripts):** ${transcriptChannel}`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: 'رومات التذاكر: قم بتكوينها عبر /ticket dashboard' })
    .setTimestamp();

  const components = createLoggingDashboardComponents(loggingStatus.enabledEvents, auditEnabled);
  return { embed, components };
}

export async function buildLoggingCategoriesView(interaction, client) {
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);
  const auditEnabled = Boolean(loggingStatus.enabled);

  const categoryLines = DASHBOARD_CATEGORIES.map((key) => {
    const on = getCategoryStatus(loggingStatus.enabledEvents, key, auditEnabled);
    const label = DASHBOARD_CATEGORY_LABELS[key] || key;
    return `${on ? '✅' : '❌'} ${label}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📋 فئات الأحداث (Event Categories)')
    .setDescription(
      auditEnabled
        ? 'قم بتبديل وتحديد أنواع الأحداث التي سيتم تسجيلها في روم التدقيق.'
        : '⚠️ السجلات معطلة. قم بتفعيلها من لوحة التحكم الرئيسية لإرسال السجلات.',
    )
    .setColor(getColor('info'))
    .addFields({ name: 'حالة الفئات', value: categoryLines, inline: false })
    .setFooter({ text: 'أخضر = التسجيل مفعل · أحمر = التسجيل معطل' })
    .setTimestamp();

  const components = createLoggingCategoryViewComponents(loggingStatus.enabledEvents, auditEnabled);
  return { embed, components };
}

export async function buildLoggingFilterView(interaction, client) {
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);
  const ignore = loggingStatus.ignore || { users: [], channels: [] };

  const userLines = (ignore.users || []).length
    ? ignore.users.map((id) => `• عضو \`${id}\``).join('\n')
    : '*لا يوجد أعضاء متجاهلون*';

  const channelLines = (ignore.channels || []).length
    ? ignore.channels.map((id) => `• روم \`${id}\``).join('\n')
    : '*لا توجد رومات متجاهلة*';

  const embed = new EmbedBuilder()
    .setTitle('🔇 فلاتر تجاهل السجلات (Log Ignore Filters)')
    .setDescription('سيتم تخطي الأعضاء والرومات الموجودة في هذه القائمة عند إرسال سجلات التدقيق.')
    .setColor(getColor('info'))
    .addFields(
      { name: 'الأعضاء المتجاهلون', value: userLines.slice(0, 1024), inline: false },
      { name: 'الرومات المتجاهلة', value: channelLines.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'استخدم الأزرار أدناه لإضافة أو إزالة الفلاتر' })
    .setTimestamp();

  const components = createLoggingFilterComponents();
  return { embed, components };
}

export function isCategoriesView(interaction) {
  return interaction.message?.embeds?.[0]?.title?.includes('فئات الأحداث') || interaction.message?.embeds?.[0]?.title === '📋 Event Categories';
}

export function isFilterView(interaction) {
  return interaction.message?.embeds?.[0]?.title?.includes('فلاتر تجاهل السجلات') || interaction.message?.embeds?.[0]?.title === '🔇 Log Ignore Filters';
}

export async function refreshDashboardMessage(interaction, client) {
  let view;
  if (isCategoriesView(interaction)) {
    view = await buildLoggingCategoriesView(interaction, client);
  } else if (isFilterView(interaction)) {
    view = await buildLoggingFilterView(interaction, client);
  } else {
    view = await buildLoggingDashboardView(interaction, client);
  }

  await interaction.message.edit({
    embeds: [view.embed],
    components: view.components,
    content: null,
  }).catch(() => {});
}

export default {
  prefixOnly: false,
  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'تحتاج إلى صلاحية **إدارة السيرفر** (Manage Server) لعرض لوحة تحكم السجلات.' });
      }

      await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      const { embed, components } = await buildLoggingDashboardView(interaction, client);
      await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });
    } catch (error) {
      logger.error('logging_dashboard error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'فشل في تحميل لوحة تحكم السجلات.' });
    }
  },
};

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resolveCategoryChoice,
  buildCommandRegistry,
  isProtectedCommand,
} from '../../services/commandAccessService.js';
import {
  buildDashboardView,
  handleDashboardComponent,
  createDashboardCollectorFilter,
  isCommandAccessCustomId,
} from './modules/commands_dashboard.js';

const DASHBOARD_TIMEOUT_MS = 10 * 60 * 1000;

function buildCategoryChoices(client) {
  const registry = buildCommandRegistry(client);
  return [...registry.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 25)
    .map((category) => ({
      name: `${category.icon} ${category.displayName}`.slice(0, 100),
      value: category.key,
    }));
}

async function ensureManageGuild(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'تحتاج إلى صلاحية **إدارة السيرفر (Manage Server)** للتحكم في الأوامر.' });
    return false;
  }

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('تفعيل أو تعطيل أوامر وفئات البوت لهذا السيرفر')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('dashboard')
        .setDescription('فتح لوحة تحكم الوصول للأوامر التفاعلية'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('تعطيل أمر معين أو فئة كاملة')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('ما إذا كنت تريد تعطيل أمر واحد أو فئة بأكملها')
            .setRequired(true)
            .addChoices(
              { name: 'فئة (Category)', value: 'category' },
              { name: 'أمر (Command)', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('اسم الفئة أو الأمر المراد تعطيله')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('تفعيل أمر معين أو فئة كاملة')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('ما إذا كنت تريد تفعيل أمر واحد أو فئة بأكملها')
            .setRequired(true)
            .addChoices(
              { name: 'فئة (Category)', value: 'category' },
              { name: 'أمر (Command)', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('اسم الفئة أو الأمر المراد تفعيله')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  category: 'Core',

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'target') {
      return interaction.respond([]);
    }

    const scope = interaction.options.getString('scope');
    const query = focused.value.toLowerCase();

    if (scope === 'category') {
      const choices = buildCategoryChoices(interaction.client)
        .filter((choice) => choice.name.toLowerCase().includes(query) || choice.value.includes(query))
        .slice(0, 25);
      return interaction.respond(choices);
    }

    const registry = buildCommandRegistry(interaction.client);
    const allCommands = [];
    
    const matchedCategory = resolveCategoryChoice(interaction.client, query);
    
    if (matchedCategory) {
      for (const command of matchedCategory.commands) {
        if (!isProtectedCommand(command.name)) {
          allCommands.push(command.name);
        }
      }
    } else {
      for (const category of registry.values()) {
        for (const command of category.commands) {
          if (!isProtectedCommand(command.name)) {
            allCommands.push(command.name);
          }
        }
      }
    }

    const choices = allCommands
      .filter((name) => name.includes(query))
      .slice(0, 25)
      .map((name) => ({ name: `/${name}`, value: name }));

    return interaction.respond(choices);
  },

  async execute(interaction, config, client) {
    if (!(await ensureManageGuild(interaction))) {
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'dashboard') {
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) {
        return;
      }

      const view = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [view.embed],
        components: view.components,
      });

      const replyMessage = await interaction.fetchReply().catch(() => null);
      if (!replyMessage) {
        return;
      }

      const collector = replyMessage.createMessageComponentCollector({
        filter: createDashboardCollectorFilter(interaction.user.id, interaction.guildId),
        time: DASHBOARD_TIMEOUT_MS,
      });

      collector.on('collect', async (componentInteraction) => {
        try {
          if (!isCommandAccessCustomId(componentInteraction.customId)) {
            return;
          }
          await handleDashboardComponent(componentInteraction, client);
        } catch (error) {
          logger.error('Command access dashboard interaction failed', {
            error: error.message,
            customId: componentInteraction.customId,
            guildId: interaction.guildId,
          });
          await replyUserError(componentInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: error.message || 'فشل تحديث صلاحيات الوصول للأوامر.',
          }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        const finalView = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
        const disabledComponents = finalView.components.map((row) => {
          const newRow = row.toJSON();
          newRow.components = newRow.components.map((component) => ({ ...component, disabled: true }));
          return newRow;
        });

        await replyMessage.edit({ components: disabledComponents }).catch(() => {});
      });

      return;
    }

    const scope = interaction.options.getString('scope');
    const target = interaction.options.getString('target');
    const isDisable = subcommand === 'disable';

    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) {
      return;
    }

    if (scope === 'category') {
      const category = resolveCategoryChoice(client, target);
      if (!category) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `لم يتم العثور على أي فئة تطابق \`${target}\`. استخدم \`/commands dashboard\` لتصفح الفئات.` });
      }

      if (isDisable) {
        await disableCategory(client, interaction.guildId, category.key);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'تم تعطيل الفئة',
              `تم الآن تعطيل كافة أوامر فئة **${category.displayName}**.\nتبقى الأوامر المحمية متاحة للاستخدام.`,
            ),
          ],
        });
      }

      await enableCategory(client, interaction.guildId, category.key);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('تم تفعيل الفئة', `تم تفعيل أوامر فئة **${category.displayName}** (باستثناء الأوامر المعطلة بشكل فردي).`)],
      });
    }

    const commandName = target.toLowerCase();
    if (isDisable) {
      await disableCommand(client, interaction.guildId, commandName);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('تم تعطيل الأمر', `تم تعطيل الأمر \`/${commandName}\` في هذا السيرفر.`)],
      });
    }

    await enableCommand(client, interaction.guildId, commandName);
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed('تم تفعيل الأمر', `تم تفعيل الأمر \`/${commandName}\` في هذا السيرفر بنجاح.`)],
    });
  },
};

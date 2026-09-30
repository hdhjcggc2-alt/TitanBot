import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("تحديد مستوى أولوية تذكرة الدعم الفني الحالية.")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("مستوى الأولوية للتذكرة.")
                .setRequired(true)
                .addChoices(
                    { name: "عاجل (Urgent)", value: "urgent" },
                    { name: "عالي (High)", value: "high" },
                    { name: "متوسط (Medium)", value: "medium" },
                    { name: "منخفض (Low)", value: "low" },
                    { name: "بدون أولوية (None)", value: "none" },
                ),
            )
        .setDMPermission(false),
    category: "Ticket",

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'يمكن استخدام هذا الأمر فقط داخل روم تذكرة صالحة.' });
        }

        if (!permissionContext.canManageTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'أنت بحاجة إلى صلاحية `إدارة القنوات (Manage Channels)` أو رتبة `طاقم الدعم (Ticket Staff Role)` لتغيير أولوية التذكرة.' });
        }

        const priorityLevel = interaction.options.getString("level");
        await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);

        const priorityNamesAr = {
            urgent: "عاجل (URGENT)",
            high: "عالي (HIGH)",
            medium: "متوسط (MEDIUM)",
            low: "منخفض (LOW)",
            none: "بدون أولوية (NONE)"
        };

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "تم تحديث الأولوية",
                    `تم تعيين أولوية التذكرة إلى **${priorityNamesAr[priorityLevel] || priorityLevel.toUpperCase()}**.`,
                ),
            ],
        });

        logger.info('Ticket priority updated successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            priority: priorityLevel,
            commandName: 'priority'
        });
    },
};

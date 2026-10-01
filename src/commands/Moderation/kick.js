import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("طرد مستخدم من السيرفر")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("المستخدم المراد طرده")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("سبب الطرد"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "الإشراف",

    async execute(interaction, config, client) {
        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason") || "لم يتم تقديم سبب";

        if (!targetUser) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'يجب عليك تحديد مستخدم لطرده.',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotError(
                "Cannot kick self",
                ErrorTypes.VALIDATION,
                "لا يمكنك طرد نفسك.",
            );
        }

        if (targetUser.id === client.user.id) {
            throw new TitanBotError(
                "Cannot kick bot",
                ErrorTypes.VALIDATION,
                "لا يمكنك طرد البوت.",
            );
        }

        if (!member) {
            throw new TitanBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "المستخدم المستهدف غير موجود حالياً في هذا السيرفر.",
                { subtype: 'user_not_found' },
            );
        }

        const result = await ModerationService.kickUser({
            guild: interaction.guild,
            member,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `👢 **تم طرد** ${targetUser.tag}`,
                    `**السبب:** ${reason}\n**رقم الحالة:** #${result.caseId}`,
                ),
            ],
        });
    },
};

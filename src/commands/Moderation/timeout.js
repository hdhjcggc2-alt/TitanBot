import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';

const durationChoices = [
    { name: "5 دقائق", value: 5 },
    { name: "10 دقائق", value: 10 },
    { name: "30 دقيقة", value: 30 },
    { name: "ساعة واحدة", value: 60 },
    { name: "6 ساعات", value: 360 },
    { name: "يوم واحد", value: 1440 },
    { name: "أسبوع واحد", value: 10080 },
];

export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("إسكات (Timeout) مستخدم لفترة زمنية محددة")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("المستخدم المراد إسكاته")
                .setRequired(true),
        )
        .addIntegerOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("مدة الإسكات")
                    .setRequired(true)
                    .addChoices(...durationChoices),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("سبب الإسكات"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "الإشراف",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Timeout interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'timeout',
            });
            return;
        }

        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const durationMinutes = interaction.options.getInteger("duration");
        const reason = interaction.options.getString("reason") || "لم يتم تقديم سبب";

        if (!targetUser) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'يجب عليك تحديد مستخدم لإسكاته.',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotError(
                "Cannot timeout self",
                ErrorTypes.VALIDATION,
                "لا يمكنك إسكات نفسك.",
            );
        }
        if (targetUser.id === client.user.id) {
            throw new TitanBotError(
                "Cannot timeout bot",
                ErrorTypes.VALIDATION,
                "لا يمكنك إسكات البوت.",
            );
        }
        if (!member) {
            throw new TitanBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "المستخدم المستهدف غير موجود حالياً في هذا السيرفر.",
            );
        }

        const durationMs = durationMinutes * 60 * 1000;
        const result = await ModerationService.timeoutUser({
            guild: interaction.guild,
            member,
            moderator: interaction.member,
            durationMs,
            reason,
        });

        const durationDisplay =
            durationChoices.find((c) => c.value === durationMinutes)
                ?.name || `${durationMinutes} دقائق`;

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `⏳ **تم إسكات** ${targetUser.tag} لمدة ${durationDisplay}.`,
                    `**السبب:** ${reason}\n**رقم الحالة:** #${result.caseId}`,
                ),
            ],
        });
    },
};

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { verifyUser } from '../../services/verificationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('تأكيد هويتك وللحصول على صلاحية الوصول إلى السيرفر'),

    async execute(interaction, config, client) {
        const guild = interaction.guild;

        const result = await verifyUser(client, guild.id, interaction.user.id, {
            source: 'command_self',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await InteractionHelper.safeReply(interaction, {
                embeds: [infoEmbed('مؤكد بالفعل', 'أنت مؤكد بالفعل في هذا السيرفر.')],
                flags: MessageFlags.Ephemeral
            });
        }

        await InteractionHelper.safeReply(interaction, {
            embeds: [successEmbed(
                'اكتمل التحقق بنجاح',
                `تم تأكيد هويتك وإعطاؤك رتبة **${result.roleName}**! مرحباً بك في السيرفر! 🎉`
            )],
            flags: MessageFlags.Ephemeral
        });
    }
};

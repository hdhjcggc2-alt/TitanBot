import { EmbedBuilder } from 'discord.js';
import { deleteBirthday } from '../../../services/birthdayService.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const result = await deleteBirthday(client, guildId, userId);

        if (result.status === 'not_found') {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('لم يتم العثور على عيد ميلاد')
                .setDescription('ليس لديك تاريخ ميلاد مسجل حتى تقم بحذفه.');
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('تم حذف عيد الميلاد')
            .setDescription('تم إزالة تاريخ ميلادك بنجاح من سجلات السيرفر.');
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });
    }
};

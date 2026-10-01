import { EmbedBuilder } from 'discord.js';
import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const next5 = await getUpcomingBirthdays(client, interaction.guildId, 5);

        if (next5.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('لم يتم العثور على أعياد ميلاد')
                .setDescription('لم يتم تعيين أي أعياد ميلاد في هذا السيرفر بعد. استخدم الأمر `/birthday set` لإضافة عيد ميلادك!');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        let displayIndex = 0;
        for (const birthday of next5) {
            const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
            if (!member) {
                deleteBirthday(client, interaction.guildId, birthday.userId).catch(() => null);
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **اليوم!**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **غداً!**';
            } else {
                timeUntil = `خلال ${birthday.daysUntil} يوم`;
            }
        }

        if (displayIndex === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('لا توجد أعياد ميلاد قادمة')
                .setDescription('لم يتم العثور على أعياد ميلاد قادمة لأعضاء السيرفر الحاليين.');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        let birthdayList = `🎂 **أقرب 5 أعياد ميلاد قادمة**\n\nإليك أقرب 5 أعياد ميلاد في ${interaction.guild.name}:\n\n`;
        displayIndex = 0;
        for (const birthday of next5) {
            const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
            if (!member) {
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **اليوم!**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **غداً!**';
            } else {
                timeUntil = `خلال ${birthday.daysUntil} يوم`;
            }

            birthdayList += `${displayIndex}. **${member.displayName}**\n<@${birthday.userId}>\n📅 **التاريخ:** ${birthday.day} ${birthday.monthName}\n⏰ **الوقت المتبقي:** ${timeUntil}\n\n`;
        }

        birthdayList += `استخدم الأمر /birthday set لإضافة عيد ميلادك!`;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('أقرب 5 أعياد ميلاد قادمة')
            .setDescription(birthdayList);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info('Next birthdays retrieved successfully', {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            upcomingCount: displayIndex,
            commandName: 'next_birthdays'
        });
    }
};

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('wipedata')
        .setDescription('حذف جميع بياناتك الشخصية من البوت (إجراء لا يمكن التراجع عنه)'),

    async execute(interaction, guildConfig, client) {
        const warningMessage = 
            `⚠️ **هذا الإجراء لا يمكن التراجع عنه!** ⚠️\n\n` +
            `سيؤدي هذا إلى حذف **جميع** بياناتك نهائياً من هذا السيرفر، بما في ذلك:\n` +
            `• 💰 الرصيد المالي (المحفظة والبنك)\n` +
            `• 📊 المستويات ونقاط الخبرة (XP)\n` +
            `• 🎒 عناصر حقيبة المستلزمات (Inventory)\n` +
            `• 🛍️ مشتريات المتجر\n` +
            `• 🎂 معلومات تاريخ الميلاد\n` +
            `• 🔢 بيانات العدادات\n` +
            `• 📋 كافة البيانات الشخصية الأخرى\n\n` +
            `**لا يمكن استعادة هذه البيانات بعد حذفها. هل أنت متأكد تماماً؟**`;

        const embed = warningEmbed('مسح جميع البيانات', warningMessage);

        const confirmButtons = getConfirmationButtons('wipedata');

        await InteractionHelper.safeReply(interaction, {
            embeds: [embed],
            components: [confirmButtons],
            flags: MessageFlags.Ephemeral
        });

        logger.info(`Wipedata command executed - confirmation prompt shown`, {
            userId: interaction.user.id,
            guildId: interaction.guildId
        });
    }
};

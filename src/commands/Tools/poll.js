import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_OPTIONS = 10;

export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('إنشاء تصويت بسيط يحتوي على ما يصل إلى 10 خيارات')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('سؤال التصويت')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('الخيار الأول')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('الخيار الثاني')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('الخيار الثالث (اختياري)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('الخيار الرابع (اختياري)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option5')
                .setDescription('الخيار الخامس (اختياري)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option6')
                .setDescription('الخيار السادس (اختياري)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option7')
                .setDescription('الخيار السابع (اختياري)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option8')
                .setDescription('الخيار الثامن (اختياري)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option9')
                .setDescription('الخيار التاسع (اختياري)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option10')
                .setDescription('الخيار العاشر (اختياري)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('anonymous')
                .setDescription('جعل التصويت مجهولاً (الافتراضي: لا)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn(`Poll interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'poll'
            });
            return;
        }

        const question = interaction.options.getString('question');
        const isAnonymous = interaction.options.getBoolean('anonymous') || false;

        const options = [];
        for (let i = 1; i <= MAX_OPTIONS; i++) {
            const option = interaction.options.getString(`option${i}`);
            if (option) options.push(option);
        }

        if (options.length < 2) {
            throw new Error("يجب عليك تحديد خيارين على الأقل للتصويت.");
        }

        let description = `**${question}**\n\n`;
        options.forEach((option, index) => {
            description += `${EMOJIS[index]} ${option}\n`;
        });

        if (isAnonymous) {
            description += '\n*هذا تصويت مجهول الهوية. لا يتم تعقب الأصوات للمستخدمين.*';
        } else {
            description += '\n*تفاعل مع الإيموجي للتصويت!*';
        }

        const embed = successEmbed(
            `📊 تصويت ${isAnonymous ? 'مجهول' : ''}`,
            description
        );

        const message = await interaction.channel.send({ embeds: [embed] });

        for (let i = 0; i < options.length; i++) {
            await message.react(EMOJIS[i]);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        await InteractionHelper.safeEditReply(interaction, {
            content: '✅ تم إنشاء التصويت بنجاح!',
        });
    },
};

import { MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';

export async function playQuery(client, interaction, query) {
    const channel = interaction.member?.voice?.channel;

    // التحقق من أن المستخدم داخل روم صوتي
    if (!channel) {
        return {
            embed: errorEmbed(
                "خطأ في الاتصال",
                "يجب أن تكون متصلاً بروم صوتي (Voice Channel) لتشغيل الموسيقى!"
            )
        };
    }

    // هنا يتم تنفيذ عملية التشغيل المباشر أو إضافة الأغنية للقائمة
    // يمكنك ربط هذه المنطقة بأي دالة تشغيل محلية ترغب بها

    return {
        embed: successEmbed(
            "🎶 جاري التشغيل",
            `تم استلام طلبك بنجاح والبحث عن:\n\`${query}\``
        )
    };
}

export async function replyMusicSuccess(interaction, embed) {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
}

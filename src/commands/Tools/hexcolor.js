import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('hexcolor')
        .setDescription('توليد لون هكس (Hex) عشوائي أو عرض تفاصيل لون محدد مع المعاينة')
        .addStringOption(option =>
            option.setName('color')
                .setDescription('رمز اللون بالتنسيق الهكس (مثال: FF5733# أو FF5733)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                let hexColor = interaction.options.getString('color');
                let isRandom = false;

                if (!hexColor) {
                    isRandom = true;
                    hexColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                } else {
                    hexColor = hexColor.replace('#', '');
                    if (!/^[0-9A-Fa-f]{3,6}$/.test(hexColor)) {
                        return await replyUserError(interaction, { 
                            type: ErrorTypes.VALIDATION, 
                            message: 'يرجى تقديم رمز كود هكس صحيح.\n\n**الصيغ المقبولة:**\n• `#FF5733` (مع علامة الهاش)\n• `FF5733` (بدون علامة الهاش)\n• `F57` (اختصار من 3 خانات)\n\n**غير صالح:** `#GG5733` (الحرف G ليس رقماً هكس)' 
                        });
                    }

                    if (hexColor.length === 3) {
                        hexColor = hexColor.split('').map(c => c + c).join('');
                    }

                    hexColor = '#' + hexColor.toUpperCase();
                }

                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);

                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                const textColor = brightness > 128 ? '#000000' : '#FFFFFF';

                const colorPreviewUrl = `https://dummyimage.com/200x100/${hexColor.replace('#', '')}/${textColor.replace('#', '')}?text=${encodeURIComponent(hexColor)}`;

                const colorName = getColorName(hexColor);

                const embed = successEmbed(
                    '🎨 معلومات اللون',
                    `**الهكس (Hex):** \`${hexColor}\`\n` +
                    `**RGB:** \`rgb(${r}, ${g},${b})\`\n` +
                    `**HSL:** \`${rgbToHsl(r, g, b)}\`\n` +
                    `**الاسم:** ${colorName || 'لون مخصص'}`
                )
                    .setColor(hexColor)
                    .setImage(colorPreviewUrl);

                if (isRandom) {
                    embed.setFooter({ text: 'لون تم توليده عشوائياً' });
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            'فشل توليد معلومات اللون. يرجى المحاولة مرة أخرى.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function getColorName(hex) {
    const colors = {
        '#FF0000': 'أحمر',
        '#00FF00': 'أخضر',
        '#0000FF': 'أزرق',
        '#FFFF00': 'أصفر',
        '#FF00FF': 'أرجواني (Magenta)',
        '#00FFFF': 'سماوي (Cyan)',
        '#000000': 'أسود',
        '#FFFFFF': 'أبيض',
        '#808080': 'رمادي',
        '#FFA500': 'برتقالي',
        '#800080': 'بنفسجي (Purple)',
        '#A52A2A': 'بني',
        '#FFC0CB': 'وردي',
        '#008000': 'أخضر داكن',
        '#000080': 'كحلي (Navy)',
        '#FFD700': 'ذهبي',
        '#C0C0C0': 'فضي',
        '#FF6347': 'طماطمي (Tomato)',
        '#40E0D0': 'فيروزي',
        '#E6E6FA': 'لافندر'
    };
    
    if (colors[hex.toUpperCase()]) {
        return colors[hex.toUpperCase()];
    }
    
    const hexValue = parseInt(hex.replace('#', ''), 16);
    let closestColor = '';
    let minDistance = Infinity;
    
    for (const [colorHex, name] of Object.entries(colors)) {
        const colorValue = parseInt(colorHex.replace('#', ''), 16);
        const distance = Math.abs(hexValue - colorValue);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = name;
        }
    }
    
    return minDistance < 1000000 ? `قريب من اللون ${closestColor}` : null;
}

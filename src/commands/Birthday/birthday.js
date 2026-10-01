import { SlashCommandBuilder, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';
import birthdaySetchannel from './modules/birthday_setchannel.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('أوامر نظام أعياد الميلاد')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('تحديد تاريخ ميلادك')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('شهر الميلاد (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('يوم الميلاد (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('عرض معلومات عيد الميلاد لعضو ما')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('العضو المراد التحقق من عيد ميلاده')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('عرض قائمة بجميع أعياد الميلاد المسجلة في السيرفر')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('حذف تاريخ ميلادك المسجل')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('next')
                .setDescription('عرض أعياد الميلاد القادمة قريباً')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('تعيين أو إلغاء روم إعلانات أعياد الميلاد. (يتطلب صلاحية إدارة السيرفر)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('روم النص المخصص للإعلانات. اتركه فارغاً للتعطيل.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'set':
                return await birthdaySet.execute(interaction, config, client);
            case 'info':
                return await birthdayInfo.execute(interaction, config, client);
            case 'list':
                return await birthdayList.execute(interaction, config, client);
            case 'remove':
                return await birthdayRemove.execute(interaction, config, client);
            case 'next':
                return await nextBirthdays.execute(interaction, config, client);
            case 'setchannel':
                return await birthdaySetchannel.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'أمر فرعي غير معروف.' });
        }
    }
};

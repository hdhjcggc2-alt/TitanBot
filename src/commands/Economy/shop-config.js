import { SlashCommandBuilder } from 'discord.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('تكوين إعدادات المتجر. (تتطلب صلاحية إدارة السيرفر)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('تعيين رتبة الديسكورد التي يتم منحها عند شراء رتبة البريميوم من المتجر.')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('الرتبة المراد منحها عند شراء رتبة البريميوم.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }
    },
};

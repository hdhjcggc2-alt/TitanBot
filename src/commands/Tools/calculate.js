import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { evaluateMathExpression } from '../../utils/safeMathParser.js';

const calculationContexts = new Map();

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

const calculationHistory = new Map();
const MAX_HISTORY = 5;

export { calculationContexts };

export default {
    data: new SlashCommandBuilder()
        .setName("calculate")
        .setDescription("حساب قيمة تعبير رياضي")
        .addStringOption((option) =>
            option
                .setName("expression")
                .setDescription(
                    "التعبير الرياضي المراد حسابه (مثال: 2+2*3, sin(45 deg), 16^0.5)",
                )
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Calculate interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'calculate'
            });
            return;
        }

        const expression = interaction.options.getString("expression");

        if (
            !/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: '**يحتوي على رموش أو أحرف غير مدعومة.**\n\n' +
                    '✅ المدعوم: الأرقام، الفواصل العشرية، + - * / ^ %، sin cos tan sqrt abs log exp، pi e، ()\n' +
                    '❌ غير مدعوم: الأقواس المربعة، الأقواس المزخرفة، والرموز الأخرى'
            });
        }

        const dangerousPatterns = [
            /\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i,
            /`/g,
            /\$\{.*\}/,
            /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/,
            /\b(?:while|for)\s*\([^)]*\)\s*\{/,
            /\b(?:function\*|yield|await|async)\b/,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: '**يحتوي على أنماط برمجية محظورة.**\n\n' +
                        '🚫 **محظور:** import, require, eval, Function, setTimeout, setInterval, process, fs, document, window, fetch، الحلقات التكرارية، البرمجة غير المتزامنة\n\n' +
                        'لا يُسمح باستخدام الصيغ البرمجية في الحسابات.'
                });
            }
        }

        let result;
        try {
            result = evaluate(expression);

            let formattedResult;
            if (typeof result === "number") {
                formattedResult = result.toLocaleString("en-US", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(result) > 0 &&
                    (Math.abs(result) >= 1e10 || Math.abs(result) < 1e-3)
                ) {
                    formattedResult = result.toExponential(6);
                }
            } else if (typeof result === "boolean") {
                formattedResult = result ? "صحيح (true)" : "خاطئ (false)";
            } else if (result === null || result === undefined) {
                formattedResult = "لا توجد نتيجة";
            } else if (
                Array.isArray(result) ||
                typeof result === "object"
            ) {
                formattedResult =
                    "```json\n" + JSON.stringify(result, null, 2) + "\n

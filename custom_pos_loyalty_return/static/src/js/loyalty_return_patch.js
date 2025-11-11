/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { roundPrecision } from "@web/core/utils/numbers";

/**
 * Patch PosOrder to handle loyalty point deduction for returned products
 * When a product quantity is negative (return), loyalty points are deducted
 */
patch(PosOrder.prototype, {
    /**
     * Override pointsForPrograms to handle negative quantities (returns)
     * This allows deduction of loyalty points when products are returned
     */
    pointsForPrograms(programs) {
        // Call the original method but we need to patch specific parts
        // We'll override the entire method to handle negative quantities properly
        const pointsForProgramsCountedRules = {};
        const orderLines = this.get_orderlines();
        const linesPerRule = {};
        
        for (const line of orderLines) {
            const reward = line.reward_id;
            const isDiscount = reward && reward.reward_type === "discount";
            const rewardProgram = reward && reward.program_id;
            // Skip lines for automatic discounts.
            if (isDiscount && rewardProgram && rewardProgram.trigger === "auto") {
                continue;
            }
            for (const program of programs) {
                // Skip lines for the current program's discounts.
                if (isDiscount && rewardProgram && rewardProgram.id === program.id) {
                    continue;
                }
                for (const rule of program.rule_ids) {
                    // Skip lines to which the rule doesn't apply.
                    if (rule.any_product || rule.validProductIds.has(line.product_id.id)) {
                        if (!linesPerRule[rule.id]) {
                            linesPerRule[rule.id] = [];
                        }
                        linesPerRule[rule.id].push(line);
                    }
                }
            }
        }
        
        const result = {};
        for (const program of programs) {
            let points = 0;
            const splitPoints = [];
            for (const rule of program.rule_ids) {
                if (
                    rule.mode === "with_code" &&
                    !this.uiState.codeActivatedProgramRules.includes(rule.id)
                ) {
                    continue;
                }
                const linesForRule = linesPerRule[rule.id] ? linesPerRule[rule.id] : [];
                const amountWithTax = linesForRule.reduce(
                    (sum, line) => sum + line.get_price_with_tax(),
                    0
                );
                const amountWithoutTax = linesForRule.reduce(
                    (sum, line) => sum + line.get_price_without_tax(),
                    0
                );
                const amountCheck =
                    (rule.minimum_amount_tax_mode === "incl" && amountWithTax) || amountWithoutTax;
                // Use absolute value for minimum amount check to handle returns
                if (rule.minimum_amount > Math.abs(amountCheck)) {
                    continue;
                }
                let totalProductQty = 0;
                // Only count points for paid lines.
                const qtyPerProduct = {};
                let orderedProductPaid = 0;
                for (const line of orderLines) {
                    if (
                        ((!line.reward_product_id &&
                            (rule.any_product || rule.validProductIds.has(line.product_id.id))) ||
                            (line.reward_product_id &&
                                (rule.any_product ||
                                    rule.validProductIds.has(line._reward_product_id?.id)))) &&
                        !line.ignoreLoyaltyPoints({ program })
                    ) {
                        // We only count reward products from the same program to avoid unwanted feedback loops
                        if (line.is_reward_line) {
                            const reward = line.reward_id;
                            if (
                                program.id === reward.program_id.id ||
                                ["gift_card", "ewallet"].includes(reward.program_id.program_type)
                            ) {
                                continue;
                            }
                        }
                        const lineQty = line._reward_product_id
                            ? -line.get_quantity()
                            : line.get_quantity();
                        if (qtyPerProduct[line._reward_product_id || line.get_product().id]) {
                            qtyPerProduct[line._reward_product_id || line.get_product().id] +=
                                lineQty;
                        } else {
                            qtyPerProduct[line._reward_product_id?.id || line.get_product().id] =
                                lineQty;
                        }
                        orderedProductPaid += line.get_price_with_tax();
                        if (!line.is_reward_line) {
                            totalProductQty += lineQty;
                        }
                    }
                }
                // Modified: Use absolute value for minimum quantity check to handle returns
                if (Math.abs(totalProductQty) < rule.minimum_qty) {
                    continue;
                }
                if (!(program.id in pointsForProgramsCountedRules)) {
                    pointsForProgramsCountedRules[program.id] = [];
                }
                pointsForProgramsCountedRules[program.id].push(rule.id);
                if (
                    program.applies_on === "future" &&
                    rule.reward_point_split &&
                    rule.reward_point_mode !== "order"
                ) {
                    // In this case we count the points per rule
                    if (rule.reward_point_mode === "unit") {
                        // Modified: Handle negative quantities for returns
                        const absQty = Math.abs(totalProductQty);
                        const sign = totalProductQty >= 0 ? 1 : -1;
                        if (absQty > 0) {
                            splitPoints.push(
                                ...Array.apply(null, Array(absQty)).map(() => ({
                                    points: rule.reward_point_amount * sign,
                                }))
                            );
                        }
                    } else if (rule.reward_point_mode === "money") {
                        // Modified: Handle negative quantities for returns
                        for (const line of orderLines) {
                            if (
                                line.is_reward_line ||
                                !rule.validProductIds.has(line.product_id.id) ||
                                line.ignoreLoyaltyPoints({ program })
                            ) {
                                continue;
                            }
                            const lineQty = line.get_quantity();
                            // Modified: Include negative quantities (returns)
                            if (lineQty === 0) {
                                continue;
                            }
                            const absQty = Math.abs(lineQty);
                            const sign = lineQty >= 0 ? 1 : -1;
                            const pointsPerUnit = roundPrecision(
                                (rule.reward_point_amount * line.get_price_with_tax()) / absQty,
                                0.01
                            );
                            const finalPoints = pointsPerUnit * sign;
                            if (finalPoints !== 0) {
                                splitPoints.push(
                                    ...Array.apply(null, Array(absQty)).map(() => {
                                        if (line._gift_barcode && absQty === 1) {
                                            return {
                                                points: finalPoints,
                                                barcode: line._gift_barcode,
                                                giftCardId: line._gift_card_id.id,
                                            };
                                        }
                                        return { points: finalPoints };
                                    })
                                );
                            }
                        }
                    }
                } else {
                    // In this case we add on to the global point count
                    // This already handles negative values correctly
                    if (rule.reward_point_mode === "order") {
                        points += rule.reward_point_amount;
                    } else if (rule.reward_point_mode === "money") {
                        // NOTE: unlike in sale_loyalty this performs a round half-up instead of round down
                        // This already handles negative values (returns) correctly
                        points += roundPrecision(
                            rule.reward_point_amount * orderedProductPaid,
                            0.01
                        );
                    } else if (rule.reward_point_mode === "unit") {
                        // This already handles negative values (returns) correctly
                        points += rule.reward_point_amount * totalProductQty;
                    }
                }
            }
            const res = points || program.program_type === "coupons" ? [{ points }] : [];
            if (splitPoints.length) {
                res.push(...splitPoints);
            }
            result[program.id] = res;
        }
        return result;
    },
});


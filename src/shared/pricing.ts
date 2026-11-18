import type { DiscountMode } from './types';

export interface PricingLineInput {
  line_total: number;
  cost_price: number;
  quantity: number;
}

export interface InvoicePricingBreakdown {
  subtotal: number;
  totalCost: number;
  totalProfitMargin: number;
  discountMode: DiscountMode;
  discountInputValue: number;
  discountAmount: number;
  netTotal: number;
  profit: number;
  effectiveDiscountPct: number;
  isBelowCost: boolean;
  belowCostLossAmount: number;
}

function round2(val: number): number {
  return Math.round((Number(val) || 0) * 100) / 100;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(val) || 0));
}

/**
 * Pure shared pricing engine used identically by POS UI and authoritative SQLite persistence.
 */
export function calculateInvoicePricing(
  lines: PricingLineInput[],
  discountMode: DiscountMode = 'AMOUNT',
  rawInputValue: number = 0
): InvoicePricingBreakdown {
  let subtotal = 0;
  let totalCost = 0;
  let totalProfitMargin = 0;
  let hasBelowCostLine = false;

  for (const line of lines) {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const lineTotal = round2(line.line_total);
    const lineCost = round2((Number(line.cost_price) || 0) * qty);
    const lineMargin = Math.max(0, round2(lineTotal - lineCost));

    subtotal = round2(subtotal + lineTotal);
    totalCost = round2(totalCost + lineCost);
    totalProfitMargin = round2(totalProfitMargin + lineMargin);

    if (lineTotal + 0.01 < lineCost) {
      hasBelowCostLine = true;
    }
  }

  let inputValue = Math.max(0, Number(rawInputValue) || 0);
  let discountAmount = 0;

  switch (discountMode) {
    case 'TOTAL_PCT': {
      inputValue = clamp(inputValue, 0, 100);
      discountAmount = round2(subtotal * (inputValue / 100));
      break;
    }
    case 'PROFIT_PCT': {
      inputValue = clamp(inputValue, 0, 100);
      discountAmount = round2(totalProfitMargin * (inputValue / 100));
      break;
    }
    case 'WHOLESALE_COST': {
      discountAmount = Math.max(0, round2(subtotal - totalCost));
      inputValue = discountAmount;
      break;
    }
    case 'AMOUNT':
    default: {
      discountAmount = Math.min(subtotal, round2(inputValue));
      break;
    }
  }

  discountAmount = Math.max(0, Math.min(subtotal, discountAmount));
  const netTotal = Math.max(0, round2(subtotal - discountAmount));
  const profit = round2(netTotal - totalCost);
  const isBelowCost = hasBelowCostLine || netTotal + 0.01 < totalCost;
  const belowCostLossAmount = netTotal < totalCost ? round2(totalCost - netTotal) : 0;
  const effectiveDiscountPct = subtotal > 0 ? round2((discountAmount / subtotal) * 100) : 0;

  return {
    subtotal,
    totalCost,
    totalProfitMargin,
    discountMode,
    discountInputValue: inputValue,
    discountAmount,
    netTotal,
    profit,
    effectiveDiscountPct,
    isBelowCost,
    belowCostLossAmount
  };
}

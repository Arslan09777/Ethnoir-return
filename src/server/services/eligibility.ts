export interface EligibilityCheckItem {
  orderItemId: string;
  quantityRequested: number;
  price: number;
  isReturnable: boolean;
  purchasedQuantity: number;
  alreadyReturnedQuantity: number;
}

export interface OrderEligibilityInput {
  orderNumber: string;
  fulfillmentStatus: string | null;
  deliveryDate: Date | string | null;
  createdAt: Date | string;
  items: EligibilityCheckItem[];
  returnWindowDays: number;
}

export interface EligibilityResult {
  isEligible: boolean;
  reasons: string[];
  daysRemaining: number;
  itemResults: {
    orderItemId: string;
    isEligible: boolean;
    availableQuantity: number;
    maxRefundAmount: number;
    reason?: string;
  }[];
}

/**
 * Validates order and item-level eligibility for returns and replacements
 */
export function checkOrderReturnEligibility(input: OrderEligibilityInput): EligibilityResult {
  const reasons: string[] = [];
  let isEligible = true;

  // 1. Check fulfillment status: Must be FULFILLED or delivered
  const fulfilledStatuses = ['FULFILLED', 'DELIVERED', 'SHIPPED'];
  const currentStatus = (input.fulfillmentStatus || '').toUpperCase();
  if (!fulfilledStatuses.includes(currentStatus)) {
    isEligible = false;
    reasons.push(`Order is currently '${input.fulfillmentStatus || 'UNFULFILLED'}'. Only fulfilled/delivered orders are eligible for return or replacement.`);
  }

  // 2. Check return window: Default 7 days from delivery date (or order date if delivery date not recorded)
  const referenceDate = input.deliveryDate ? new Date(input.deliveryDate) : new Date(input.createdAt);
  const now = new Date();
  const diffTime = now.getTime() - referenceDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, input.returnWindowDays - diffDays);

  if (diffDays > input.returnWindowDays) {
    isEligible = false;
    reasons.push(`The ${input.returnWindowDays}-day return window expired ${diffDays - input.returnWindowDays} day(s) ago (delivered/ordered on ${referenceDate.toISOString().split('T')[0]}).`);
  }

  // 3. Check individual items
  const itemResults = input.items.map(item => {
    const availableQuantity = Math.max(0, item.purchasedQuantity - item.alreadyReturnedQuantity);
    const maxRefundAmount = availableQuantity * item.price;
    let itemEligible = true;
    let itemReason: string | undefined;

    if (!item.isReturnable) {
      itemEligible = false;
      itemReason = 'This item is designated as final sale / non-returnable.';
    } else if (availableQuantity <= 0) {
      itemEligible = false;
      itemReason = 'All purchased units for this item have already been returned or are currently in an active return process.';
    } else if (item.quantityRequested > availableQuantity) {
      itemEligible = false;
      itemReason = `Requested quantity (${item.quantityRequested}) exceeds eligible remaining units (${availableQuantity}).`;
    }

    return {
      orderItemId: item.orderItemId,
      isEligible: itemEligible,
      availableQuantity,
      maxRefundAmount,
      reason: itemReason
    };
  });

  const hasAnyEligibleItem = itemResults.some(r => r.isEligible && r.availableQuantity > 0);
  if (!hasAnyEligibleItem && isEligible) {
    isEligible = false;
    reasons.push('No eligible items available for return or replacement in this order.');
  }

  return {
    isEligible: isEligible && hasAnyEligibleItem,
    reasons,
    daysRemaining,
    itemResults
  };
}

/**
 * Calculates and bounds the maximum allowable refund
 */
export function calculateMaxRefund(items: { price: number; quantity: number }[]): number {
  return items.reduce((total, item) => total + (item.price * item.quantity), 0);
}

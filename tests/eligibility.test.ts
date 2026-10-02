import { describe, it, expect } from 'vitest';
import { checkOrderReturnEligibility, calculateMaxRefund } from '../src/server/services/eligibility.js';

describe('Return Eligibility Rules & Validations', () => {
  const baseOrder = {
    orderNumber: '1001',
    fulfillmentStatus: 'FULFILLED',
    deliveryDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    returnWindowDays: 7,
    items: [
      {
        orderItemId: 'item-1',
        quantityRequested: 1,
        price: 2999,
        isReturnable: true,
        purchasedQuantity: 1,
        alreadyReturnedQuantity: 0
      }
    ]
  };

  it('approves an order that is fulfilled and within the 7-day return window', () => {
    const result = checkOrderReturnEligibility(baseOrder);
    expect(result.isEligible).toBe(true);
    expect(result.daysRemaining).toBeGreaterThanOrEqual(4);
    expect(result.itemResults[0].isEligible).toBe(true);
  });

  it('rejects an order if fulfillment status is unfulfilled', () => {
    const unfulfilledOrder = {
      ...baseOrder,
      fulfillmentStatus: 'UNFULFILLED'
    };
    const result = checkOrderReturnEligibility(unfulfilledOrder);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some(r => r.includes('Only fulfilled/delivered orders'))).toBe(true);
  });

  it('rejects an order if return window has expired', () => {
    const expiredOrder = {
      ...baseOrder,
      deliveryDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), // 12 days ago
      returnWindowDays: 7
    };
    const result = checkOrderReturnEligibility(expiredOrder);
    expect(result.isEligible).toBe(false);
    expect(result.reasons.some(r => r.includes('expired'))).toBe(true);
  });

  it('rejects items marked as final sale / non-returnable', () => {
    const nonReturnableOrder = {
      ...baseOrder,
      items: [
        {
          orderItemId: 'item-final-sale',
          quantityRequested: 1,
          price: 999,
          isReturnable: false,
          purchasedQuantity: 1,
          alreadyReturnedQuantity: 0
        }
      ]
    };
    const result = checkOrderReturnEligibility(nonReturnableOrder);
    expect(result.isEligible).toBe(false);
    expect(result.itemResults[0].isEligible).toBe(false);
    expect(result.itemResults[0].reason).toContain('non-returnable');
  });

  it('prevents requesting more quantity than purchased (duplicate return prevention)', () => {
    const duplicateOrder = {
      ...baseOrder,
      items: [
        {
          orderItemId: 'item-duplicate',
          quantityRequested: 2, // Requesting 2 units
          price: 1500,
          isReturnable: true,
          purchasedQuantity: 1, // Only 1 purchased
          alreadyReturnedQuantity: 0
        }
      ]
    };
    const result = checkOrderReturnEligibility(duplicateOrder);
    expect(result.itemResults[0].isEligible).toBe(false);
    expect(result.itemResults[0].reason).toContain('exceeds eligible remaining units');
  });

  it('prevents re-returning items that have already been returned', () => {
    const alreadyReturnedOrder = {
      ...baseOrder,
      items: [
        {
          orderItemId: 'item-already-returned',
          quantityRequested: 1,
          price: 1500,
          isReturnable: true,
          purchasedQuantity: 1,
          alreadyReturnedQuantity: 1 // Already returned 1 unit
        }
      ]
    };
    const result = checkOrderReturnEligibility(alreadyReturnedOrder);
    expect(result.isEligible).toBe(false);
    expect(result.itemResults[0].isEligible).toBe(false);
    expect(result.itemResults[0].reason).toContain('already been returned');
  });

  it('calculates maximum refund correctly', () => {
    const items = [
      { price: 1499, quantity: 2 },
      { price: 500, quantity: 1 }
    ];
    const maxRefund = calculateMaxRefund(items);
    expect(maxRefund).toBe(3498);
  });
});

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  formattedName: string;
  createdAt: string;
  fulfillmentStatus: string;
  deliveryDate?: string | null;
  totalPrice: number;
  currency: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  shippingAddress: {
    name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    phone?: string;
  };
  items: OrderItem[];
  returnRequests: {
    id: string;
    requestNumber: string;
    requestType: string;
    status: string;
    createdAt: string;
  }[];
}

export interface OrderItem {
  id: string;
  shopifyLineItemId: string;
  shopifyProductId?: string;
  title: string;
  variantTitle?: string;
  sku?: string;
  quantity: number;
  price: number;
  imageUrl?: string;
  isReturnable: boolean;
  alreadyReturned: number;
  availableUnits: number;
  isEligible: boolean;
  ineligibilityReason?: string;
  availableVariants?: {
    id: string;
    title: string;
    sku?: string;
    inStock: boolean;
    inventoryQuantity?: number;
  }[];
}

export interface EligibilityInfo {
  isEligible: boolean;
  reasons: string[];
  daysRemaining: number;
  returnWindowDays: number;
}

export interface ReturnRequestSummary {
  id: string;
  requestNumber: string;
  orderNumber: string;
  customerEmail: string;
  requestType: 'RETURN_REFUND' | 'REPLACEMENT';
  status: string;
  reason: string;
  refundAmount?: number;
  currency: string;
  itemsCount: number;
  itemsSummary: string;
  createdAt: string;
  shipmentStatus?: string;
  awbNumber?: string | null;
}

export interface ReturnRequestDetail {
  id: string;
  requestNumber: string;
  requestType: string;
  status: string;
  reason: string;
  customerNotes?: string;
  rejectionReason?: string;
  internalNotes?: string;
  refundMethod?: string;
  refundAmount?: number;
  refundStatus?: string;
  createdAt: string;
  updatedAt: string;
  order: {
    id: string;
    shopifyId: string;
    orderNumber: string;
    totalPrice: number;
    currency: string;
    customerEmail?: string;
    customerPhone?: string;
    shippingAddressJson?: string;
    fulfillmentStatus?: string;
    deliveryDate?: string;
    createdAt: string;
  };
  returnItems: {
    id: string;
    quantity: number;
    reason?: string;
    comments?: string;
    refundAmount?: number;
    orderItem: {
      id: string;
      title: string;
      variantTitle?: string;
      sku?: string;
      price: number;
      imageUrl?: string;
    };
  }[];
  replacementItems: {
    id: string;
    title: string;
    variantTitle?: string;
    quantity: number;
    inStock: boolean;
  }[];
  uploadedFiles: {
    id: string;
    filename: string;
    originalName: string;
    filePath: string;
    sizeBytes: number;
  }[];
  shipments: {
    id: string;
    type: string;
    provider: string;
    courierName?: string;
    awbNumber?: string;
    trackingUrl?: string;
    status: string;
    createdAt: string;
  }[];
  refunds: {
    id: string;
    amount: number;
    currency: string;
    method: string;
    status: string;
    shopifyRefundId?: string;
    processedAt?: string;
  }[];
  statusEvents: {
    id: string;
    status: string;
    actorType: string;
    actorName?: string;
    message: string;
    createdAt: string;
  }[];
}

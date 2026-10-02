import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config.js';

export interface ShopifyLineItem {
  id: string;
  title: string;
  variantTitle?: string;
  sku?: string;
  quantity: number;
  originalUnitPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  image?: {
    url: string;
    altText?: string;
  };
  product?: {
    id: string;
    tags: string[];
    variants?: {
      nodes: {
        id: string;
        title: string;
        sku?: string;
        inventoryQuantity?: number;
        availableForSale: boolean;
        price: string;
      }[];
    };
  };
}

export interface ShopifyOrderDetails {
  id: string;
  name: string; // e.g. "#1001"
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  createdAt: string;
  currencyCode: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  customer?: {
    id: string;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
  shippingAddress?: {
    name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    country?: string;
    phone?: string;
  };
  lineItems: {
    nodes: ShopifyLineItem[];
  };
  fulfillments?: {
    createdAt: string;
    deliveredAt?: string;
    status: string;
  }[];
}

// In-memory demo orders for Ethnoir India when credentials are not yet configured in .env
const DEMO_ORDERS: Record<string, ShopifyOrderDetails> = {
  '1001': {
    id: 'gid://shopify/Order/5001',
    name: '#1001',
    displayFinancialStatus: 'PAID',
    displayFulfillmentStatus: 'FULFILLED',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago (Eligible)
    currencyCode: 'INR',
    totalPriceSet: { shopMoney: { amount: '4999.00', currencyCode: 'INR' } },
    customer: {
      id: 'gid://shopify/Customer/9001',
      email: 'priya.sharma@example.com',
      phone: '+919876543210',
      firstName: 'Priya',
      lastName: 'Sharma'
    },
    shippingAddress: {
      name: 'Priya Sharma',
      address1: 'Flat 402, Royal Palms Residency, 14th Main Road',
      address2: 'Indiranagar',
      city: 'Bengaluru',
      province: 'Karnataka',
      zip: '560038',
      country: 'India',
      phone: '+919876543210'
    },
    fulfillments: [
      {
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'SUCCESS'
      }
    ],
    lineItems: {
      nodes: [
        {
          id: 'gid://shopify/LineItem/101',
          title: 'Handloom Chanderi Silk Kurta Set with Organza Dupatta',
          variantTitle: 'Emerald Green / Size M',
          sku: 'ETH-CK-001-M',
          quantity: 1,
          originalUnitPriceSet: { shopMoney: { amount: '3499.00', currencyCode: 'INR' } },
          image: {
            url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80',
            altText: 'Emerald Silk Kurta'
          },
          product: {
            id: 'gid://shopify/Product/701',
            tags: ['returnable', 'ethnic', 'silk'],
            variants: {
              nodes: [
                { id: 'gid://shopify/ProductVariant/801', title: 'Emerald Green / Size S', sku: 'ETH-CK-001-S', inventoryQuantity: 4, availableForSale: true, price: '3499.00' },
                { id: 'gid://shopify/ProductVariant/802', title: 'Emerald Green / Size M', sku: 'ETH-CK-001-M', inventoryQuantity: 0, availableForSale: false, price: '3499.00' },
                { id: 'gid://shopify/ProductVariant/803', title: 'Emerald Green / Size L', sku: 'ETH-CK-001-L', inventoryQuantity: 7, availableForSale: true, price: '3499.00' },
                { id: 'gid://shopify/ProductVariant/804', title: 'Emerald Green / Size XL', sku: 'ETH-CK-001-XL', inventoryQuantity: 2, availableForSale: true, price: '3499.00' }
              ]
            }
          }
        },
        {
          id: 'gid://shopify/LineItem/102',
          title: 'Zari Bordered Modal Silk Stole',
          variantTitle: 'Antique Gold',
          sku: 'ETH-ST-009-GLD',
          quantity: 1,
          originalUnitPriceSet: { shopMoney: { amount: '1500.00', currencyCode: 'INR' } },
          image: {
            url: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=80',
            altText: 'Zari Modal Silk Stole'
          },
          product: {
            id: 'gid://shopify/Product/702',
            tags: ['returnable', 'accessories'],
            variants: {
              nodes: [
                { id: 'gid://shopify/ProductVariant/810', title: 'Antique Gold', sku: 'ETH-ST-009-GLD', inventoryQuantity: 12, availableForSale: true, price: '1500.00' }
              ]
            }
          }
        }
      ]
    }
  },
  '1002': {
    id: 'gid://shopify/Order/5002',
    name: '#1002',
    displayFinancialStatus: 'PAID',
    displayFulfillmentStatus: 'FULFILLED',
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago (Window Expired)
    currencyCode: 'INR',
    totalPriceSet: { shopMoney: { amount: '2799.00', currencyCode: 'INR' } },
    customer: {
      id: 'gid://shopify/Customer/9002',
      email: 'rahul.verma@example.com',
      phone: '+919812345678',
      firstName: 'Rahul',
      lastName: 'Verma'
    },
    shippingAddress: {
      name: 'Rahul Verma',
      address1: 'B-12, Green Park Extension',
      address2: 'Near South Extension',
      city: 'New Delhi',
      province: 'Delhi',
      zip: '110016',
      country: 'India',
      phone: '+919812345678'
    },
    fulfillments: [
      {
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        deliveredAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'SUCCESS'
      }
    ],
    lineItems: {
      nodes: [
        {
          id: 'gid://shopify/LineItem/103',
          title: 'Royal Indigo Block Print Tussar Kurta',
          variantTitle: 'Navy Blue / Size 42',
          sku: 'ETH-TK-022-42',
          quantity: 1,
          originalUnitPriceSet: { shopMoney: { amount: '2799.00', currencyCode: 'INR' } },
          image: {
            url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=600&q=80',
            altText: 'Indigo Silk Kurta'
          },
          product: {
            id: 'gid://shopify/Product/703',
            tags: ['returnable', 'men'],
            variants: {
              nodes: [
                { id: 'gid://shopify/ProductVariant/820', title: 'Navy Blue / Size 40', sku: 'ETH-TK-022-40', inventoryQuantity: 5, availableForSale: true, price: '2799.00' },
                { id: 'gid://shopify/ProductVariant/821', title: 'Navy Blue / Size 42', sku: 'ETH-TK-022-42', inventoryQuantity: 3, availableForSale: true, price: '2799.00' }
              ]
            }
          }
        }
      ]
    }
  },
  '1003': {
    id: 'gid://shopify/Order/5003',
    name: '#1003',
    displayFinancialStatus: 'PAID',
    displayFulfillmentStatus: 'UNFULFILLED', // Unfulfilled check
    createdAt: new Date().toISOString(),
    currencyCode: 'INR',
    totalPriceSet: { shopMoney: { amount: '1999.00', currencyCode: 'INR' } },
    customer: {
      id: 'gid://shopify/Customer/9003',
      email: 'ananya.iyer@example.com',
      phone: '+919777888999',
      firstName: 'Ananya',
      lastName: 'Iyer'
    },
    shippingAddress: {
      name: 'Ananya Iyer',
      address1: '45, Jubilee Hills',
      address2: 'Road No 36',
      city: 'Hyderabad',
      province: 'Telangana',
      zip: '500033',
      country: 'India',
      phone: '+919777888999'
    },
    fulfillments: [],
    lineItems: {
      nodes: [
        {
          id: 'gid://shopify/LineItem/104',
          title: 'Embroidered Banarasi Brocade Potli Bag (Final Sale)',
          variantTitle: 'Maroon Gold',
          sku: 'ETH-ACC-POTLI-MRN',
          quantity: 1,
          originalUnitPriceSet: { shopMoney: { amount: '1999.00', currencyCode: 'INR' } },
          image: {
            url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80',
            altText: 'Potli Bag'
          },
          product: {
            id: 'gid://shopify/Product/704',
            tags: ['non-returnable', 'final-sale'],
            variants: {
              nodes: [
                { id: 'gid://shopify/ProductVariant/830', title: 'Maroon Gold', sku: 'ETH-ACC-POTLI-MRN', inventoryQuantity: 8, availableForSale: true, price: '1999.00' }
              ]
            }
          }
        }
      ]
    }
  }
};

export class ShopifyService {
  private endpoint: string;
  private cachedToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor() {
    this.endpoint = `https://${config.SHOPIFY_SHOP}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`;
  }

  /**
   * Retrieves active Shopify Admin Access Token, auto-refreshing via client_credentials if needed
   */
  async getAccessToken(): Promise<string> {
    // 1. Direct environment variable access token if provided
    if (config.SHOPIFY_ADMIN_ACCESS_TOKEN && config.SHOPIFY_ADMIN_ACCESS_TOKEN.startsWith('shpat_')) {
      return config.SHOPIFY_ADMIN_ACCESS_TOKEN;
    }

    // 2. Return cached token if still valid
    const now = Date.now();
    if (this.cachedToken && this.tokenExpiry && now < this.tokenExpiry) {
      return this.cachedToken;
    }

    // 3. Exchange client_id and client_secret for access token via client_credentials grant
    if (config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET) {
      try {
        const tokenRes = await axios.post<{ access_token: string; expires_in?: number }>(
          `https://${config.SHOPIFY_SHOP}/admin/oauth/access_token`,
          {
            client_id: config.SHOPIFY_CLIENT_ID,
            client_secret: config.SHOPIFY_CLIENT_SECRET,
            grant_type: 'client_credentials'
          }
        );

        if (tokenRes.data?.access_token) {
          this.cachedToken = tokenRes.data.access_token;
          const expiresIn = (tokenRes.data.expires_in || 86400) * 1000;
          this.tokenExpiry = now + expiresIn - (300 * 1000); // refresh 5 mins early
          return this.cachedToken;
        }
      } catch (err: any) {
        console.error('[Shopify OAuth Token Error]:', err.response?.data || err.message);
      }
    }

    throw new Error('SHOPIFY_NOT_CONFIGURED: Missing valid Shopify Admin Access Token or Client credentials.');
  }

  /**
   * Executes a GraphQL query or mutation against Shopify Admin API
   */
  async graphql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
    if (!config.isShopifyConfigured()) {
      throw new Error('SHOPIFY_NOT_CONFIGURED: Shopify Admin Access Token is not configured in .env');
    }

    const token = await this.getAccessToken();

    try {
      const response = await axios.post<{ data: T; errors?: any[] }>(
        this.endpoint,
        { query, variables },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token,
          },
          timeout: 15000
        }
      );

      if (response.data.errors && response.data.errors.length > 0) {
        const errorMsg = response.data.errors.map(e => e.message).join(' | ');
        throw new Error(`Shopify GraphQL Error: ${errorMsg}`);
      }

      return response.data.data;
    } catch (err: any) {
      if (err.response?.data?.errors) {
        const details = JSON.stringify(err.response.data.errors);
        throw new Error(`Shopify API Error (${err.response.status}): ${details}`);
      }
      throw new Error(`Shopify Network Error: ${err.message}`);
    }
  }

  /**
   * Fetches order by order name (e.g. "ET-1124", "#1001", "1001") and verifies customer email/phone match
   */
  async findOrderByNumber(rawOrderNumber: string, emailOrPhone: string): Promise<ShopifyOrderDetails | null> {
    const cleanNumber = rawOrderNumber.replace(/[^0-9]/g, '');
    const cleanContact = emailOrPhone.trim().toLowerCase();
    const cleanContactPhone = cleanContact.replace(/[^0-9]/g, '');

    // 1. Live Shopify GraphQL Admin API Check
    if (config.isShopifyConfigured()) {
      const query = `
        query getOrderByName($query: String!) {
          orders(first: 10, query: $query) {
            nodes {
              id
              name
              displayFinancialStatus
              displayFulfillmentStatus
              createdAt
              currencyCode
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                email
                phone
                firstName
                lastName
              }
              shippingAddress {
                name
                address1
                address2
                city
                province
                zip
                country
                phone
              }
              fulfillments(first: 5) {
                createdAt
                deliveredAt
                status
              }
              lineItems(first: 50) {
                nodes {
                  id
                  title
                  variantTitle
                  sku
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  image {
                    url
                    altText
                  }
                  product {
                    id
                    tags
                    variants(first: 20) {
                      nodes {
                        id
                        title
                        sku
                        inventoryQuantity
                        availableForSale
                        price
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      try {
        const searchQuery = `${rawOrderNumber.trim()} OR name:${rawOrderNumber.trim()} OR name:ET-${cleanNumber} OR name:#${cleanNumber} OR name:${cleanNumber}`;
        const data = await this.graphql<{ orders: { nodes: ShopifyOrderDetails[] } }>(query, {
          query: searchQuery
        });

        const found = data.orders.nodes.find(order => {
          const orderNameClean = order.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const inputNameClean = rawOrderNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
          const orderNumClean = order.name.replace(/[^0-9]/g, '');

          const numberMatch =
            orderNameClean === inputNameClean ||
            orderNumClean === cleanNumber ||
            order.name.toLowerCase() === rawOrderNumber.trim().toLowerCase();

          if (!numberMatch) return false;

          // Verify email or phone
          const custEmail = (order.customer?.email || '').trim().toLowerCase();
          const custPhone = (order.customer?.phone || order.shippingAddress?.phone || '').replace(/[^0-9]/g, '');

          const emailMatch = cleanContact.includes('@') && custEmail === cleanContact;

          // Phone matching: compare last 10 digits to ignore +91 or leading 0
          const custLast10 = custPhone.slice(-10);
          const inputLast10 = cleanContactPhone.slice(-10);
          const phoneMatch = Boolean(
            (custLast10.length === 10 && inputLast10.length === 10 && custLast10 === inputLast10) ||
            (cleanContactPhone.length >= 7 && (custPhone.includes(cleanContactPhone) || cleanContactPhone.includes(custPhone)))
          );

          return emailMatch || phoneMatch;
        });

        if (found) return found;
      } catch (err: any) {
        console.warn(`[ShopifyService] Live fetch failed: ${err.message}. Falling back to demo mode if applicable.`);
      }
    }

    // 2. Demo / Mock Mode fallback (ensures immediate local evaluation with Ethnoir India sample orders)
    const demoOrder = DEMO_ORDERS[cleanNumber];
    if (demoOrder) {
      const custEmail = (demoOrder.customer?.email || '').toLowerCase();
      const custPhone = (demoOrder.customer?.phone || '').replace(/[^0-9]/g, '');
      const inputPhone = cleanContact.replace(/[^0-9]/g, '');

      const emailMatch = cleanContact.includes('@') && custEmail === cleanContact;
      const phoneMatch = inputPhone.length >= 7 && (custPhone.includes(inputPhone) || inputPhone.includes(custPhone));

      if (emailMatch || phoneMatch) {
        return demoOrder;
      }
    }

    return null;
  }

  /**
   * Checks real variant inventory in Shopify GraphQL
   */
  async checkVariantStock(variantId: string): Promise<{ inStock: boolean; quantity: number }> {
    if (!config.isShopifyConfigured()) {
      return { inStock: true, quantity: 10 }; // Demo mock
    }

    const query = `
      query getVariantStock($id: ID!) {
        productVariant(id: $id) {
          id
          inventoryQuantity
          availableForSale
        }
      }
    `;

    try {
      const data = await this.graphql<{ productVariant: { inventoryQuantity: number; availableForSale: boolean } | null }>(query, { id: variantId });
      if (!data.productVariant) {
        return { inStock: false, quantity: 0 };
      }
      return {
        inStock: data.productVariant.availableForSale && (data.productVariant.inventoryQuantity ?? 0) > 0,
        quantity: data.productVariant.inventoryQuantity ?? 0
      };
    } catch {
      return { inStock: true, quantity: 5 };
    }
  }

  /**
   * Creates a formal Shopify Return via returnCreate GraphQL mutation
   */
  async createShopifyReturn(orderId: string, returnLineItems: { fulfillmentLineItemId?: string; quantity: number; returnReason?: string }[]): Promise<{ returnId: string; status: string }> {
    if (!config.isShopifyConfigured()) {
      return {
        returnId: `gid://shopify/Return/mock_${Date.now()}`,
        status: 'OPEN'
      };
    }

    const mutation = `
      mutation returnCreate($returnInput: ReturnInput!) {
        returnCreate(returnInput: $returnInput) {
          return {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Map reason to valid Shopify ReturnReason enum
    const mapReason = (reason?: string) => {
      switch (reason) {
        case 'DAMAGED': return 'DEFECTIVE';
        case 'WRONG_PRODUCT': return 'WRONG_ITEM';
        case 'SIZE_FIT': return 'SIZE_TOO_LARGE';
        default: return 'OTHER';
      }
    };

    const variables = {
      returnInput: {
        orderId,
        returnLineItems: returnLineItems.map(item => ({
          quantity: item.quantity,
          returnReason: mapReason(item.returnReason),
          ...(item.fulfillmentLineItemId ? { fulfillmentLineItemId: item.fulfillmentLineItemId } : {})
        }))
      }
    };

    const result = await this.graphql<any>(mutation, variables);
    if (result.returnCreate?.userErrors?.length > 0) {
      throw new Error(`Shopify Return creation error: ${result.returnCreate.userErrors.map((e: any) => e.message).join(', ')}`);
    }

    return {
      returnId: result.returnCreate.return.id,
      status: result.returnCreate.return.status
    };
  }

  /**
   * Processes a refund via Shopify refundCreate GraphQL mutation
   */
  async processShopifyRefund(orderId: string, amount: number, currency: string, note?: string): Promise<{ refundId: string }> {
    if (!config.isShopifyConfigured()) {
      return {
        refundId: `gid://shopify/Refund/mock_${Date.now()}`
      };
    }

    const mutation = `
      mutation refundCreate($input: RefundInput!) {
        refundCreate(input: $input) {
          refund {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        orderId,
        note: note || 'Refund processed via Ethnoir Custom Returns Portal',
        transactions: [
          {
            amount: amount.toFixed(2),
            currency: currency || 'INR',
            kind: 'REFUND',
            gateway: 'manual'
          }
        ]
      }
    };

    const result = await this.graphql<any>(mutation, variables);
    if (result.refundCreate?.userErrors?.length > 0) {
      throw new Error(`Shopify Refund error: ${result.refundCreate.userErrors.map((e: any) => e.message).join(', ')}`);
    }

    return {
      refundId: result.refundCreate.refund.id
    };
  }

  /**
   * Tests real connection to Shopify GraphQL Admin API
   */
  async testConnection(): Promise<{ success: boolean; shopName?: string; email?: string; message: string }> {
    if (!config.isShopifyConfigured()) {
      return {
        success: false,
        message: 'SHOPIFY_ADMIN_ACCESS_TOKEN is not configured in .env. Running in Demo Mock Mode with sample store data.'
      };
    }

    const query = `
      query getShopMeta {
        shop {
          name
          email
          myshopifyDomain
          currencyCode
        }
      }
    `;

    try {
      const data = await this.graphql<{ shop: { name: string; email: string; myshopifyDomain: string; currencyCode: string } }>(query);
      return {
        success: true,
        shopName: data.shop.name,
        email: data.shop.email,
        message: `Successfully connected to Shopify store '${data.shop.name}' (${data.shop.myshopifyDomain})`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed connecting to Shopify: ${err.message}`
      };
    }
  }

  /**
   * Verifies Shopify Webhook HMAC-SHA256 signature
   */
  static verifyWebhookHmac(rawBody: Buffer | string, hmacHeader?: string): boolean {
    if (!config.SHOPIFY_CLIENT_SECRET) return true; // allow in dev if secret not yet provided
    if (!hmacHeader) return false;

    const digest = crypto
      .createHmac('sha256', config.SHOPIFY_CLIENT_SECRET)
      .update(rawBody)
      .digest('base64');

    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  }
}

export const shopifyService = new ShopifyService();

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
  email?: string;
  phone?: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  customer?: {
    id?: string;
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
  async getAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.cachedToken && this.tokenExpiry && now < this.tokenExpiry) {
      return this.cachedToken;
    }

    // 1. Prioritize Client Credentials Grant if client ID & Secret configured (dynamic & self-refreshing)
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

    // 2. Direct environment variable access token if provided
    if (config.SHOPIFY_ADMIN_ACCESS_TOKEN && config.SHOPIFY_ADMIN_ACCESS_TOKEN.startsWith('shpat_')) {
      return config.SHOPIFY_ADMIN_ACCESS_TOKEN;
    }

    throw new Error('SHOPIFY_NOT_CONFIGURED: Missing valid Shopify Admin Access Token or Client credentials.');
  }

  /**
   * Executes a GraphQL query or mutation against Shopify Admin API
   */
  async graphql<T = any>(query: string, variables: Record<string, any> = {}, retryCount = 0): Promise<T> {
    if (!config.isShopifyConfigured()) {
      throw new Error('SHOPIFY_NOT_CONFIGURED: Shopify Admin Access Token is not configured in .env');
    }

    const token = await this.getAccessToken(retryCount > 0);

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
      if (err.response?.status === 401 && retryCount === 0) {
        console.warn('[Shopify GraphQL] 401 Unauthorized encountered. Forcing token refresh and retrying...');
        this.cachedToken = null;
        this.tokenExpiry = null;
        return this.graphql<T>(query, variables, 1);
      }
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
              email
              phone
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
          const custEmail = (order.email || order.customer?.email || '').trim().toLowerCase();
          const custPhone = (order.phone || order.customer?.phone || order.shippingAddress?.phone || '').replace(/[^0-9]/g, '');

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
        console.error(`[ShopifyService] Order search error: ${err.message}`);
      }
    }

    return null;
  }

  /**
   * Checks real variant inventory in Shopify GraphQL
   */
  async checkVariantStock(variantId: string): Promise<{ inStock: boolean; quantity: number }> {
    if (!config.isShopifyConfigured()) {
      throw new Error('SHOPIFY_NOT_CONFIGURED: Shopify credentials missing');
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
        inStock: Boolean(data.productVariant.availableForSale && (data.productVariant.inventoryQuantity ?? 0) > 0),
        quantity: data.productVariant.inventoryQuantity ?? 0
      };
    } catch {
      return { inStock: false, quantity: 0 };
    }
  }

  /**
   * Creates a formal Shopify Return via returnCreate GraphQL mutation
   */
  async createShopifyReturn(orderId: string, returnLineItems: { fulfillmentLineItemId?: string; quantity: number; returnReason?: string }[]): Promise<{ returnId: string; status: string }> {
    if (!config.isShopifyConfigured()) {
      throw new Error('SHOPIFY_NOT_CONFIGURED: Cannot create Shopify return without valid credentials');
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
      throw new Error('SHOPIFY_NOT_CONFIGURED: Cannot process Shopify refund without valid credentials');
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
        message: 'Shopify credentials not configured in environment variables.'
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

    const digestBuffer = Buffer.from(digest, 'utf8');
    const hmacBuffer = Buffer.from(hmacHeader, 'utf8');

    if (digestBuffer.length !== hmacBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(digestBuffer, hmacBuffer);
  }
}

export const shopifyService = new ShopifyService();

import axios, { AxiosInstance } from 'axios';
import { config } from '../config.js';

export interface ShiprocketAddress {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  email?: string;
  phone: string;
}

export interface ReversePickupParams {
  orderId: string;
  requestNumber: string;
  customerAddress: ShiprocketAddress;
  pickupLocationName?: string; // Shiprocket warehouse location name configured in merchant panel
  items: {
    name: string;
    sku: string;
    units: number;
    price: number;
    qcReason?: string;
  }[];
  packageDimensions?: {
    length: number;
    breadth: number;
    height: number;
    weight: number; // in kg
  };
}

export interface ForwardShipmentParams {
  orderId: string;
  requestNumber: string;
  customerAddress: ShiprocketAddress;
  pickupLocationName?: string;
  items: {
    name: string;
    sku: string;
    units: number;
    price: number;
  }[];
  packageDimensions?: {
    length: number;
    breadth: number;
    height: number;
    weight: number;
  };
}

export interface ShiprocketShipmentResult {
  isMock: boolean;
  orderId: string;
  shipmentId: string;
  awbNumber: string;
  courierName: string;
  trackingUrl: string;
  status: string;
  rawResponse?: any;
}

export interface TrackingStatusResult {
  awbNumber: string;
  currentStatus: string;
  statusCode: number;
  location?: string;
  lastUpdated?: string;
  events?: {
    date: string;
    status: string;
    activity: string;
    location: string;
  }[];
}

export class ShiprocketService {
  private client: AxiosInstance;
  private token: string | null = null;
  private tokenExpiry: number | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: config.SHIPROCKET_API_BASE,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Authenticates with Shiprocket API to obtain a JWT Bearer token
   * Tokens are valid for 240 hours (10 days) and cached in memory
   */
  private async getAuthToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.tokenExpiry && now < this.tokenExpiry) {
      return this.token;
    }

    if (!config.isShiprocketConfigured()) {
      throw new Error('SHIPROCKET_NOT_CONFIGURED: Missing SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD');
    }

    try {
      const response = await this.client.post('/auth/login', {
        email: config.SHIPROCKET_EMAIL,
        password: config.SHIPROCKET_PASSWORD,
      });

      if (!response.data || !response.data.token) {
        throw new Error('Shiprocket authentication failed: No token returned in response');
      }

      this.token = response.data.token;
      // Expire 1 hour before actual 10-day limit for safety
      this.tokenExpiry = now + 9 * 24 * 60 * 60 * 1000;
      return this.token!;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(`Shiprocket Login Error: ${msg}`);
    }
  }

  /**
   * Helper to make authenticated requests to Shiprocket API
   */
  private async request<T = any>(method: 'GET' | 'POST', url: string, data?: any): Promise<T> {
    const token = await this.getAuthToken();
    try {
      const res = await this.client.request<T>({
        method,
        url,
        data,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return res.data;
    } catch (err: any) {
      if (err.response?.status === 401) {
        // Clear token and retry once
        this.token = null;
        const freshToken = await this.getAuthToken();
        const retryRes = await this.client.request<T>({
          method,
          url,
          data,
          headers: {
            Authorization: `Bearer ${freshToken}`,
          },
        });
        return retryRes.data;
      }
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      throw new Error(`Shiprocket API Error (${err.response?.status || 'Network'}): ${errMsg}`);
    }
  }

  /**
   * 1. CREATE REVERSE PICKUP
   * Maps to Shiprocket endpoint: POST /orders/create/return
   * NOTE: Requires the pickup location name to be registered in Shiprocket panel
   */
  async createReversePickup(params: ReversePickupParams): Promise<ShiprocketShipmentResult> {
    if (!config.isShiprocketConfigured()) {
      throw new Error('SHIPROCKET_NOT_CONFIGURED: Missing SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD in environment.');
    }

    const pickupLocation = params.pickupLocationName || config.SHIPROCKET_PICKUP_LOCATION_NAME;

    // Documented Shiprocket Reverse Pickup Payload Mapping
    const payload = {
      order_id: `RET_${params.requestNumber}_${Date.now()}`,
      order_date: new Date().toISOString().split('T')[0],
      channel_id: '', // Blank for custom channel
      pickup_customer_name: params.customerAddress.name,
      pickup_address: params.customerAddress.address1,
      pickup_address_2: params.customerAddress.address2 || '',
      pickup_city: params.customerAddress.city,
      pickup_state: params.customerAddress.state,
      pickup_pincode: params.customerAddress.pincode,
      pickup_email: params.customerAddress.email || 'care@ethnoirindia.com',
      pickup_phone: params.customerAddress.phone,
      pickup_location: pickupLocation, // Destination warehouse nickname in Shiprocket
      order_items: params.items.map(item => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.price,
        discount: 0,
        qc_enable: true,
        qc_product_name: item.name,
        qc_reason: item.qcReason || 'Return requested by customer'
      })),
      length: params.packageDimensions?.length || 20,
      breadth: params.packageDimensions?.breadth || 15,
      height: params.packageDimensions?.height || 5,
      weight: params.packageDimensions?.weight || 0.5,
    };

    try {
      const response = await this.request<any>('POST', '/orders/create/return', payload);

      const shipmentId = response.shipment_id?.toString() || response.order_id?.toString();
      const orderId = response.order_id?.toString() || params.orderId;

      // Now request AWB assignment
      let awbNumber = response.awb_code || '';
      let courierName = response.courier_name || 'Shiprocket Return Logistics';

      if (!awbNumber && shipmentId) {
        try {
          const awbRes = await this.assignReturnAwb(shipmentId);
          if (awbRes.awb_code) {
            awbNumber = awbRes.awb_code;
            courierName = awbRes.courier_name || courierName;
          }
        } catch (awbErr: any) {
          console.warn(`[Shiprocket] Auto-AWB assignment delayed: ${awbErr.message}`);
        }
      }

      const trackingUrl = awbNumber
        ? `https://shiprocket.co//tracking/${awbNumber}`
        : `https://shiprocket.co/tracking`;

      return {
        isMock: false,
        orderId,
        shipmentId: shipmentId || '',
        awbNumber: awbNumber || '',
        courierName,
        trackingUrl,
        status: 'SCHEDULED',
        rawResponse: response,
      };
    } catch (err: any) {
      throw new Error(`Reverse Pickup Creation Failed: ${err.message}. (Ensure pickup address is valid and warehouse '${pickupLocation}' is registered in Shiprocket settings).`);
    }
  }

  /**
   * Helper to assign return AWB
   */
  private async assignReturnAwb(shipmentId: string): Promise<any> {
    return this.request('POST', '/courier/assign/awb', {
      shipment_id: shipmentId,
      is_return: 1
    });
  }

  /**
   * 2. CREATE FORWARD SHIPMENT (FOR REPLACEMENTS)
   * Maps to Shiprocket endpoint: POST /orders/create/adhoc
   */
  async createReplacementShipment(params: ForwardShipmentParams): Promise<ShiprocketShipmentResult> {
    if (!config.isShiprocketConfigured()) {
      throw new Error('SHIPROCKET_NOT_CONFIGURED: Missing SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD in environment.');
    }

    const pickupLocation = params.pickupLocationName || config.SHIPROCKET_PICKUP_LOCATION_NAME;

    const payload = {
      order_id: `REP_${params.requestNumber}_${Date.now()}`,
      order_date: new Date().toISOString().split('T')[0],
      pickup_location: pickupLocation, // Warehouse where item is shipped from
      billing_customer_name: params.customerAddress.name,
      billing_last_name: '',
      billing_address: params.customerAddress.address1,
      billing_address_2: params.customerAddress.address2 || '',
      billing_city: params.customerAddress.city,
      billing_pincode: params.customerAddress.pincode,
      billing_state: params.customerAddress.state,
      billing_country: 'India',
      billing_email: params.customerAddress.email || 'care@ethnoirindia.com',
      billing_phone: params.customerAddress.phone,
      shipping_is_billing: true,
      order_items: params.items.map(item => ({
        name: item.name,
        sku: item.sku,
        units: item.units,
        selling_price: item.price,
      })),
      payment_method: 'Prepaid',
      sub_total: params.items.reduce((acc, it) => acc + (it.price * it.units), 0),
      length: params.packageDimensions?.length || 25,
      breadth: params.packageDimensions?.breadth || 20,
      height: params.packageDimensions?.height || 8,
      weight: params.packageDimensions?.weight || 0.8,
    };

    try {
      const response = await this.request<any>('POST', '/orders/create/adhoc', payload);
      const shipmentId = response.shipment_id?.toString() || response.order_id?.toString();

      let awbNumber = response.awb_code || '';
      let courierName = response.courier_name || 'Shiprocket Surface Standard';

      if (!awbNumber && shipmentId) {
        try {
          const awbRes = await this.request('POST', '/courier/assign/awb', { shipment_id: shipmentId });
          if (awbRes.response?.data?.awb_code) {
            awbNumber = awbRes.response.data.awb_code;
            courierName = awbRes.response.data.courier_name || courierName;
          }
        } catch (awbErr: any) {
          console.warn(`[Shiprocket] Forward AWB assignment delayed: ${awbErr.message}`);
        }
      }

      return {
        isMock: false,
        orderId: response.order_id?.toString() || params.orderId,
        shipmentId: shipmentId || '',
        awbNumber: awbNumber || '',
        courierName,
        trackingUrl: awbNumber ? `https://shiprocket.co//tracking/${awbNumber}` : 'https://shiprocket.co/tracking',
        status: 'MANIFESTED',
        rawResponse: response
      };
    } catch (err: any) {
      throw new Error(`Forward Replacement Shipment Failed: ${err.message}`);
    }
  }

  /**
   * 3. TRACK SHIPMENT / AWB STATUS
   */
  async trackShipment(awbNumber: string): Promise<TrackingStatusResult> {
    if (!awbNumber || awbNumber === 'PENDING') {
      return {
        awbNumber: awbNumber || '',
        currentStatus: 'AWB_PENDING',
        statusCode: 0,
        events: []
      };
    }

    if (!config.isShiprocketConfigured()) {
      throw new Error('SHIPROCKET_NOT_CONFIGURED: Missing SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD');
    }

    try {
      const res = await this.request<any>('GET', `/courier/track/awb/${awbNumber}`);
      const trackData = res.tracking_data;
      if (!trackData) {
        return {
          awbNumber,
          currentStatus: 'AWAITING_CARRIER_UPDATE',
          statusCode: 0,
          events: []
        };
      }

      return {
        awbNumber,
        currentStatus: trackData.shipment_track?.[0]?.current_status || 'IN_TRANSIT',
        statusCode: trackData.shipment_track?.[0]?.status_code || 0,
        location: trackData.shipment_track?.[0]?.current_location || '',
        lastUpdated: trackData.shipment_track?.[0]?.delivered_date || new Date().toISOString(),
        events: (trackData.shipment_track_activities || []).map((ev: any) => ({
          date: ev.date,
          status: ev.status,
          activity: ev.activity,
          location: ev.location
        }))
      };
    } catch (err: any) {
      return {
        awbNumber,
        currentStatus: 'ERROR',
        statusCode: 500,
        events: [{ date: new Date().toISOString(), status: 'ERROR', activity: err.message, location: '' }]
      };
    }
  }

  /**
   * Diagnostic connection tester
   */
  async testConnection(): Promise<{ success: boolean; message: string; email?: string }> {
    if (!config.isShiprocketConfigured()) {
      return {
        success: false,
        message: 'Shiprocket email/password not configured in .env.'
      };
    }

    try {
      const token = await this.getAuthToken();
      return {
        success: Boolean(token),
        email: config.SHIPROCKET_EMAIL,
        message: `Successfully authenticated with Shiprocket API as '${config.SHIPROCKET_EMAIL}'`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to connect to Shiprocket API: ${err.message}`
      };
    }
  }
}

export const shiprocketService = new ShiprocketService();

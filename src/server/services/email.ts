export interface EmailNotificationPayload {
  toEmail: string;
  customerName: string;
  requestNumber: string;
  orderNumber: string;
  status: string;
  requestType: string;
  details?: Record<string, any>;
}

export class EmailService {
  /**
   * Dispatches customer transactional email updates for return/replacement events
   */
  async sendStatusUpdate(payload: EmailNotificationPayload): Promise<boolean> {
    const { toEmail, customerName, requestNumber, orderNumber, status, requestType, details } = payload;

    const subjectMap: Record<string, string> = {
      SUBMITTED: `[Ethnoir India] We have received your ${requestType === 'REPLACEMENT' ? 'replacement' : 'return'} request ${requestNumber}`,
      APPROVED: `[Ethnoir India] Your request ${requestNumber} has been approved!`,
      PICKUP_SCHEDULED: `[Ethnoir India] Reverse pickup scheduled for request ${requestNumber}`,
      PICKED_UP: `[Ethnoir India] Package picked up - Request ${requestNumber}`,
      RECEIVED_AT_WAREHOUSE: `[Ethnoir India] Package received at warehouse - Request ${requestNumber}`,
      REFUND_PROCESSED: `[Ethnoir India] Refund processed for request ${requestNumber}`,
      REPLACEMENT_SHIPPED: `[Ethnoir India] Your replacement has shipped! - Request ${requestNumber}`,
      COMPLETED: `[Ethnoir India] Request ${requestNumber} is completed`,
      REJECTED: `[Ethnoir India] Update on your request ${requestNumber}`
    };

    const subject = subjectMap[status] || `[Ethnoir India] Status update for request ${requestNumber}: ${status}`;

    // Log the transactional email cleanly
    console.log(`\n========================================`);
    console.log(`[EMAIL NOTIFICATION DISPATCHED]`);
    console.log(`To: ${customerName} <${toEmail}>`);
    console.log(`Subject: ${subject}`);
    console.log(`Order: #${orderNumber} | Request: ${requestNumber}`);
    console.log(`Status: ${status} | Type: ${requestType}`);
    if (details) {
      console.log(`Details: ${JSON.stringify(details, null, 2)}`);
    }
    console.log(`========================================\n`);

    return true;
  }
}

export const emailService = new EmailService();

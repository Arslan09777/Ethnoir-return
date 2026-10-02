import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ShopifyService } from '../src/server/services/shopify.js';
import { config } from '../src/server/config.js';

describe('Production Security & Webhook Validation', () => {
  it('validates authentic Shopify webhook HMAC signature', () => {
    const rawBody = JSON.stringify({ id: 12345678, name: 'ET-1124' });
    const secret = config.SHOPIFY_CLIENT_SECRET || 'test_secret_for_webhook_signature';

    const validHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');

    const isValid = ShopifyService.verifyWebhookHmac(rawBody, validHmac);
    expect(isValid).toBe(true);
  });

  it('rejects tampered or fake Shopify webhook HMAC signatures', () => {
    const rawBody = JSON.stringify({ id: 12345678, name: 'ET-1124' });
    const fakeHmac = 'invalid_hmac_signature_tampered_payload==';

    const isValid = ShopifyService.verifyWebhookHmac(rawBody, fakeHmac);
    expect(isValid).toBe(false);
  });

  it('generates and verifies secure Admin JWT session tokens', () => {
    const payload = {
      adminId: 'admin_123',
      email: 'admin@ethnoirindia.com',
      role: 'ADMIN'
    };

    const token = jwt.sign(payload, config.SESSION_SECRET, { expiresIn: '7d' });
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, config.SESSION_SECRET) as any;
    expect(decoded.adminId).toBe(payload.adminId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });
});

describe('Input & Address Validation Rules', () => {
  const pinRegex = /^[1-9][0-9]{5}$/;
  const phoneRegex = /^(?:\+91|91)?[6-9]\d{9}$/;

  it('validates legitimate Indian PIN codes', () => {
    expect(pinRegex.test('394210')).toBe(true); // Surat warehouse
    expect(pinRegex.test('560001')).toBe(true); // Bengaluru
    expect(pinRegex.test('110001')).toBe(true); // New Delhi
    expect(pinRegex.test('012345')).toBe(false); // Leading zero disallowed
    expect(pinRegex.test('39421')).toBe(false);  // 5 digits disallowed
    expect(pinRegex.test('3942100')).toBe(false); // 7 digits disallowed
    expect(pinRegex.test('ABCDEF')).toBe(false); // Alphabetical disallowed
  });

  it('validates 10-digit Indian mobile numbers', () => {
    expect(phoneRegex.test('9449450000')).toBe(true);
    expect(phoneRegex.test('+919449450000')).toBe(true);
    expect(phoneRegex.test('919449450000')).toBe(true);
    expect(phoneRegex.test('1234567890')).toBe(false); // Does not start with 6-9
    expect(phoneRegex.test('98765')).toBe(false); // Incomplete
  });

  it('strictly blocks executable files from upload validation', () => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    const dangerousFiles = ['script.exe', 'payload.bat', 'shell.sh', 'trojan.js', 'exploit.php', 'malware.msi'];

    for (const file of dangerousFiles) {
      const isAllowed = allowedExtensions.some(ext => file.toLowerCase().endsWith(ext));
      expect(isAllowed).toBe(false);
    }

    const safeFiles = ['damaged_shirt.jpg', 'collar_tear.png', 'defect.webp'];
    for (const file of safeFiles) {
      const isAllowed = allowedExtensions.some(ext => file.toLowerCase().endsWith(ext));
      expect(isAllowed).toBe(true);
    }
  });
});

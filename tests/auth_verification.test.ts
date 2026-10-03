import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dtcuijwuicsfnlzdatsm.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const API_BASE = 'http://localhost:5000/api/admin';

describe('Admin Authentication & Authorization Verification', () => {
  it('1. Rejects unauthenticated direct access to protected admin API endpoints', async () => {
    try {
      await axios.get(`${API_BASE}/stats`);
      expect.fail('Should have been rejected with 401');
    } catch (err: any) {
      expect(err.response?.status).toBe(401);
      expect(err.response?.data?.error).toBe('UNAUTHORIZED');
    }
  });

  it('2. Rejects invalid / forged token on protected admin endpoints', async () => {
    try {
      await axios.get(`${API_BASE}/stats`, {
        headers: { Authorization: 'Bearer invalid_forged_jwt_token_12345' }
      });
      expect.fail('Should have been rejected with 401');
    } catch (err: any) {
      expect(err.response?.status).toBe(401);
      expect(err.response?.data?.error).toBe('SESSION_EXPIRED');
    }
  });

  it('3. Enforces Row Level Security (RLS) on admin_users table for public/unauthenticated requests', async () => {
    const anonSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonSupabase.from('admin_users').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS prevents public leakage of admin profiles
  });

  it('4. Successfully handles admin logout and clears session', async () => {
    const res = await axios.post(`${API_BASE}/auth/logout`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });
});

describe('Customer Data Privacy & Isolation Verification', () => {
  const CUSTOMER_API = 'http://localhost:5000/api/customer';

  it('5. Blocks unverified requests to customer tracking endpoint without contact information', async () => {
    try {
      await axios.get(`${CUSTOMER_API}/returns/track/RET-2026-0001`);
      expect.fail('Should have been rejected with 400 VERIFICATION_REQUIRED');
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
      expect(err.response?.data?.error).toBe('VERIFICATION_REQUIRED');
    }
  });

  it('6. Rejects customer tracking requests when contact verification fails (prevents cross-customer snooping)', async () => {
    try {
      await axios.get(`${CUSTOMER_API}/returns/track/RET-2026-0001?contact=attacker@malicious.com`);
      expect.fail('Should have been rejected with 404 NOT_FOUND');
    } catch (err: any) {
      expect(err.response?.status).toBe(404);
      expect(err.response?.data?.error).toBe('NOT_FOUND');
    }
  });

  it('7. Rejects non-numeric order lookup attempts with validation error', async () => {
    try {
      await axios.post(`${CUSTOMER_API}/orders/lookup`, {
        orderNumber: '',
        emailOrPhone: ''
      });
      expect.fail('Should have been rejected with 400 VALIDATION_FAILED');
    } catch (err: any) {
      expect(err.response?.status).toBe(400);
      expect(err.response?.data?.error).toBe('VALIDATION_FAILED');
    }
  });
});

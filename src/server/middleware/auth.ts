import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export interface AdminAuthPayload {
  userId: string;
  adminId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminAuthPayload;
    }
  }
}

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const rawHeader = req.headers.authorization;
    let token = '';

    if (rawHeader && rawHeader.startsWith('Bearer ')) {
      token = rawHeader.substring(7).trim();
    } else if (req.cookies?.admin_token) {
      token = req.cookies.admin_token;
    }

    if (!token) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Administrator authentication required. Please sign in.'
      });
    }

    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      return res.status(500).json({
        error: 'SERVER_CONFIG_ERROR',
        message: 'Authentication service not properly configured.'
      });
    }

    // 1. Verify user session token against Supabase Auth
    const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return res.status(401).json({
        error: 'SESSION_EXPIRED',
        message: 'Session has expired or is invalid. Please sign in again.'
      });
    }

    const authUser = authData.user;

    // 2. Verify authorization against admin_users table under Row Level Security
    const { data: adminRecord, error: dbError } = await supabase
      .from('admin_users')
      .select('id, user_id, email, role, is_active')
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (dbError || !adminRecord) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Access denied. Account is not registered as an administrator.'
      });
    }

    if (!adminRecord.is_active) {
      return res.status(403).json({
        error: 'ACCOUNT_INACTIVE',
        message: 'Access denied. Administrator account is inactive.'
      });
    }

    const normalizedRole = (adminRecord.role || '').toLowerCase();
    if (normalizedRole !== 'admin' && normalizedRole !== 'manager') {
      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Access denied. Administrative role required.'
      });
    }

    req.admin = {
      userId: authUser.id,
      adminId: adminRecord.id || authUser.id,
      email: adminRecord.email || authUser.email || '',
      role: adminRecord.role
    };

    next();
  } catch (err: any) {
    return res.status(401).json({
      error: 'AUTH_FAILED',
      message: 'Authentication verification failed.'
    });
  }
}

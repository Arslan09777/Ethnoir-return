import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';

export interface AdminAuthPayload {
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
    const token = req.cookies?.admin_token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Admin authentication required.' });
    }

    const decoded = jwt.verify(token, config.SESSION_SECRET) as AdminAuthPayload;

    // Verify user exists and is active
    const user = await prisma.adminUser.findUnique({
      where: { id: decoded.adminId }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User account not found or disabled.' });
    }

    req.admin = {
      adminId: user.id,
      email: user.email,
      role: user.role
    };

    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Session expired or invalid token.' });
  }
}

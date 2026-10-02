import rateLimit from 'express-rate-limit';

// Strict rate limit for public customer order lookups (prevents brute forcing order numbers)
export const orderLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many lookup attempts. Please try again after 15 minutes.'
  }
});

// General public API limiter
export const generalApiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests, please slow down.'
  }
});

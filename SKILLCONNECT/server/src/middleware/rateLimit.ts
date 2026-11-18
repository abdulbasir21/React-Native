import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * AUTH-4: 5 failed login attempts for the same email and IP within 15 minutes
 * return 429 until the window ends. Successful logins do not count.
 */
export function createLoginRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email =
        typeof req.body?.email === "string"
          ? req.body.email.trim().toLowerCase()
          : "";
      const ip = ipKeyGenerator(req.ip ?? "127.0.0.1");
      return `${ip}:${email}`;
    },
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many failed login attempts. Please try again later.",
        },
      });
    },
  });
}

/**
 * General API rate limit: 100 requests per minute per IP.
 */
export function createApiRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down.",
        },
      });
    },
  });
}

/**
 * MASTER section 10: Message sending rate limit — 30 per minute per user.
 */
export function createMessageRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? "127.0.0.1"),
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many messages sent. Please slow down.",
        },
      });
    },
  });
}

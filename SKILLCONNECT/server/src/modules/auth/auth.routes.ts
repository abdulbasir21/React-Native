import { Router } from "express";
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "@skillconnect/shared";
import type { RequestHandler } from "express";
import { createLoginRateLimiter } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import type { createAuthController } from "./auth.controller.js";

export function createAuthRouter(
  controller: ReturnType<typeof createAuthController>,
  authenticate: RequestHandler
): Router {
  const router = Router();
  const loginLimiter = createLoginRateLimiter();

  router.post("/register", validate({ body: registerSchema }), controller.register);
  router.post("/login", loginLimiter, validate({ body: loginSchema }), controller.login);
  router.post("/refresh", validate({ body: refreshSchema }), controller.refresh);
  router.post("/logout", validate({ body: logoutSchema }), controller.logout);
  router.get("/me", authenticate, controller.me);

  return router;
}

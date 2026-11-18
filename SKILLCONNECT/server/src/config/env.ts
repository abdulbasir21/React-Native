import "dotenv/config";
import { z } from "zod";

const positiveInt = (defaultValue: number) =>
  z.coerce.number().int().positive().default(defaultValue);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:8081")
    .transform((val) =>
      val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),

  IMAGEKIT_PUBLIC_KEY: z.string().min(1),
  IMAGEKIT_PRIVATE_KEY: z.string().min(1),
  IMAGEKIT_URL_ENDPOINT: z.string().url(),

  // Release 2 (optional in Release 1)
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_MAPS_SERVER_KEY: z.string().optional(),

  SEED_ADMIN_EMAIL: z.string().email(),
  SEED_ADMIN_PASSWORD: z.string().min(8),

  // Business constants (MASTER section 6.0)
  ACCESS_TOKEN_TTL_MINUTES: positiveInt(15),
  REFRESH_TOKEN_TTL_DAYS: positiveInt(30),
  OFFER_EXPIRY_HOURS: positiveInt(24),
  OFFER_MIN_LEAD_MINUTES: positiveInt(30),
  OFFER_MAX_DAYS_AHEAD: positiveInt(90),
  OFFER_MAX_PRICE_PKR: positiveInt(10_000_000),
  AUTO_COMPLETE_HOURS: positiveInt(48),
  NO_SHOW_GRACE_MINUTES: positiveInt(60),
  NO_SHOW_RESPONSE_HOURS: positiveInt(24),
  LATE_CANCEL_HOURS: positiveInt(2),
  LATE_CANCEL_REVIEW_THRESHOLD: positiveInt(3),
  LATE_CANCEL_REVIEW_DAYS: positiveInt(30),
  LOCATION_MATCH_RADIUS_KM: positiveInt(20),
});

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Validates environment variables and returns a typed configuration object.
 * Never includes raw environment values in thrown error messages.
 */
export function loadConfig(rawEnv: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const missingOrInvalid = Array.from(
      new Set(result.error.issues.map((issue) => issue.path.join(".") || "ENV"))
    );
    throw new Error(
      `Invalid or missing environment variables: ${missingOrInvalid.join(", ")}`
    );
  }
  return result.data;
}

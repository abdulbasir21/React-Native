import { z } from "zod";

const normalizeText = (val: string) => val.trim().normalize("NFC");

export const registerSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Valid email is required")
      .max(255),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128),
    fullName: z
      .string()
      .transform(normalizeText)
      .pipe(
        z
          .string()
          .min(2, "Full name must be at least 2 characters")
          .max(100, "Full name must be at most 100 characters")
      ),
  })
  .strict()
  .refine((data) => data.password.toLowerCase() !== data.email.toLowerCase(), {
    message: "Password must not equal email",
    path: ["password"],
  });

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Valid email is required"),
    password: z.string().min(1, "Password is required").max(128),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .strict();

export const logoutSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const clerkPublishableKeySchema = z
  .string()
  .min(1)
  .optional()
  .transform((v) => v?.trim())
  .transform((v) => (v && v.length > 0 ? v : undefined));

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().optional(),
  // Clerk backend middleware requires a publishable key as well.
  // Accept standard CLERK_PUBLISHABLE_KEY and fall back to common frontend var names
  // when developing with a shared `.env`.
  CLERK_PUBLISHABLE_KEY: clerkPublishableKeySchema.default(
    process.env.CLERK_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.VITE_CLERK_PUBLISHABLE_KEY
  ),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);

import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
);
const optionalNumber = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().positive().optional()
);
const booleanSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const optionalBoolean = z.preprocess(
  (value) => (value === "" ? undefined : value),
  booleanSchema.optional()
);

const envSchema = z
  .object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  BODY_LIMIT: z.string().default("1mb"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  UPLOAD_DIR: z.string().default("uploads"),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  OPENAI_API_KEY: z.string().min(1),
  NOTIFICATIONS_ENABLED: booleanSchema.default(true),
  NOTIFICATION_EMAIL_ENABLED: booleanSchema.default(true),
  NOTIFICATION_WHATSAPP_ENABLED: booleanSchema.default(true),
  NOTIFICATION_USAGE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalNumber,
  SMTP_SECURE: optionalBoolean,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM_EMAIL: optionalString,
  SMTP_FROM_NAME: optionalString,
  FRONTEND_URL: optionalString,
  EMAIL_USER: optionalString,
  EMAIL_PASS: optionalString
})
  .superRefine((data, ctx) => {
    if (!data.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required."
      });
    }

    if (data.NODE_ENV === "production" && data.CORS_ORIGIN.trim() === "*") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN cannot be '*' in production."
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment configuration: ${issues.join(", ")}`);
}

export const env = parsed.data;

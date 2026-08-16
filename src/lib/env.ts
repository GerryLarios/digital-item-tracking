import path from "node:path";
import { z } from "zod";

const DEFAULT_DEV_AUTH_SECRET = "dev-better-auth-secret-change-in-production";
const DEFAULT_DEV_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATA_DIR: z.string().default(path.join(process.cwd(), ".data")),
  BETTER_AUTH_SECRET: z.string().optional(),
  APP_ENCRYPTION_KEY: z.string().optional(),
  MAL_CLIENT_ID: z.string().optional(),
  MAL_CLIENT_SECRET: z.string().optional(),
  MAL_REDIRECT_URI: z.string().optional(),
  STEAM_API_KEY: z.string().optional(),
  IMAGE_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(8 * 1024 * 1024),
  REMOTE_IMAGE_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(10 * 1024 * 1024),
  REMOTE_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15_000),
  NSFW_GENRES: z.string().default(""),
});

export type AppEnv = ReturnType<typeof getEnv>;

let cachedEnv: ReturnType<typeof buildEnv> | undefined;

function normalizeSecret(value: string | undefined, fallback: string) {
  return (value && value.trim()) || fallback;
}

function normalizeKey(value: string | undefined, fallback: string) {
  return (value && value.trim()) || fallback;
}

function buildEnv() {
  const parsed = baseSchema.parse(process.env);
  const isProduction = parsed.NODE_ENV === "production";
  const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

  if (isProduction && !isProductionBuild) {
    if (!parsed.BETTER_AUTH_SECRET?.trim()) {
      throw new Error("BETTER_AUTH_SECRET is required in production.");
    }

    if (!parsed.APP_ENCRYPTION_KEY?.trim()) {
      throw new Error("APP_ENCRYPTION_KEY is required in production.");
    }
  }

  const betterAuthSecret = normalizeSecret(
    parsed.BETTER_AUTH_SECRET,
    DEFAULT_DEV_AUTH_SECRET,
  );
  const encryptionKey = normalizeKey(
    parsed.APP_ENCRYPTION_KEY,
    DEFAULT_DEV_ENCRYPTION_KEY,
  );

  if (!encryptionKey || Buffer.from(encryptionKey).byteLength < 32) {
    throw new Error("APP_ENCRYPTION_KEY must be at least 32 bytes long.");
  }

  const appOrigin = parsed.APP_ORIGIN.replace(/\/$/, "");

  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction,
    appOrigin,
    dataDir: parsed.DATA_DIR,
    betterAuthSecret,
    encryptionKey,
    malClientId: parsed.MAL_CLIENT_ID?.trim() || null,
    malClientSecret: parsed.MAL_CLIENT_SECRET?.trim() || null,
    malRedirectUri:
      parsed.MAL_REDIRECT_URI?.trim() ||
      `${appOrigin}/api/integrations/mal/callback`,
    steamApiKey: parsed.STEAM_API_KEY?.trim() || null,
    imageMaxUploadBytes: parsed.IMAGE_MAX_UPLOAD_BYTES,
    remoteImageMaxBytes: parsed.REMOTE_IMAGE_MAX_BYTES,
    remoteHttpTimeoutMs: parsed.REMOTE_HTTP_TIMEOUT_MS,
    nsfwGenres: parsed.NSFW_GENRES.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

export function getEnv() {
  cachedEnv ??= buildEnv();
  return cachedEnv;
}

export function resetEnvCache() {
  cachedEnv = undefined;
}

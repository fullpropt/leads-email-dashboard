import postgres from "postgres";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scryptCallback);

type SettingRow = {
  key: string;
  value: string | null;
};

type AIProvider = "none" | "openai" | "gemini";

export type EmailAiSettingsPublic = {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  rewriteIntensity: number;
  extraInstructions: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  apiKeyConfiguredByProvider: {
    openai: boolean;
    gemini: boolean;
  };
  apiKeyMaskedByProvider: {
    openai: string | null;
    gemini: string | null;
  };
};

export type EmailAiSettingsRuntime = {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  rewriteIntensity: number;
  extraInstructions: string;
  apiKey: string;
};

export type LocalAuthPublicInfo = {
  configured: boolean;
  email: string | null;
  source: "database" | "environment" | "none";
};

const KEY_EMAIL_AI_ENABLED = "email_ai_enabled";
const KEY_EMAIL_AI_PROVIDER = "email_ai_provider";
const KEY_EMAIL_AI_MODEL = "email_ai_model";
// Legacy single-key storage (kept for backward compatibility/migration fallback).
const KEY_EMAIL_AI_API_KEY = "email_ai_api_key";
const KEY_EMAIL_AI_API_KEY_OPENAI = "email_ai_api_key_openai";
const KEY_EMAIL_AI_API_KEY_GEMINI = "email_ai_api_key_gemini";
const KEY_EMAIL_AI_REWRITE_INTENSITY = "email_ai_rewrite_intensity";
const KEY_EMAIL_AI_EXTRA_INSTRUCTIONS = "email_ai_extra_instructions";

const KEY_LOCAL_AUTH_EMAIL = "local_auth_email";
const KEY_LOCAL_AUTH_PASSWORD_HASH = "local_auth_password_hash";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-lite-001";

let sqlClient: ReturnType<typeof postgres> | null = null;
let schemaReady = false;
let ensureSchemaPromise: Promise<void> | null = null;

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;
  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 0,
      connect_timeout: 10,
    });
  }
  return sqlClient;
}

async function ensureSchema() {
  if (schemaReady) return;
  if (ensureSchemaPromise) {
    await ensureSchemaPromise;
    return;
  }

  ensureSchemaPromise = (async () => {
    const sql = getSqlClient();
    if (!sql) return;

    await sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key varchar(120) PRIMARY KEY,
        value text NULL,
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `;

    schemaReady = true;
    ensureSchemaPromise = null;
  })();

  await ensureSchemaPromise;
}

function normalizeProvider(value: string | null | undefined): AIProvider {
  const raw = (value || "").toLowerCase().trim();
  if (raw === "openai" || raw === "gemini" || raw === "none") {
    return raw;
  }
  return "none";
}

function getProviderSettingKey(provider: Exclude<AIProvider, "none">) {
  return provider === "openai"
    ? KEY_EMAIL_AI_API_KEY_OPENAI
    : KEY_EMAIL_AI_API_KEY_GEMINI;
}

function getEnvApiKeyForProvider(provider: AIProvider) {
  if (provider === "openai") return process.env.OPENAI_API_KEY || "";
  if (provider === "gemini") return process.env.GEMINI_API_KEY || "";
  return "";
}

function getStoredApiKeyForProvider(
  map: Map<string, string | null>,
  provider: AIProvider
) {
  if (provider === "none") return "";

  const providerKey = getProviderSettingKey(provider);
  const providerStored = (map.get(providerKey) || "").trim();
  if (providerStored) {
    return providerStored;
  }

  // Use legacy key only if no provider-specific keys are configured yet.
  const openaiStored = (map.get(KEY_EMAIL_AI_API_KEY_OPENAI) || "").trim();
  const geminiStored = (map.get(KEY_EMAIL_AI_API_KEY_GEMINI) || "").trim();
  const legacyStored = (map.get(KEY_EMAIL_AI_API_KEY) || "").trim();
  if (!openaiStored && !geminiStored) {
    return legacyStored;
  }

  return "";
}

function resolveApiKeyForProvider(
  map: Map<string, string | null>,
  provider: AIProvider
) {
  const stored = getStoredApiKeyForProvider(map, provider);
  const env = getEnvApiKeyForProvider(provider);
  return stored || env;
}

function parseBoolean(value: string | null | undefined, fallback: boolean) {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = value.toLowerCase().trim();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

function parseNumber(value: string | null | undefined, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function maskApiKey(apiKey: string) {
  if (!apiKey) return null;
  if (apiKey.length <= 8) return "********";
  const start = apiKey.slice(0, 4);
  const end = apiKey.slice(-4);
  return `${start}...${end}`;
}

async function getSettingMap(keys: string[]) {
  await ensureSchema();
  const sql = getSqlClient();
  if (!sql) return new Map<string, string | null>();

  const rows = await sql<SettingRow[]>`
    SELECT key, value
    FROM app_settings
    WHERE key = ANY(${keys})
  `;

  const map = new Map<string, string | null>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }
  return map;
}

async function setSetting(key: string, value: string | null) {
  await ensureSchema();
  const sql = getSqlClient();
  if (!sql) return;

  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

function getEnvLocalAuthEmail() {
  const configuredEmail =
    process.env.LOCAL_AUTH_EMAIL || process.env.ADMIN_EMAIL || "";
  return configuredEmail.trim().toLowerCase();
}

function getEnvLocalAuthPassword() {
  return process.env.LOCAL_AUTH_PASSWORD || process.env.ADMIN_PASSWORD || "";
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  if (!storedHash.startsWith("scrypt$")) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 3) return false;

  const salt = parts[1];
  const expectedHex = parts[2];
  const expected = Buffer.from(expectedHex, "hex");
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export async function getEmailAiSettingsPublic(): Promise<EmailAiSettingsPublic> {
  const map = await getSettingMap([
    KEY_EMAIL_AI_ENABLED,
    KEY_EMAIL_AI_PROVIDER,
    KEY_EMAIL_AI_MODEL,
    KEY_EMAIL_AI_API_KEY,
    KEY_EMAIL_AI_API_KEY_OPENAI,
    KEY_EMAIL_AI_API_KEY_GEMINI,
    KEY_EMAIL_AI_REWRITE_INTENSITY,
    KEY_EMAIL_AI_EXTRA_INSTRUCTIONS,
  ]);

  const provider = normalizeProvider(
    map.get(KEY_EMAIL_AI_PROVIDER) || process.env.EMAIL_AI_PROVIDER || "none"
  );
  const enabled = provider !== "none";
  const defaultModel =
    provider === "gemini" ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL;
  const model =
    (map.get(KEY_EMAIL_AI_MODEL) || process.env.EMAIL_AI_MODEL || defaultModel).trim();
  const rewriteIntensity = Math.max(
    0,
    Math.min(
      40,
      parseNumber(
        map.get(KEY_EMAIL_AI_REWRITE_INTENSITY) ||
          process.env.EMAIL_AI_VARIATION_MAX_CHANGE_PERCENT,
        12
      )
    )
  );
  const extraInstructions =
    map.get(KEY_EMAIL_AI_EXTRA_INSTRUCTIONS) ||
    process.env.EMAIL_AI_EXTRA_INSTRUCTIONS ||
    "";

  const openaiApiKey = resolveApiKeyForProvider(map, "openai");
  const geminiApiKey = resolveApiKeyForProvider(map, "gemini");
  const apiKey =
    provider === "openai"
      ? openaiApiKey
      : provider === "gemini"
        ? geminiApiKey
        : "";

  return {
    enabled,
    provider,
    model,
    rewriteIntensity,
    extraInstructions,
    apiKeyConfigured: Boolean(apiKey),
    apiKeyMasked: apiKey ? maskApiKey(apiKey) : null,
    apiKeyConfiguredByProvider: {
      openai: Boolean(openaiApiKey),
      gemini: Boolean(geminiApiKey),
    },
    apiKeyMaskedByProvider: {
      openai: openaiApiKey ? maskApiKey(openaiApiKey) : null,
      gemini: geminiApiKey ? maskApiKey(geminiApiKey) : null,
    },
  };
}

export async function getEmailAiSettingsRuntime(): Promise<EmailAiSettingsRuntime> {
  const publicSettings = await getEmailAiSettingsPublic();
  const map = await getSettingMap([
    KEY_EMAIL_AI_API_KEY,
    KEY_EMAIL_AI_API_KEY_OPENAI,
    KEY_EMAIL_AI_API_KEY_GEMINI,
  ]);

  const provider = publicSettings.provider;
  const apiKey = resolveApiKeyForProvider(map, provider);

  return {
    enabled: publicSettings.enabled,
    provider,
    model: publicSettings.model,
    rewriteIntensity: publicSettings.rewriteIntensity,
    extraInstructions: publicSettings.extraInstructions,
    apiKey,
  };
}

export async function updateEmailAiSettings(input: {
  enabled?: boolean;
  provider?: AIProvider;
  model?: string;
  rewriteIntensity?: number;
  extraInstructions?: string;
  apiKey?: string;
  clearApiKey?: boolean;
}) {
  if (input.enabled !== undefined) {
    // Mantido por compatibilidade de payloads antigos, sem efeito operacional.
    await setSetting(KEY_EMAIL_AI_ENABLED, input.enabled ? "true" : "false");
  }
  if (input.provider !== undefined) {
    await setSetting(KEY_EMAIL_AI_PROVIDER, normalizeProvider(input.provider));
  }
  if (input.model !== undefined) {
    await setSetting(KEY_EMAIL_AI_MODEL, input.model.trim());
  }
  if (input.rewriteIntensity !== undefined) {
    const clamped = Math.max(0, Math.min(40, Math.floor(input.rewriteIntensity)));
    await setSetting(KEY_EMAIL_AI_REWRITE_INTENSITY, String(clamped));
  }
  if (input.extraInstructions !== undefined) {
    await setSetting(KEY_EMAIL_AI_EXTRA_INSTRUCTIONS, input.extraInstructions.trim());
  }

  let providerForApiKey: AIProvider = "none";
  if (input.provider !== undefined) {
    providerForApiKey = normalizeProvider(input.provider);
  } else if (input.apiKey !== undefined || input.clearApiKey) {
    const map = await getSettingMap([KEY_EMAIL_AI_PROVIDER]);
    providerForApiKey = normalizeProvider(
      map.get(KEY_EMAIL_AI_PROVIDER) || process.env.EMAIL_AI_PROVIDER || "none"
    );
  }

  if (input.clearApiKey) {
    if (providerForApiKey === "openai" || providerForApiKey === "gemini") {
      await setSetting(getProviderSettingKey(providerForApiKey), null);
    } else {
      await setSetting(KEY_EMAIL_AI_API_KEY_OPENAI, null);
      await setSetting(KEY_EMAIL_AI_API_KEY_GEMINI, null);
      await setSetting(KEY_EMAIL_AI_API_KEY, null);
    }
  } else if (input.apiKey !== undefined) {
    const normalized = input.apiKey.trim();
    if (normalized.length > 0) {
      if (providerForApiKey === "openai" || providerForApiKey === "gemini") {
        await setSetting(getProviderSettingKey(providerForApiKey), normalized);
      } else {
        await setSetting(KEY_EMAIL_AI_API_KEY, normalized);
      }
    }
  }

  return getEmailAiSettingsPublic();
}

export async function getLocalAuthPublicInfo(): Promise<LocalAuthPublicInfo> {
  const map = await getSettingMap([KEY_LOCAL_AUTH_EMAIL, KEY_LOCAL_AUTH_PASSWORD_HASH]);
  const dbEmail = (map.get(KEY_LOCAL_AUTH_EMAIL) || "").trim().toLowerCase();
  const dbPasswordHash = (map.get(KEY_LOCAL_AUTH_PASSWORD_HASH) || "").trim();

  if (dbEmail && dbPasswordHash) {
    return {
      configured: true,
      email: dbEmail,
      source: "database",
    };
  }

  const envEmail = getEnvLocalAuthEmail();
  const envPassword = getEnvLocalAuthPassword();
  if (envEmail && envPassword) {
    return {
      configured: true,
      email: envEmail,
      source: "environment",
    };
  }

  return {
    configured: false,
    email: null,
    source: "none",
  };
}

export async function verifyLocalAuthCredentials(
  emailInput: string,
  passwordInput: string
): Promise<{
  success: boolean;
  email?: string;
  reason?: "invalid" | "not_configured";
}> {
  const email = emailInput.trim().toLowerCase();
  const password = passwordInput;
  if (!email || !password) {
    return { success: false, reason: "invalid" };
  }

  const map = await getSettingMap([KEY_LOCAL_AUTH_EMAIL, KEY_LOCAL_AUTH_PASSWORD_HASH]);
  const dbEmail = (map.get(KEY_LOCAL_AUTH_EMAIL) || "").trim().toLowerCase();
  const dbPasswordHash = (map.get(KEY_LOCAL_AUTH_PASSWORD_HASH) || "").trim();

  if (dbEmail && dbPasswordHash) {
    if (email !== dbEmail) {
      return { success: false, reason: "invalid" };
    }
    const matches = await verifyPassword(password, dbPasswordHash);
    return matches
      ? { success: true, email: dbEmail }
      : { success: false, reason: "invalid" };
  }

  const envEmail = getEnvLocalAuthEmail();
  const envPassword = getEnvLocalAuthPassword();
  if (!envEmail || !envPassword) {
    return { success: false, reason: "not_configured" };
  }

  if (email !== envEmail || password !== envPassword) {
    return { success: false, reason: "invalid" };
  }

  return { success: true, email: envEmail };
}

export async function changeLocalAuthCredentials(input: {
  currentEmail: string;
  currentPassword: string;
  newEmail?: string;
  newPassword: string;
}) {
  const verification = await verifyLocalAuthCredentials(
    input.currentEmail,
    input.currentPassword
  );
  if (!verification.success) {
    return {
      success: false,
      message:
        verification.reason === "not_configured"
          ? "Local auth is not configured"
          : "Current email or password is invalid",
    };
  }

  const nextEmail = (input.newEmail || verification.email || input.currentEmail)
    .trim()
    .toLowerCase();
  const nextPassword = input.newPassword;
  if (!nextEmail || !nextPassword || nextPassword.length < 6) {
    return {
      success: false,
      message: "New password must have at least 6 characters",
    };
  }

  const passwordHash = await hashPassword(nextPassword);
  await setSetting(KEY_LOCAL_AUTH_EMAIL, nextEmail);
  await setSetting(KEY_LOCAL_AUTH_PASSWORD_HASH, passwordHash);

  return {
    success: true,
    message: "Local auth credentials updated",
  };
}

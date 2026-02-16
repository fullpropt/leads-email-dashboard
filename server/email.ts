import sgMail from "@sendgrid/mail";
import axios from "axios";
import postgres from "postgres";

type Provider = "sendgrid" | "mailgun" | "none";
type ProviderSelection = "sendgrid" | "mailgun" | "auto";

type RotationDecision = {
  allowed: boolean;
  reason?: string;
  activeService?: string;
  remaining?: number;
};

type RotationSlot = RotationDecision & {
  accounted: boolean;
};

export type SenderAccountInfo = {
  serviceName: string;
  priority: number;
  enabled: boolean;
  fromEmail: string;
  fromName: string;
  provider: Provider;
};

export type RotationAccountStatus = {
  serviceName: string;
  priority: number;
  enabled: boolean;
  fromEmail: string;
  fromName: string;
  provider: Provider;
  dailyLimit: number;
  sentToday: number;
  remaining: number;
  isActive: boolean;
};

export type RotationOverview = {
  rotationEnabled: boolean;
  activeService: string | null;
  accounts: RotationAccountStatus[];
};

const SERVICE_NAME =
  process.env.MAILMKT_SERVICE_NAME ||
  process.env.RAILWAY_SERVICE_NAME ||
  "mailmkt";
const DEFAULT_FROM_EMAIL = "noreply@tubetoolsup.uk";

const providerSelectionRaw = (process.env.EMAIL_PROVIDER || "auto").toLowerCase();

const sendGridConfig = {
  apiKey: process.env.SENDGRID_API_KEY || "",
  fromEmail: process.env.SENDGRID_FROM_EMAIL || DEFAULT_FROM_EMAIL,
  fromName: process.env.SENDGRID_FROM_NAME || "TubeTools",
};

const mailgunConfig = {
  apiKey: process.env.MAILGUN_API_KEY || "",
  domain: process.env.MAILGUN_DOMAIN || "",
  fromEmail: process.env.MAILGUN_FROM_EMAIL || DEFAULT_FROM_EMAIL,
  fromName: process.env.MAILGUN_FROM_NAME || "TubeTools",
  baseUrl: process.env.MAILGUN_BASE_URL || "https://api.mailgun.net",
};

const sendGridReady = Boolean(sendGridConfig.apiKey);
const mailgunReady = Boolean(mailgunConfig.apiKey && mailgunConfig.domain);

const rotationEnabled = process.env.EMAIL_ACCOUNT_ROTATION_ENABLED === "true";
const rotationPriority = Number.parseInt(
  process.env.EMAIL_SENDER_PRIORITY || "100",
  10
);
const rotationDailyLimit = Number.parseInt(
  process.env.EMAIL_SENDER_DAILY_LIMIT || "100",
  10
);
const rotationSenderEnabled = process.env.EMAIL_SENDER_ENABLED !== "false";

let selectedProvider: Provider = "none";
let providerError: string | null = null;

let rotationSql: ReturnType<typeof postgres> | null = null;
let rotationInitialized = false;
let rotationInitPromise: Promise<boolean> | null = null;

type RotationAccountRowLike = {
  service_name: string;
  priority: number | null;
  from_email: string | null;
  from_name?: string | null;
  provider: string | null;
  enabled?: number | null;
  daily_limit?: number | null;
  sent_today?: number | null;
  updated_at: Date | string | null;
};

function normalizeAccountPriority(value: number | null | undefined) {
  const parsed = Number(value ?? 100);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

function computeAccountScore(row: RotationAccountRowLike) {
  const fromEmail = (row.from_email || "").trim().toLowerCase() || DEFAULT_FROM_EMAIL;
  const updatedAtTs = new Date(String(row.updated_at || "")).getTime() || 0;
  let score = 0;
  if (fromEmail !== DEFAULT_FROM_EMAIL) score += 4;
  if (row.provider === "sendgrid" || row.provider === "mailgun") score += 2;
  if (/@mg\d+\./i.test(fromEmail)) score += 1;
  if (row.service_name === SERVICE_NAME) score += 1;
  return { score, updatedAtTs };
}

function dedupeAccountsByPriority<T extends RotationAccountRowLike>(rows: T[]): T[] {
  const byPriority = new Map<number, T & { __score: number; __updatedAtTs: number }>();

  for (const row of rows) {
    const priority = normalizeAccountPriority(row.priority);
    const { score, updatedAtTs } = computeAccountScore(row);
    const candidate = {
      ...row,
      priority,
      __score: score,
      __updatedAtTs: updatedAtTs,
    } as T & { __score: number; __updatedAtTs: number };
    const existing = byPriority.get(priority);

    if (
      !existing ||
      candidate.__score > existing.__score ||
      (candidate.__score === existing.__score &&
        (candidate.__updatedAtTs > existing.__updatedAtTs ||
          (candidate.__updatedAtTs === existing.__updatedAtTs &&
            candidate.service_name.localeCompare(existing.service_name) < 0)))
    ) {
      byPriority.set(priority, candidate);
    }
  }

  return Array.from(byPriority.values())
    .sort((a, b) => {
      const priorityA = normalizeAccountPriority(a.priority);
      const priorityB = normalizeAccountPriority(b.priority);
      return priorityA === priorityB
        ? a.service_name.localeCompare(b.service_name)
        : priorityA - priorityB;
    })
    .map(item => {
      const { __score: _score, __updatedAtTs: _updatedAtTs, ...row } = item;
      return row as unknown as T;
    });
}

function normalizeProviderSelection(value: string): ProviderSelection {
  if (value === "sendgrid" || value === "mailgun" || value === "auto") {
    return value;
  }
  return "auto";
}

function htmlToPlainText(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function resolveProvider(): Provider {
  const selection = normalizeProviderSelection(providerSelectionRaw);

  if (selection === "sendgrid") {
    if (!sendGridReady) {
      providerError = "EMAIL_PROVIDER=sendgrid, mas SENDGRID_API_KEY nao esta configurada.";
      return "none";
    }
    return "sendgrid";
  }

  if (selection === "mailgun") {
    if (!mailgunReady) {
      providerError =
        "EMAIL_PROVIDER=mailgun, mas MAILGUN_API_KEY/MAILGUN_DOMAIN nao estao configuradas.";
      return "none";
    }
    return "mailgun";
  }

  if (sendGridReady && mailgunReady) {
    providerError =
      "Configuracao ambigua: SendGrid e Mailgun estao ativos. Defina EMAIL_PROVIDER explicitamente.";
    return "none";
  }

  if (sendGridReady) return "sendgrid";
  if (mailgunReady) return "mailgun";

  providerError = "Nenhum provedor de email configurado.";
  return "none";
}

function getCurrentSenderIdentity() {
  if (selectedProvider === "sendgrid") {
    return {
      fromEmail: sendGridConfig.fromEmail,
      fromName: sendGridConfig.fromName,
      provider: "sendgrid" as Provider,
    };
  }
  if (selectedProvider === "mailgun") {
    return {
      fromEmail: mailgunConfig.fromEmail,
      fromName: mailgunConfig.fromName,
      provider: "mailgun" as Provider,
    };
  }

  const fallbackFrom =
    process.env.MAILGUN_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || DEFAULT_FROM_EMAIL;
  return {
    fromEmail: fallbackFrom,
    fromName: process.env.MAILGUN_FROM_NAME || process.env.SENDGRID_FROM_NAME || "TubeTools",
    provider: "none" as Provider,
  };
}

function getRotationSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  if (!rotationSql) {
    rotationSql = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 0,
      connect_timeout: 10,
    });
  }

  return rotationSql;
}

async function ensureRotationSetup(): Promise<boolean> {
  if (!rotationEnabled) {
    return false;
  }

  if (!Number.isFinite(rotationPriority) || rotationPriority < 1) {
    console.error(
      `[Email:${SERVICE_NAME}] EMAIL_SENDER_PRIORITY invalida: ${process.env.EMAIL_SENDER_PRIORITY}`
    );
    return false;
  }

  if (!Number.isFinite(rotationDailyLimit) || rotationDailyLimit < 1) {
    console.error(
      `[Email:${SERVICE_NAME}] EMAIL_SENDER_DAILY_LIMIT invalida: ${process.env.EMAIL_SENDER_DAILY_LIMIT}`
    );
    return false;
  }

  if (rotationInitialized) {
    return true;
  }

  if (rotationInitPromise) {
    return rotationInitPromise;
  }

  rotationInitPromise = (async () => {
    const sql = getRotationSqlClient();
    if (!sql) {
      console.error(
        `[Email:${SERVICE_NAME}] DATABASE_URL ausente; rotacao de contas nao pode ser ativada.`
      );
      return false;
    }

    try {
      await sql`
        CREATE TABLE IF NOT EXISTS email_sending_accounts (
          service_name varchar(120) PRIMARY KEY,
          priority integer NOT NULL,
          daily_limit integer NOT NULL DEFAULT 100,
          sent_today integer NOT NULL DEFAULT 0,
          enabled integer NOT NULL DEFAULT 1,
          from_email varchar(255) NULL,
          from_name varchar(120) NULL,
          provider varchar(20) NULL,
          last_reset_date date NOT NULL DEFAULT CURRENT_DATE,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        ALTER TABLE email_sending_accounts
        ADD COLUMN IF NOT EXISTS from_email varchar(255) NULL
      `;
      await sql`
        ALTER TABLE email_sending_accounts
        ADD COLUMN IF NOT EXISTS from_name varchar(120) NULL
      `;
      await sql`
        ALTER TABLE email_sending_accounts
        ADD COLUMN IF NOT EXISTS provider varchar(20) NULL
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS idx_email_sending_accounts_priority
        ON email_sending_accounts (enabled, priority, service_name)
      `;

      const identity = getCurrentSenderIdentity();

      await sql`
        INSERT INTO email_sending_accounts (
          service_name,
          priority,
          daily_limit,
          sent_today,
          enabled,
          from_email,
          from_name,
          provider,
          last_reset_date,
          created_at,
          updated_at
        )
        VALUES (
          ${SERVICE_NAME},
          ${rotationPriority},
          ${rotationDailyLimit},
          0,
          ${rotationSenderEnabled ? 1 : 0},
          ${identity.fromEmail},
          ${identity.fromName},
          ${identity.provider},
          CURRENT_DATE,
          NOW(),
          NOW()
        )
        ON CONFLICT (service_name)
        DO UPDATE SET
          priority = EXCLUDED.priority,
          daily_limit = EXCLUDED.daily_limit,
          enabled = EXCLUDED.enabled,
          from_email = EXCLUDED.from_email,
          from_name = EXCLUDED.from_name,
          provider = EXCLUDED.provider,
          updated_at = NOW()
      `;

      rotationInitialized = true;
      console.log(
        `[Email:${SERVICE_NAME}] Rotacao ativa (priority=${rotationPriority}, limit=${rotationDailyLimit}, enabled=${rotationSenderEnabled})`
      );
      return true;
    } catch (error) {
      console.error(`[Email:${SERVICE_NAME}] Falha ao preparar rotacao de contas`, error);
      return false;
    } finally {
      rotationInitPromise = null;
    }
  })();

  return rotationInitPromise;
}

async function resetDailyCounters(tx: any) {
  await tx`
    UPDATE email_sending_accounts
    SET sent_today = 0,
        last_reset_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE last_reset_date <> CURRENT_DATE
  `;
}

async function readRotationDecision(
  tx: any
): Promise<RotationDecision> {
  const rows = await tx<{
    service_name: string;
    priority: number;
    daily_limit: number;
    sent_today: number;
    from_email: string | null;
    provider: string | null;
    updated_at: Date | string | null;
  }[]>`
    SELECT
      service_name,
      priority,
      daily_limit,
      sent_today,
      from_email,
      provider,
      updated_at
    FROM email_sending_accounts
    WHERE enabled = 1
      AND sent_today < daily_limit
  `;

  const active = dedupeAccountsByPriority(rows)[0];
  if (!active) {
    return {
      allowed: false,
      reason: "Nenhuma conta habilitada com cota disponivel.",
    };
  }
  const activeRemaining = Math.max(
    Number(active.daily_limit ?? 0) - Number(active.sent_today ?? 0),
    0
  );

  if (active.service_name !== SERVICE_NAME) {
    return {
      allowed: false,
      reason: `Conta ativa atual: ${active.service_name}`,
      activeService: active.service_name,
      remaining: activeRemaining,
    };
  }

  return {
    allowed: true,
    activeService: active.service_name,
    remaining: activeRemaining,
  };
}

async function acquireRotationSlot(): Promise<RotationSlot> {
  if (!rotationEnabled) {
    return { allowed: true, accounted: false };
  }

  const ready = await ensureRotationSetup();
  if (!ready) {
    return {
      allowed: false,
      reason: "Rotacao habilitada, mas configuracao de banco/conta invalida.",
      accounted: false,
    };
  }

  const sql = getRotationSqlClient();
  if (!sql) {
    return {
      allowed: false,
      reason: "DATABASE_URL ausente para rotacao.",
      accounted: false,
    };
  }

  try {
    const result = await sql.begin(async (tx: any) => {
      await resetDailyCounters(tx);

      const activeRows = await tx<{
        service_name: string;
        priority: number;
        daily_limit: number;
        sent_today: number;
        from_email: string | null;
        provider: string | null;
        updated_at: Date | string | null;
      }[]>`
        SELECT
          service_name,
          priority,
          daily_limit,
          sent_today,
          from_email,
          provider,
          updated_at
        FROM email_sending_accounts
        WHERE enabled = 1
          AND sent_today < daily_limit
        FOR UPDATE
      `;

      const active = dedupeAccountsByPriority(activeRows)[0];
      if (!active) {
        return {
          allowed: false,
          reason: "Nenhuma conta com cota disponivel.",
          accounted: false,
        } satisfies RotationSlot;
      }

      if (active.service_name !== SERVICE_NAME) {
        const activeRemaining = Math.max(
          Number(active.daily_limit ?? 0) - Number(active.sent_today ?? 0),
          0
        );
        return {
          allowed: false,
          reason: `Conta ativa atual: ${active.service_name}`,
          activeService: active.service_name,
          remaining: activeRemaining,
          accounted: false,
        } satisfies RotationSlot;
      }

      const updated = await tx<{
        sent_today: number;
        daily_limit: number;
      }[]>`
        UPDATE email_sending_accounts
        SET sent_today = sent_today + 1,
            updated_at = NOW()
        WHERE service_name = ${SERVICE_NAME}
          AND enabled = 1
          AND sent_today < daily_limit
        RETURNING sent_today, daily_limit
      `;

      if (!updated[0]) {
        return {
          allowed: false,
          reason: "Limite da conta atingido durante tentativa de envio.",
          accounted: false,
        } satisfies RotationSlot;
      }

      return {
        allowed: true,
        activeService: SERVICE_NAME,
        remaining: updated[0].daily_limit - updated[0].sent_today,
        accounted: true,
      } satisfies RotationSlot;
    });

    return result;
  } catch (error) {
    console.error(`[Email:${SERVICE_NAME}] Erro ao reservar cota de envio`, error);
    return {
      allowed: false,
      reason: "Falha ao reservar cota de envio.",
      accounted: false,
    };
  }
}

async function releaseRotationSlot() {
  if (!rotationEnabled) {
    return;
  }

  const sql = getRotationSqlClient();
  if (!sql) {
    return;
  }

  try {
    await sql`
      UPDATE email_sending_accounts
      SET sent_today = GREATEST(sent_today - 1, 0),
          updated_at = NOW()
      WHERE service_name = ${SERVICE_NAME}
        AND last_reset_date = CURRENT_DATE
    `;
  } catch (error) {
    console.error(`[Email:${SERVICE_NAME}] Falha ao devolver cota de envio`, error);
  }
}

selectedProvider = resolveProvider();

if (selectedProvider === "sendgrid") {
  sgMail.setApiKey(sendGridConfig.apiKey);
  console.log(`[Email:${SERVICE_NAME}] Provider ativo: SendGrid`);
} else if (selectedProvider === "mailgun") {
  console.log(`[Email:${SERVICE_NAME}] Provider ativo: Mailgun`);
} else {
  console.error(`[Email:${SERVICE_NAME}] Provider invalido: ${providerError}`);
}

if (rotationEnabled) {
  void ensureRotationSetup();
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
  // Mantido por compatibilidade com chamadas existentes.
  skipProcessing?: boolean;
}

async function sendViaSendgrid(params: SendEmailParams): Promise<boolean> {
  const from = params.from || sendGridConfig.fromEmail;
  const fromName = params.fromName || sendGridConfig.fromName;

  try {
    const response = await sgMail.send({
      to: params.to,
      from: {
        email: from,
        name: fromName,
      },
      subject: params.subject,
      html: params.html,
      text: htmlToPlainText(params.html),
    });

    console.log(
      `[Email:${SERVICE_NAME}] SendGrid enviou para ${params.to} (status ${response[0].statusCode})`
    );
    return true;
  } catch (error: any) {
    console.error(`[Email:${SERVICE_NAME}] Erro SendGrid`, error);
    if (error?.response) {
      console.error(`[Email:${SERVICE_NAME}] SendGrid status:`, error.response.statusCode);
      console.error(
        `[Email:${SERVICE_NAME}] SendGrid body:`,
        JSON.stringify(error.response.body, null, 2)
      );
    }
    return false;
  }
}

async function sendViaMailgun(params: SendEmailParams): Promise<boolean> {
  const from = params.from || mailgunConfig.fromEmail;
  const fromName = params.fromName || mailgunConfig.fromName;

  try {
    const body = new URLSearchParams();
    body.append("from", `${fromName} <${from}>`);
    body.append("to", params.to);
    body.append("subject", params.subject);
    body.append("html", params.html);
    body.append("text", htmlToPlainText(params.html));

    const url = `${mailgunConfig.baseUrl.replace(/\/$/, "")}/v3/${mailgunConfig.domain}/messages`;

    const response = await axios.post(url, body.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      auth: {
        username: "api",
        password: mailgunConfig.apiKey,
      },
      timeout: 30_000,
    });

    console.log(
      `[Email:${SERVICE_NAME}] Mailgun enviou para ${params.to} (status ${response.status})`
    );
    return true;
  } catch (error: any) {
    console.error(`[Email:${SERVICE_NAME}] Erro Mailgun`, error);
    if (error?.response) {
      console.error(`[Email:${SERVICE_NAME}] Mailgun status:`, error.response.status);
      console.error(
        `[Email:${SERVICE_NAME}] Mailgun body:`,
        JSON.stringify(error.response.data, null, 2)
      );
    }
    return false;
  }
}

export async function canCurrentServiceProcessQueue(): Promise<RotationDecision> {
  if (!rotationEnabled) {
    return { allowed: true };
  }

  const ready = await ensureRotationSetup();
  if (!ready) {
    return {
      allowed: false,
      reason: "Rotacao habilitada, mas nao foi possivel inicializar o controle.",
    };
  }

  const sql = getRotationSqlClient();
  if (!sql) {
    return {
      allowed: false,
      reason: "DATABASE_URL ausente para controle de rotacao.",
    };
  }

  try {
    return await sql.begin(async tx => {
      await resetDailyCounters(tx);
      return readRotationDecision(tx);
    });
  } catch (error) {
    console.error(`[Email:${SERVICE_NAME}] Falha ao consultar conta ativa`, error);
    return {
      allowed: false,
      reason: "Falha ao consultar conta ativa.",
    };
  }
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const slot = await acquireRotationSlot();
  if (!slot.allowed) {
    console.log(
      `[Email:${SERVICE_NAME}] Envio bloqueado por rotacao: ${slot.reason || "sem detalhes"}`
    );
    return false;
  }

  let sent = false;
  if (selectedProvider === "sendgrid") {
    sent = await sendViaSendgrid(params);
  } else if (selectedProvider === "mailgun") {
    sent = await sendViaMailgun(params);
  } else {
    console.error(`[Email:${SERVICE_NAME}] Envio bloqueado: ${providerError}`);
    sent = false;
  }

  if (!sent && slot.accounted) {
    await releaseRotationSlot();
  }

  return sent;
}

export function isEmailConfigured(): boolean {
  return selectedProvider !== "none";
}

export async function testEmailConnection(): Promise<boolean> {
  if (selectedProvider === "sendgrid") {
    return sendGridReady;
  }

  if (selectedProvider === "mailgun") {
    try {
      const url = `${mailgunConfig.baseUrl.replace(/\/$/, "")}/v3/domains/${mailgunConfig.domain}`;
      const response = await axios.get(url, {
        auth: {
          username: "api",
          password: mailgunConfig.apiKey,
        },
        timeout: 15_000,
      });
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      console.error(`[Email:${SERVICE_NAME}] Falha no teste de conexao Mailgun`, error);
      return false;
    }
  }

  return false;
}

export function getEmailConfig() {
  return {
    service: SERVICE_NAME,
    provider: selectedProvider,
    selection: normalizeProviderSelection(providerSelectionRaw),
    configured: selectedProvider !== "none",
    error: providerError,
    rotation: {
      enabled: rotationEnabled,
      priority: rotationPriority,
      dailyLimit: rotationDailyLimit,
      senderEnabled: rotationSenderEnabled,
    },
    fromEmail:
      selectedProvider === "sendgrid"
        ? sendGridConfig.fromEmail
        : selectedProvider === "mailgun"
          ? mailgunConfig.fromEmail
          : null,
    fromName:
      selectedProvider === "sendgrid"
        ? sendGridConfig.fromName
        : selectedProvider === "mailgun"
          ? mailgunConfig.fromName
          : null,
  };
}

export function getCurrentServiceSenderIdentity() {
  const identity = getCurrentSenderIdentity();
  return {
    serviceName: SERVICE_NAME,
    fromEmail: identity.fromEmail,
    fromName: identity.fromName,
    provider: identity.provider,
  };
}

export async function getRotationOverview(): Promise<RotationOverview> {
  const identity = getCurrentSenderIdentity();
  const fallbackAccount: RotationAccountStatus = {
    serviceName: SERVICE_NAME,
    priority: Number.isFinite(rotationPriority) ? rotationPriority : 100,
    enabled: rotationSenderEnabled,
    fromEmail: identity.fromEmail,
    fromName: identity.fromName,
    provider: identity.provider,
    dailyLimit: Number.isFinite(rotationDailyLimit) ? Math.max(rotationDailyLimit, 0) : 0,
    sentToday: 0,
    remaining: Number.isFinite(rotationDailyLimit) ? Math.max(rotationDailyLimit, 0) : 0,
    isActive: true,
  };

  if (!rotationEnabled) {
    return {
      rotationEnabled: false,
      activeService: SERVICE_NAME,
      accounts: [fallbackAccount],
    };
  }

  const ready = await ensureRotationSetup();
  if (!ready) {
    return {
      rotationEnabled: true,
      activeService: null,
      accounts: [{ ...fallbackAccount, isActive: false }],
    };
  }

  const sql = getRotationSqlClient();
  if (!sql) {
    return {
      rotationEnabled: true,
      activeService: null,
      accounts: [{ ...fallbackAccount, isActive: false }],
    };
  }

  try {
    const rows = await sql<{
      service_name: string;
      priority: number | null;
      daily_limit: number | null;
      sent_today: number | null;
      enabled: number | null;
      from_email: string | null;
      from_name: string | null;
      provider: string | null;
      updated_at: Date | string | null;
    }[]>`
      SELECT
        service_name,
        priority,
        daily_limit,
        sent_today,
        enabled,
        from_email,
        from_name,
        provider,
        updated_at
      FROM email_sending_accounts
      ORDER BY priority ASC, service_name ASC
    `;

    if (!rows.length) {
      return {
        rotationEnabled: true,
        activeService: null,
        accounts: [{ ...fallbackAccount, isActive: false }],
      };
    }

    const activeRows = dedupeAccountsByPriority(
      rows.filter(row => {
        const enabled = Number(row.enabled ?? 0) === 1;
        const dailyLimit = Number.isFinite(Number(row.daily_limit))
          ? Math.max(Math.floor(Number(row.daily_limit)), 0)
          : 0;
        const sentToday = Number.isFinite(Number(row.sent_today))
          ? Math.max(Math.floor(Number(row.sent_today)), 0)
          : 0;
        return enabled && sentToday < dailyLimit;
      })
    );
    const activeService = activeRows[0]?.service_name || null;

    const accounts = rows.map(row => {
      const fromEmail = (row.from_email || "").trim() || DEFAULT_FROM_EMAIL;
      const fromName = (row.from_name || "").trim() || row.service_name;
      const provider =
        row.provider === "sendgrid" || row.provider === "mailgun"
          ? row.provider
          : ("none" as const);
      const dailyLimit = Number.isFinite(Number(row.daily_limit))
        ? Math.max(Math.floor(Number(row.daily_limit)), 0)
        : 0;
      const sentToday = Number.isFinite(Number(row.sent_today))
        ? Math.max(Math.floor(Number(row.sent_today)), 0)
        : 0;
      const remaining = Math.max(dailyLimit - sentToday, 0);
      return {
        serviceName: row.service_name,
        priority: normalizeAccountPriority(row.priority),
        enabled: Number(row.enabled ?? 0) === 1,
        fromEmail,
        fromName,
        provider,
        dailyLimit,
        sentToday,
        remaining,
        isActive: row.service_name === activeService,
      } satisfies RotationAccountStatus;
    });

    return {
      rotationEnabled: true,
      activeService,
      accounts,
    };
  } catch (error) {
    console.error(`[Email:${SERVICE_NAME}] Falha ao carregar overview de rotacao`, error);
    return {
      rotationEnabled: true,
      activeService: null,
      accounts: [{ ...fallbackAccount, isActive: false }],
    };
  }
}

export async function listSenderAccountsForVariation(): Promise<SenderAccountInfo[]> {
  const identity = getCurrentSenderIdentity();
  const fallback: SenderAccountInfo[] = [
    {
      serviceName: SERVICE_NAME,
      priority: Number.isFinite(rotationPriority) ? rotationPriority : 100,
      enabled: true,
      fromEmail: identity.fromEmail,
      fromName: identity.fromName,
      provider: identity.provider,
    },
  ];

  if (!rotationEnabled) {
    return fallback;
  }

  const ready = await ensureRotationSetup();
  if (!ready) {
    return fallback;
  }

  const sql = getRotationSqlClient();
  if (!sql) {
    return fallback;
  }

  try {
    const rows = await sql<{
      service_name: string;
      priority: number;
      enabled: number;
      from_email: string | null;
      from_name: string | null;
      provider: string | null;
      updated_at: Date | string | null;
    }[]>`
      SELECT
        service_name,
        priority,
        enabled,
        from_email,
        from_name,
        provider,
        updated_at
      FROM email_sending_accounts
      WHERE enabled = 1
      ORDER BY priority ASC, service_name ASC
    `;

    if (!rows.length) {
      return fallback;
    }

    const deduped = dedupeAccountsByPriority(rows).map(row => {
      const fromEmail = (row.from_email || "").trim() || DEFAULT_FROM_EMAIL;
      const fromName = (row.from_name || "").trim() || row.service_name;
      const provider =
        row.provider === "sendgrid" || row.provider === "mailgun"
          ? row.provider
          : ("none" as const);
      return {
        serviceName: row.service_name,
        priority: normalizeAccountPriority(row.priority),
        enabled: Number(row.enabled ?? 0) === 1,
        fromEmail,
        fromName,
        provider,
      } satisfies SenderAccountInfo;
    });

    return deduped.length ? deduped : fallback;
  } catch (error) {
    console.error(
      `[Email:${SERVICE_NAME}] Falha ao listar contas para variacao`,
      error
    );
    return fallback;
  }
}

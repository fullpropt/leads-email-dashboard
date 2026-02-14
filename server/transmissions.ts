import postgres from "postgres";
import { generateUnsubscribeToken, replaceTemplateVariables } from "./db";
import { processEmailTemplate } from "./emailTemplate";
import { canCurrentServiceProcessQueue, sendEmail } from "./email";

export type TransmissionMode = "immediate" | "scheduled";
export type TransmissionPlatformStatus = "all" | "accessed" | "not_accessed";
export type TransmissionLeadStatus = "all" | "active" | "abandoned" | "none";
export type TransmissionSendOrder = "newest_first" | "oldest_first";
export type TransmissionStatus =
  | "draft"
  | "scheduled"
  | "processing"
  | "completed"
  | "paused"
  | "failed";

export type TransmissionDTO = {
  id: number;
  name: string;
  subject: string;
  htmlContent: string;
  mode: TransmissionMode;
  scheduledAt: string | null;
  sendIntervalSeconds: number;
  targetStatusPlataforma: TransmissionPlatformStatus;
  targetSituacao: TransmissionLeadStatus;
  sendOrder: TransmissionSendOrder;
  enabled: number;
  status: TransmissionStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  lastSentAt: string | null;
  nextRunAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTransmissionInput = {
  name: string;
  subject: string;
  htmlContent: string;
  mode: TransmissionMode;
  scheduledAt?: string | null;
  sendIntervalSeconds: number;
  targetStatusPlataforma: TransmissionPlatformStatus;
  targetSituacao: TransmissionLeadStatus;
  sendOrder: TransmissionSendOrder;
};

export type UpdateTransmissionInput = Partial<CreateTransmissionInput> & {
  enabled?: number;
};

type TransmissionRow = {
  id: number;
  name: string;
  subject: string;
  html_content: string;
  mode: TransmissionMode;
  scheduled_at: Date | string | null;
  send_interval_seconds: number;
  target_status_plataforma: TransmissionPlatformStatus;
  target_situacao: TransmissionLeadStatus;
  send_order: TransmissionSendOrder;
  enabled: number;
  status: TransmissionStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  pending_count?: number;
  last_sent_at: Date | string | null;
  next_run_at: Date | string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type RecipientRow = {
  recipient_id: number;
  lead_id: number;
  nome: string | null;
  email: string;
  produto: string | null;
  plano: string | null;
  valor: number | null;
  data_aprovacao: Date | string | null;
};

let sqlClient: ReturnType<typeof postgres> | null = null;
let schemaReady = false;
let ensurePromise: Promise<void> | null = null;

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, {
      max: 3,
      idle_timeout: 0,
      connect_timeout: 10,
    });
  }

  return sqlClient;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapTransmission(row: TransmissionRow): TransmissionDTO {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    htmlContent: row.html_content,
    mode: row.mode,
    scheduledAt: toIso(row.scheduled_at),
    sendIntervalSeconds: Number(row.send_interval_seconds ?? 0),
    targetStatusPlataforma: row.target_status_plataforma,
    targetSituacao: row.target_situacao,
    sendOrder: row.send_order,
    enabled: Number(row.enabled ?? 1),
    status: row.status,
    totalRecipients: Number(row.total_recipients ?? 0),
    sentCount: Number(row.sent_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    pendingCount: Number(row.pending_count ?? 0),
    lastSentAt: toIso(row.last_sent_at),
    nextRunAt: toIso(row.next_run_at),
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    lastError: row.last_error ?? null,
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
  };
}

async function ensureSchema() {
  if (schemaReady) return;
  if (ensurePromise) {
    await ensurePromise;
    return;
  }

  ensurePromise = (async () => {
    const sql = getSqlClient();

    await sql`
      CREATE TABLE IF NOT EXISTS email_transmissions (
        id SERIAL PRIMARY KEY,
        name varchar(255) NOT NULL,
        subject varchar(500) NOT NULL,
        html_content text NOT NULL,
        mode varchar(20) NOT NULL DEFAULT 'immediate',
        scheduled_at timestamptz NULL,
        send_interval_seconds integer NOT NULL DEFAULT 0,
        target_status_plataforma varchar(20) NOT NULL DEFAULT 'all',
        target_situacao varchar(20) NOT NULL DEFAULT 'all',
        send_order varchar(20) NOT NULL DEFAULT 'newest_first',
        enabled integer NOT NULL DEFAULT 1,
        status varchar(20) NOT NULL DEFAULT 'draft',
        total_recipients integer NOT NULL DEFAULT 0,
        sent_count integer NOT NULL DEFAULT 0,
        failed_count integer NOT NULL DEFAULT 0,
        last_sent_at timestamptz NULL,
        next_run_at timestamptz NULL,
        started_at timestamptz NULL,
        completed_at timestamptz NULL,
        last_error text NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS email_transmission_recipients (
        id SERIAL PRIMARY KEY,
        transmission_id integer NOT NULL REFERENCES email_transmissions(id) ON DELETE CASCADE,
        lead_id integer NOT NULL,
        position integer NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'pending',
        sent_at timestamptz NULL,
        error_message text NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE (transmission_id, lead_id)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_email_transmissions_schedule
      ON email_transmissions (enabled, status, next_run_at)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_email_transmission_recipients_queue
      ON email_transmission_recipients (transmission_id, status, position)
    `;

    schemaReady = true;
    ensurePromise = null;
  })();

  await ensurePromise;
}

async function getTransmissionById(id: number): Promise<TransmissionRow | null> {
  await ensureSchema();
  const sql = getSqlClient();
  const rows = await sql<TransmissionRow[]>`
    SELECT *
    FROM email_transmissions
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function buildRecipientQueue(transmission: TransmissionRow): Promise<number> {
  const sql = getSqlClient();

  await sql`
    DELETE FROM email_transmission_recipients
    WHERE transmission_id = ${transmission.id}
  `;

  const orderClause =
    transmission.send_order === "oldest_first"
      ? "l.data_criacao ASC, l.id ASC"
      : "l.data_criacao DESC, l.id DESC";

  await sql.unsafe(
    `
      WITH eligible AS (
        SELECT
          l.id AS lead_id,
          ROW_NUMBER() OVER (ORDER BY ${orderClause}) AS position
        FROM leads l
        WHERE l.unsubscribed = 0
          AND (
            $1 = 'all'
            OR ($1 = 'accessed' AND l.has_accessed_platform = 1)
            OR ($1 = 'not_accessed' AND l.has_accessed_platform = 0)
          )
          AND (
            $2 = 'all'
            OR ($2 = 'active' AND (l.status = 'active' OR l.lead_type = 'compra_aprovada'))
            OR ($2 = 'abandoned' AND (l.status = 'abandoned' OR l.lead_type = 'carrinho_abandonado'))
            OR ($2 = 'none' AND l.lead_type NOT IN ('compra_aprovada', 'carrinho_abandonado'))
          )
      )
      INSERT INTO email_transmission_recipients (
        transmission_id,
        lead_id,
        position,
        status,
        created_at,
        updated_at
      )
      SELECT
        $3,
        e.lead_id,
        e.position,
        'pending',
        NOW(),
        NOW()
      FROM eligible e
      ORDER BY e.position
    `,
    [
      transmission.target_status_plataforma,
      transmission.target_situacao,
      transmission.id,
    ]
  );

  const countRows = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM email_transmission_recipients
    WHERE transmission_id = ${transmission.id}
  `;

  return Number(countRows[0]?.count ?? 0);
}

function nextStatusAndRunAt(transmission: TransmissionRow, totalRecipients: number) {
  const now = new Date();
  const scheduledAt =
    transmission.mode === "scheduled" ? (toIso(transmission.scheduled_at) ? new Date(String(transmission.scheduled_at)) : null) : null;

  if (totalRecipients === 0) {
    return {
      status: "completed" as TransmissionStatus,
      nextRunAt: null as Date | null,
      startedAt: now,
      completedAt: now,
    };
  }

  if (transmission.mode === "scheduled" && scheduledAt && scheduledAt.getTime() > now.getTime()) {
    return {
      status: "scheduled" as TransmissionStatus,
      nextRunAt: scheduledAt,
      startedAt: null as Date | null,
      completedAt: null as Date | null,
    };
  }

  return {
    status: "processing" as TransmissionStatus,
    nextRunAt: now,
    startedAt: now,
    completedAt: null as Date | null,
  };
}

async function withTransmissionLock<T>(transmissionId: number, fn: () => Promise<T>): Promise<T | null> {
  const sql = getSqlClient();
  const lockKey = 920000 + transmissionId;

  const lockRows = await sql<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${lockKey}) AS acquired
  `;

  if (!lockRows[0]?.acquired) {
    return null;
  }

  try {
    return await fn();
  } finally {
    await sql`
      SELECT pg_advisory_unlock(${lockKey})
    `;
  }
}

export async function listTransmissions(): Promise<TransmissionDTO[]> {
  await ensureSchema();
  const sql = getSqlClient();

  const rows = await sql<TransmissionRow[]>`
    SELECT
      t.*,
      COALESCE(stats.pending_count, 0)::int AS pending_count
    FROM email_transmissions t
    LEFT JOIN (
      SELECT
        transmission_id,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count
      FROM email_transmission_recipients
      GROUP BY transmission_id
    ) stats ON stats.transmission_id = t.id
    ORDER BY t.created_at DESC, t.id DESC
  `;

  return rows.map(mapTransmission);
}

export async function createTransmission(
  input: CreateTransmissionInput
): Promise<{ success: boolean; transmission?: TransmissionDTO; message?: string }> {
  try {
    await ensureSchema();
    const sql = getSqlClient();
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const interval = Math.max(0, Math.floor(input.sendIntervalSeconds || 0));

    const rows = await sql<TransmissionRow[]>`
      INSERT INTO email_transmissions (
        name,
        subject,
        html_content,
        mode,
        scheduled_at,
        send_interval_seconds,
        target_status_plataforma,
        target_situacao,
        send_order,
        enabled,
        status,
        created_at,
        updated_at
      ) VALUES (
        ${input.name},
        ${input.subject},
        ${input.htmlContent},
        ${input.mode},
        ${scheduledAt},
        ${interval},
        ${input.targetStatusPlataforma},
        ${input.targetSituacao},
        ${input.sendOrder},
        1,
        'draft',
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    if (!rows[0]) {
      return { success: false, message: "Unable to create transmission" };
    }

    return { success: true, transmission: mapTransmission(rows[0]) };
  } catch (error) {
    console.error("[Transmission] Failed to create transmission", error);
    return { success: false, message: "Failed to create transmission" };
  }
}

export async function updateTransmission(
  id: number,
  updates: UpdateTransmissionInput
): Promise<{ success: boolean; transmission?: TransmissionDTO; message?: string }> {
  try {
    await ensureSchema();
    const sql = getSqlClient();

    const setClauses: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.subject !== undefined) {
      setClauses.push(`subject = $${idx++}`);
      values.push(updates.subject);
    }
    if (updates.htmlContent !== undefined) {
      setClauses.push(`html_content = $${idx++}`);
      values.push(updates.htmlContent);
    }
    if (updates.mode !== undefined) {
      setClauses.push(`mode = $${idx++}`);
      values.push(updates.mode);
    }
    if (updates.scheduledAt !== undefined) {
      setClauses.push(`scheduled_at = $${idx++}`);
      values.push(updates.scheduledAt ? new Date(updates.scheduledAt) : null);
    }
    if (updates.sendIntervalSeconds !== undefined) {
      setClauses.push(`send_interval_seconds = $${idx++}`);
      values.push(Math.max(0, Math.floor(updates.sendIntervalSeconds)));
    }
    if (updates.targetStatusPlataforma !== undefined) {
      setClauses.push(`target_status_plataforma = $${idx++}`);
      values.push(updates.targetStatusPlataforma);
    }
    if (updates.targetSituacao !== undefined) {
      setClauses.push(`target_situacao = $${idx++}`);
      values.push(updates.targetSituacao);
    }
    if (updates.sendOrder !== undefined) {
      setClauses.push(`send_order = $${idx++}`);
      values.push(updates.sendOrder);
    }
    if (updates.enabled !== undefined) {
      setClauses.push(`enabled = $${idx++}`);
      values.push(updates.enabled);
    }

    if (setClauses.length === 0) {
      const existing = await getTransmissionById(id);
      if (!existing) {
        return { success: false, message: "Transmission not found" };
      }
      return { success: true, transmission: mapTransmission(existing) };
    }

    setClauses.push("updated_at = NOW()");

    const query = `
      UPDATE email_transmissions
      SET ${setClauses.join(", ")}
      WHERE id = $1
      RETURNING *
    `;

    const rows = (await sql.unsafe(query, values)) as TransmissionRow[];
    if (!rows[0]) {
      return { success: false, message: "Transmission not found" };
    }

    return { success: true, transmission: mapTransmission(rows[0]) };
  } catch (error) {
    console.error("[Transmission] Failed to update transmission", error);
    return { success: false, message: "Failed to update transmission" };
  }
}

export async function deleteTransmission(
  id: number
): Promise<{ success: boolean; message?: string }> {
  try {
    await ensureSchema();
    const sql = getSqlClient();
    await sql`
      DELETE FROM email_transmissions
      WHERE id = ${id}
    `;
    return { success: true };
  } catch (error) {
    console.error("[Transmission] Failed to delete transmission", error);
    return { success: false, message: "Failed to delete transmission" };
  }
}

export async function setTransmissionEnabled(
  id: number,
  enabled: boolean
): Promise<{ success: boolean; transmission?: TransmissionDTO; message?: string }> {
  try {
    const transmission = await getTransmissionById(id);
    if (!transmission) {
      return { success: false, message: "Transmission not found" };
    }

    const sql = getSqlClient();
    const enabledValue = enabled ? 1 : 0;
    let nextStatus = transmission.status;
    let nextRunAt: Date | null = transmission.next_run_at
      ? new Date(String(transmission.next_run_at))
      : null;

    if (!enabled) {
      if (transmission.status === "processing" || transmission.status === "scheduled") {
        nextStatus = "paused";
      }
      nextRunAt = null;
    } else if (transmission.status === "paused") {
      const pendingRows = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM email_transmission_recipients
        WHERE transmission_id = ${id}
          AND status = 'pending'
      `;
      const hasPending = Number(pendingRows[0]?.count ?? 0) > 0;
      if (!hasPending) {
        nextStatus = "completed";
        nextRunAt = null;
      } else if (
        transmission.mode === "scheduled" &&
        transmission.scheduled_at &&
        new Date(String(transmission.scheduled_at)).getTime() > Date.now()
      ) {
        nextStatus = "scheduled";
        nextRunAt = new Date(String(transmission.scheduled_at));
      } else {
        nextStatus = "processing";
        nextRunAt = new Date();
      }
    }

    const rows = await sql<TransmissionRow[]>`
      UPDATE email_transmissions
      SET
        enabled = ${enabledValue},
        status = ${nextStatus},
        next_run_at = ${nextRunAt},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (!rows[0]) {
      return { success: false, message: "Transmission not found" };
    }

    return { success: true, transmission: mapTransmission(rows[0]) };
  } catch (error) {
    console.error("[Transmission] Failed to set transmission enabled", error);
    return { success: false, message: "Failed to update transmission status" };
  }
}

export async function launchTransmission(
  id: number
): Promise<{ success: boolean; transmission?: TransmissionDTO; message?: string }> {
  try {
    const transmission = await getTransmissionById(id);
    if (!transmission) {
      return { success: false, message: "Transmission not found" };
    }
    if (transmission.enabled !== 1) {
      return { success: false, message: "Transmission is disabled" };
    }

    const totalRecipients = await buildRecipientQueue(transmission);
    const scheduleDecision = nextStatusAndRunAt(transmission, totalRecipients);
    const sql = getSqlClient();

    const rows = await sql<TransmissionRow[]>`
      UPDATE email_transmissions
      SET
        status = ${scheduleDecision.status},
        total_recipients = ${totalRecipients},
        sent_count = 0,
        failed_count = 0,
        last_sent_at = NULL,
        next_run_at = ${scheduleDecision.nextRunAt},
        started_at = ${scheduleDecision.startedAt},
        completed_at = ${scheduleDecision.completedAt},
        last_error = NULL,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (!rows[0]) {
      return { success: false, message: "Transmission not found after launch" };
    }

    const message =
      totalRecipients === 0
        ? "No eligible recipients found"
        : scheduleDecision.status === "scheduled"
          ? `Transmission scheduled for ${toIso(scheduleDecision.nextRunAt)}`
          : `Transmission queued (${totalRecipients} recipients)`;

    return { success: true, transmission: mapTransmission(rows[0]), message };
  } catch (error) {
    console.error("[Transmission] Failed to launch transmission", error);
    return { success: false, message: "Failed to launch transmission" };
  }
}

async function markTransmissionCompleted(id: number) {
  const sql = getSqlClient();
  await sql`
    UPDATE email_transmissions
    SET
      status = 'completed',
      next_run_at = NULL,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

async function scheduleNextRun(id: number, secondsFromNow: number) {
  const sql = getSqlClient();
  const nextRunAt = new Date(Date.now() + secondsFromNow * 1000);
  await sql`
    UPDATE email_transmissions
    SET
      status = 'processing',
      next_run_at = ${nextRunAt},
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

async function processSingleTransmission(transmissionId: number) {
  const transmission = await getTransmissionById(transmissionId);
  if (!transmission) return;
  if (transmission.enabled !== 1) return;
  if (transmission.status === "completed" || transmission.status === "draft") return;
  if (transmission.status === "paused") return;

  const now = new Date();
  const scheduledAt = transmission.scheduled_at
    ? new Date(String(transmission.scheduled_at))
    : null;

  if (
    transmission.mode === "scheduled" &&
    scheduledAt &&
    scheduledAt.getTime() > now.getTime()
  ) {
    const sql = getSqlClient();
    await sql`
      UPDATE email_transmissions
      SET next_run_at = ${scheduledAt}, status = 'scheduled', updated_at = NOW()
      WHERE id = ${transmission.id}
    `;
    return;
  }

  const sql = getSqlClient();
  await sql`
    UPDATE email_transmissions
    SET
      status = 'processing',
      started_at = COALESCE(started_at, NOW()),
      updated_at = NOW()
    WHERE id = ${transmission.id}
  `;

  const intervalSeconds = Math.max(0, Number(transmission.send_interval_seconds ?? 0));
  const runLimit = intervalSeconds > 0 ? 1 : 25;

  for (let i = 0; i < runLimit; i += 1) {
    const nowLoop = new Date();
    const queuePermission = await canCurrentServiceProcessQueue();
    if (!queuePermission.allowed) {
      await scheduleNextRun(transmission.id, 30);
      return;
    }

    const intervalCheckRows = await sql<{ last_sent_at: Date | string | null }[]>`
      SELECT last_sent_at
      FROM email_transmissions
      WHERE id = ${transmission.id}
      LIMIT 1
    `;
    const lastSentAtRaw = intervalCheckRows[0]?.last_sent_at ?? null;
    const lastSentAt = lastSentAtRaw ? new Date(String(lastSentAtRaw)) : null;
    if (
      intervalSeconds > 0 &&
      lastSentAt &&
      nowLoop.getTime() - lastSentAt.getTime() < intervalSeconds * 1000
    ) {
      const secondsRemaining = Math.ceil(
        (intervalSeconds * 1000 - (nowLoop.getTime() - lastSentAt.getTime())) / 1000
      );
      await scheduleNextRun(transmission.id, Math.max(secondsRemaining, 1));
      return;
    }

    const recipientRows = await sql<RecipientRow[]>`
      SELECT
        r.id AS recipient_id,
        r.lead_id,
        l.nome,
        l.email,
        l.produto,
        l.plano,
        l.valor,
        l.data_aprovacao
      FROM email_transmission_recipients r
      INNER JOIN leads l ON l.id = r.lead_id
      WHERE r.transmission_id = ${transmission.id}
        AND r.status = 'pending'
      ORDER BY r.position ASC
      LIMIT 1
    `;

    const recipient = recipientRows[0];
    if (!recipient) {
      await markTransmissionCompleted(transmission.id);
      return;
    }

    const leadForTemplate = {
      nome: recipient.nome || "",
      email: recipient.email || "",
      produto: recipient.produto || "",
      plano: recipient.plano || "",
      valor: recipient.valor || 0,
      dataAprovacao: recipient.data_aprovacao || null,
    } as any;

    const htmlWithVariables = replaceTemplateVariables(
      transmission.html_content,
      leadForTemplate
    );
    const subjectWithVariables = replaceTemplateVariables(
      transmission.subject,
      leadForTemplate
    );
    const unsubscribeToken = await generateUnsubscribeToken(recipient.lead_id);
    const processedHtml = processEmailTemplate(
      htmlWithVariables,
      unsubscribeToken || undefined
    );

    const sent = await sendEmail({
      to: recipient.email,
      subject: subjectWithVariables,
      html: processedHtml,
    });

    if (sent) {
      await sql`
        UPDATE email_transmission_recipients
        SET
          status = 'sent',
          sent_at = NOW(),
          updated_at = NOW(),
          error_message = NULL
        WHERE id = ${recipient.recipient_id}
      `;

      await sql`
        UPDATE email_transmissions
        SET
          sent_count = sent_count + 1,
          last_sent_at = NOW(),
          last_error = NULL,
          updated_at = NOW()
        WHERE id = ${transmission.id}
      `;
    } else {
      const errorMessage = "Failed to send email";
      await sql`
        UPDATE email_transmission_recipients
        SET
          status = 'failed',
          sent_at = NOW(),
          updated_at = NOW(),
          error_message = ${errorMessage}
        WHERE id = ${recipient.recipient_id}
      `;

      await sql`
        UPDATE email_transmissions
        SET
          failed_count = failed_count + 1,
          last_error = ${errorMessage},
          updated_at = NOW()
        WHERE id = ${transmission.id}
      `;
    }

    if (intervalSeconds > 0) {
      await scheduleNextRun(transmission.id, intervalSeconds);
      return;
    }
  }

  await scheduleNextRun(transmission.id, 1);
}

export async function processDueTransmissions(): Promise<void> {
  try {
    await ensureSchema();
    const sql = getSqlClient();

    const dueRows = await sql<{ id: number }[]>`
      SELECT id
      FROM email_transmissions
      WHERE enabled = 1
        AND status IN ('scheduled', 'processing')
        AND next_run_at IS NOT NULL
        AND next_run_at <= NOW()
      ORDER BY next_run_at ASC, id ASC
      LIMIT 10
    `;

    for (const row of dueRows) {
      await withTransmissionLock(row.id, async () => {
        await processSingleTransmission(row.id);
      });
    }
  } catch (error) {
    console.error("[Transmission] Failed to process due transmissions", error);
  }
}

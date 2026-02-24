import { timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";

type SendConfirmationBody = {
  email?: unknown;
  name?: unknown;
  confirmationUrl?: unknown;
  appName?: unknown;
  expiresInText?: unknown;
  subject?: unknown;
};

type ParsedConfirmationPayload = {
  email: string;
  name: string | null;
  confirmationUrl: string;
  appName: string;
  expiresInText: string | null;
  subject: string;
};

const SEND_CONFIRMATION_PATH = "/api/integrations/zapvender/send-email-confirmation";

function getConfiguredApiKey(): string {
  return (
    process.env.ZAPVENDER_INTEGRATION_API_KEY ||
    process.env.MAILMKT_INTEGRATION_API_KEY ||
    process.env.INTEGRATION_API_KEY ||
    ""
  ).trim();
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function getAuthToken(req: Request): string {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader) {
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      return authHeader.slice(7).trim();
    }
    return authHeader;
  }

  return String(req.headers["x-api-key"] || "").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isEnvTrue(name: string): boolean {
  return String(process.env[name] || "").trim().toLowerCase() === "true";
}

function isLikelyEmail(email: string): boolean {
  if (!email || email.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateConfirmationUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseConfirmationPayload(body: unknown): ParsedConfirmationPayload | { error: string } {
  if (!isPlainObject(body)) {
    return { error: "Invalid JSON body" };
  }

  const raw = body as SendConfirmationBody;
  const email =
    typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";

  if (!isLikelyEmail(email)) {
    return { error: "Invalid email" };
  }

  const confirmationUrl = validateConfirmationUrl(raw.confirmationUrl);
  if (!confirmationUrl) {
    return { error: "Invalid confirmationUrl" };
  }

  const name = normalizeOptionalString(raw.name, 120);
  const appName =
    normalizeOptionalString(raw.appName, 80) ||
    process.env.ZAPVENDER_APP_NAME ||
    "ZapVender";
  const expiresInText = normalizeOptionalString(raw.expiresInText, 80);
  const subject =
    normalizeOptionalString(raw.subject, 160) ||
    `Confirme seu cadastro no ${appName}`;

  return {
    email,
    name,
    confirmationUrl,
    appName,
    expiresInText,
    subject,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  if (local.length <= 2) return `${local[0] || "*"}*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function buildConfirmationEmailHtml(payload: ParsedConfirmationPayload): string {
  const appName = escapeHtml(payload.appName);
  const name = payload.name ? escapeHtml(payload.name) : null;
  const url = escapeHtml(payload.confirmationUrl);
  const expiresLine = payload.expiresInText
    ? `<p style="margin: 0 0 20px 0; color: #6b7280;">Este link expira em ${escapeHtml(payload.expiresInText)}.</p>`
    : "";

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin: 0 0 16px 0; color: #111827;">Confirme seu cadastro</h2>
      <p style="margin: 0 0 12px 0;">${name ? `Ola, ${name}!` : "Ola!"}</p>
      <p style="margin: 0 0 16px 0;">
        Recebemos um cadastro no <strong>${appName}</strong> usando este email.
        Para ativar sua conta, confirme seu endereco clicando no botao abaixo.
      </p>
      ${expiresLine}
      <p style="margin: 0 0 24px 0;">
        <a
          href="${url}"
          style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;"
        >
          Confirmar cadastro
        </a>
      </p>
      <p style="margin: 0 0 8px 0; color: #6b7280;">Se o botao nao funcionar, copie e cole este link no navegador:</p>
      <p style="margin: 0; word-break: break-all;">
        <a href="${url}" style="color: #2563eb;">${url}</a>
      </p>
      <p style="margin: 24px 0 0 0; color: #6b7280;">
        Se voce nao solicitou esse cadastro, pode ignorar este email.
      </p>
    </div>
  `;
}

function isAuthorized(req: Request): boolean {
  const configuredApiKey = getConfiguredApiKey();
  if (!configuredApiKey) return false;

  const token = getAuthToken(req);
  if (!token) return false;

  return constantTimeEquals(token, configuredApiKey);
}

export function registerZapVenderIntegrationRoutes(app: Express) {
  app.post(SEND_CONFIRMATION_PATH, async (req: Request, res: Response) => {
    const configuredApiKey = getConfiguredApiKey();
    if (!configuredApiKey) {
      console.warn("[ZapVender Integration] API key not configured");
      return res.status(503).json({
        success: false,
        message: "Integration not configured",
      });
    }

    if (!isAuthorized(req)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const parsed = parseConfirmationPayload(req.body);
    if ("error" in parsed) {
      return res.status(400).json({
        success: false,
        message: parsed.error,
      });
    }

    try {
      const [
        { sendEmail, sendEmailWithoutRotation },
        { processEmailTemplate },
      ] = await Promise.all([
        import("../email"),
        import("../emailTemplate"),
      ]);

      const bypassRotation = isEnvTrue("ZAPVENDER_CONFIRMATION_BYPASS_ROTATION");
      const fromEmail =
        normalizeOptionalString(process.env.ZAPVENDER_CONFIRMATION_FROM_EMAIL, 320) ||
        undefined;
      const fromName =
        normalizeOptionalString(process.env.ZAPVENDER_CONFIRMATION_FROM_NAME, 120) ||
        parsed.appName;
      const html = processEmailTemplate(buildConfirmationEmailHtml(parsed));
      const sendFn = bypassRotation ? sendEmailWithoutRotation : sendEmail;
      const sent = await sendFn({
        to: parsed.email,
        subject: parsed.subject,
        html,
        fromEmail,
        fromName,
      });

      if (!sent) {
        console.error(
          `[ZapVender Integration] Failed to send confirmation email to ${maskEmail(parsed.email)}`
        );
        return res.status(502).json({
          success: false,
          message: "Email provider rejected or failed to send",
        });
      }

      console.log(
        `[ZapVender Integration] Confirmation email sent to ${maskEmail(parsed.email)} (bypassRotation=${bypassRotation})`
      );
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("[ZapVender Integration] Unexpected error", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  });
}

import crypto from "crypto";
import type { Request, Response } from "express";
import { suppressLeadsByEmail } from "./db";

type SendGridEvent = {
  event?: string;
  email?: string;
  reason?: string;
  response?: string;
  status?: string;
};

type MailgunEventData = {
  event?: string;
  recipient?: string;
  reason?: string;
  severity?: string;
  "delivery-status"?: {
    code?: number | string;
    message?: string;
    description?: string;
  };
};

const SUPPRESS_TEMPORARY_FAILURES =
  process.env.EMAIL_SUPPRESS_TEMPORARY_FAILURES === "true";

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";
  return value.toLowerCase().trim();
}

function isTemporaryFailureReason(reason: string) {
  const value = reason.toLowerCase();
  return (
    value.includes("mailbox full") ||
    value.includes("out of storage") ||
    value.includes("temporar") ||
    value.includes("try again later") ||
    value.includes("rate limit") ||
    value.includes("greylist") ||
    value.includes("4.2.2") ||
    value.includes("4xx")
  );
}

function shouldSuppressSendGrid(event: SendGridEvent) {
  const eventType = String(event.event || "").toLowerCase();
  const reason = `${event.reason || ""} ${event.response || ""} ${event.status || ""}`
    .trim()
    .toLowerCase();

  const suppressEvents = new Set([
    "bounce",
    "blocked",
    "dropped",
    "spamreport",
    "unsubscribe",
    "group_unsubscribe",
  ]);

  if (!suppressEvents.has(eventType)) return false;
  if (!SUPPRESS_TEMPORARY_FAILURES && isTemporaryFailureReason(reason)) return false;
  return true;
}

function extractMailgunSignature(body: any) {
  if (body?.signature?.timestamp && body?.signature?.token && body?.signature?.signature) {
    return {
      timestamp: String(body.signature.timestamp),
      token: String(body.signature.token),
      signature: String(body.signature.signature),
    };
  }

  if (body?.timestamp && body?.token && body?.signature) {
    return {
      timestamp: String(body.timestamp),
      token: String(body.token),
      signature: String(body.signature),
    };
  }

  return null;
}

function verifyMailgunSignature(body: any) {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey) return true;

  const signature = extractMailgunSignature(body);
  if (!signature) return false;

  const digest = crypto
    .createHmac("sha256", signingKey)
    .update(signature.timestamp + signature.token)
    .digest("hex");

  return digest === signature.signature;
}

function shouldSuppressMailgun(eventData: MailgunEventData) {
  const eventType = String(eventData.event || "").toLowerCase();
  const deliveryStatus = eventData["delivery-status"] || {};
  const code = String(deliveryStatus.code || "");
  const reason = `${eventData.reason || ""} ${deliveryStatus.message || ""} ${deliveryStatus.description || ""}`
    .trim()
    .toLowerCase();

  if (eventType === "unsubscribed" || eventType === "complained") return true;
  if (eventType === "permanent_fail" || eventType === "rejected") return true;

  if (eventType === "failed") {
    const temporaryBySeverity = String(eventData.severity || "").toLowerCase() === "temporary";
    const temporaryByCode = code.startsWith("4");
    const temporaryByReason = isTemporaryFailureReason(reason);
    if (!SUPPRESS_TEMPORARY_FAILURES && (temporaryBySeverity || temporaryByCode || temporaryByReason)) {
      return false;
    }
    return true;
  }

  return false;
}

function parseSendGridEvents(req: Request): SendGridEvent[] {
  const body = req.body;

  if (Buffer.isBuffer(body)) {
    const parsed = JSON.parse(body.toString("utf8"));
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  if (typeof body === "string") {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") return [body];
  return [];
}

function parseMailgunEventData(req: Request): MailgunEventData | null {
  const body: any = req.body;
  const raw = body?.["event-data"] ?? body?.eventData ?? null;

  if (!raw) {
    if (body && typeof body === "object" && body.event) {
      return body as MailgunEventData;
    }
    return null;
  }

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as MailgunEventData;
    } catch {
      return null;
    }
  }

  if (typeof raw === "object") return raw as MailgunEventData;
  return null;
}

export async function handleSendGridEventsWebhook(req: Request, res: Response) {
  const expectedToken = process.env.SENDGRID_EVENT_WEBHOOK_TOKEN;
  if (expectedToken) {
    const authHeader = String(req.headers.authorization || "");
    const tokenHeader = String(req.headers["x-sendgrid-webhook-token"] || "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader;
    if (bearer !== expectedToken && tokenHeader !== expectedToken) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
  }

  try {
    const events = parseSendGridEvents(req);
    let suppressedEvents = 0;
    let updatedLeads = 0;

    for (const event of events) {
      const email = normalizeEmail(event.email);
      if (!email) continue;
      if (!shouldSuppressSendGrid(event)) continue;

      const reason = `${event.event || "unknown"}:${event.reason || event.response || event.status || "n/a"}`.slice(0, 200);
      const updated = await suppressLeadsByEmail(email, `sendgrid:${event.event || "unknown"}`, reason);
      suppressedEvents += 1;
      updatedLeads += updated;
    }

    return res.status(200).json({
      success: true,
      processed: events.length,
      suppressedEvents,
      updatedLeads,
    });
  } catch (error) {
    console.error("[Webhook Email Events] SendGrid handler error:", error);
    // Retorna 200 para evitar loop de retries em caso de payload inesperado.
    return res.status(200).json({ success: false, message: "Invalid payload" });
  }
}

export async function handleMailgunEventsWebhook(req: Request, res: Response) {
  try {
    if (!verifyMailgunSignature(req.body)) {
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const eventData = parseMailgunEventData(req);
    if (!eventData) {
      return res.status(200).json({ success: false, message: "No event-data" });
    }

    const recipient = normalizeEmail(eventData.recipient);
    if (!recipient) {
      return res.status(200).json({ success: true, processed: 1, suppressedEvents: 0, updatedLeads: 0 });
    }

    if (!shouldSuppressMailgun(eventData)) {
      return res.status(200).json({ success: true, processed: 1, suppressedEvents: 0, updatedLeads: 0 });
    }

    const deliveryStatus = eventData["delivery-status"] || {};
    const reason = `${eventData.event || "unknown"}:${eventData.reason || deliveryStatus.message || deliveryStatus.description || deliveryStatus.code || "n/a"}`.slice(0, 200);
    const updatedLeads = await suppressLeadsByEmail(
      recipient,
      `mailgun:${eventData.event || "unknown"}`,
      reason
    );

    return res.status(200).json({
      success: true,
      processed: 1,
      suppressedEvents: 1,
      updatedLeads,
    });
  } catch (error) {
    console.error("[Webhook Email Events] Mailgun handler error:", error);
    // Retorna 200 para evitar retries em loop.
    return res.status(200).json({ success: false, message: "Invalid payload" });
  }
}

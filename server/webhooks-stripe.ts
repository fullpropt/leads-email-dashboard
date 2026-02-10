/**
 * Webhook para receber eventos do Stripe e normalizar no formato já
 * utilizado pelo processador atual de leads.
 *
 * Eventos suportados:
 * - checkout.session.completed
 * - checkout.session.async_payment_succeeded
 * - checkout.session.expired
 * - checkout.session.async_payment_failed
 *
 * Observação:
 * Para carrinho abandonado no Stripe, é necessário usar Checkout Sessions
 * e habilitar o evento checkout.session.expired.
 */

import crypto from "crypto";
import { processWebhook } from "./webhooks";

const SUCCESS_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

const ABANDONED_EVENTS = new Set([
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
]);

function safeCompareHex(expectedHex: string, receivedHex: string): boolean {
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const received = Buffer.from(receivedHex, "hex");

    if (expected.length !== received.length) {
      return false;
    }

    return crypto.timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

/**
 * Verifica assinatura do webhook do Stripe usando STRIPE_WEBHOOK_SECRET.
 * Header esperado: Stripe-Signature: t=...,v1=...
 */
export function verifyStripeSignature(
  rawBody: Buffer | string,
  signatureHeader: string,
  webhookSecret: string
): boolean {
  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
  const parts = signatureHeader.split(",").map((part) => part.trim());

  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.replace("v1=", ""));

  if (!timestampPart || signatures.length === 0) {
    return false;
  }

  const timestamp = timestampPart.replace("t=", "");
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  // Proteção básica contra replay attack (10 minutos)
  const timestampNumber = Number(timestamp);
  if (!Number.isNaN(timestampNumber)) {
    const now = Math.floor(Date.now() / 1000);
    const ageInSeconds = Math.abs(now - timestampNumber);
    if (ageInSeconds > 600) {
      console.warn("[Webhook Stripe] ⚠️ Timestamp fora da janela de segurança");
      return false;
    }
  }

  return signatures.some((sig) => safeCompareHex(expectedSignature, sig));
}

function normalizeStripeEventToLegacyPayload(eventPayload: any): {
  payload?: any;
  ignored?: boolean;
  message?: string;
  error?: string;
} {
  if (!eventPayload || typeof eventPayload !== "object") {
    return { error: "Payload inválido" };
  }

  const eventType = eventPayload.type as string | undefined;
  const stripeObject = eventPayload.data?.object;

  if (!eventType || !stripeObject) {
    return { error: "Evento Stripe inválido (type/data.object ausentes)" };
  }

  const isSuccess = SUCCESS_EVENTS.has(eventType);
  const isAbandoned = ABANDONED_EVENTS.has(eventType);

  if (!isSuccess && !isAbandoned) {
    return {
      ignored: true,
      message: `Evento ${eventType} ignorado`,
    };
  }

  const customerEmail =
    stripeObject.customer_details?.email ||
    stripeObject.customer_email ||
    stripeObject.metadata?.customer_email ||
    stripeObject.metadata?.email ||
    null;

  if (!customerEmail) {
    return { error: "Email do cliente não encontrado no evento Stripe" };
  }

  const customerName =
    stripeObject.customer_details?.name ||
    stripeObject.metadata?.customer_name ||
    "Cliente Stripe";

  const customerCountry =
    stripeObject.customer_details?.address?.country ||
    stripeObject.metadata?.country ||
    undefined;

  const amountInCents =
    typeof stripeObject.amount_total === "number"
      ? stripeObject.amount_total
      : 0;

  const productName =
    stripeObject.metadata?.product_name ||
    stripeObject.metadata?.product ||
    stripeObject.metadata?.offer_name ||
    "Produto Stripe";

  const planName =
    stripeObject.metadata?.plan_name ||
    stripeObject.metadata?.plan ||
    stripeObject.mode ||
    "default";

  const transactionCode =
    stripeObject.payment_intent ||
    stripeObject.id ||
    eventPayload.id ||
    `stripe_${Date.now()}`;

  const normalizedPayload = {
    customer: {
      full_name: customerName,
      email: customerEmail,
      country: customerCountry,
    },
    product: {
      name: productName,
    },
    plan: {
      name: planName,
    },
    sale_amount: amountInCents / 100, // processWebhook converte para centavos
    code: transactionCode,
    sale_status_enum: isSuccess ? "approved" : "abandoned",
    sale_status_detail: isSuccess ? "approved" : "abandoned",
    source: "stripe",
    stripe_event_id: eventPayload.id,
    stripe_event_type: eventType,
  };

  return { payload: normalizedPayload };
}

/**
 * Processa webhook do Stripe convertendo para o fluxo legado já existente.
 */
export async function processStripeWebhook(eventPayload: any): Promise<{
  success: boolean;
  message: string;
  eventType?: string;
  error?: string;
}> {
  try {
    const eventType = eventPayload?.type;

    console.log("[Webhook Stripe] ===== EVENTO RECEBIDO =====");
    console.log("[Webhook Stripe] type:", eventType);
    console.log("[Webhook Stripe] id:", eventPayload?.id);

    const normalized = normalizeStripeEventToLegacyPayload(eventPayload);

    if (normalized.error) {
      console.error("[Webhook Stripe] ❌ Erro de normalização:", normalized.error);
      return {
        success: false,
        message: "Falha ao normalizar payload do Stripe",
        eventType,
        error: normalized.error,
      };
    }

    if (normalized.ignored) {
      console.log("[Webhook Stripe] ℹ️", normalized.message);
      return {
        success: true,
        message: normalized.message || "Evento ignorado",
        eventType,
      };
    }

    const result = await processWebhook(normalized.payload);

    if (result.success) {
      console.log("[Webhook Stripe] ✅ Evento processado com sucesso");
      return {
        success: true,
        message: "Webhook Stripe processado com sucesso",
        eventType,
      };
    }

    return {
      success: false,
      message: result.message || "Falha ao processar webhook Stripe",
      eventType,
      error: result.error,
    };
  } catch (error) {
    console.error("[Webhook Stripe] ❌ Erro inesperado:", error);
    return {
      success: false,
      message: "Erro ao processar webhook Stripe",
      error: error instanceof Error ? error.message : String(error),
      eventType: eventPayload?.type,
    };
  }
}

/**
 * Handler Express para endpoint do Stripe.
 * Importante: este endpoint deve receber body raw (Buffer) para validar assinatura.
 */
export async function handleStripeWebhook(req: any, res: any) {
  try {
    const signatureHeaderRaw = req.headers["stripe-signature"];
    const signatureHeader = Array.isArray(signatureHeaderRaw)
      ? signatureHeaderRaw[0]
      : signatureHeaderRaw;

    const rawBody: Buffer | string = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body || {});

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (webhookSecret) {
      if (!signatureHeader) {
        console.warn("[Webhook Stripe] ⚠️ Header stripe-signature ausente");
        return res.status(400).json({
          success: false,
          error: "Missing stripe-signature header",
        });
      }

      const isValid = verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
      if (!isValid) {
        console.warn("[Webhook Stripe] ⚠️ Assinatura inválida");
        return res.status(400).json({
          success: false,
          error: "Invalid Stripe signature",
        });
      }
    } else {
      console.warn(
        "[Webhook Stripe] ⚠️ STRIPE_WEBHOOK_SECRET não configurado. Assinatura NÃO validada."
      );
    }

    let eventPayload: any;
    try {
      const bodyString = Buffer.isBuffer(rawBody)
        ? rawBody.toString("utf8")
        : rawBody;
      eventPayload = JSON.parse(bodyString);
    } catch {
      console.error("[Webhook Stripe] ❌ Body não é um JSON válido");
      return res.status(400).json({
        success: false,
        error: "Invalid JSON payload",
      });
    }

    const result = await processStripeWebhook(eventPayload);

    // Mantemos 200 para evitar retries em loop quando houver erro de payload/evento.
    return res.status(200).json(result);
  } catch (error) {
    console.error("[Webhook Stripe] ❌ Erro no handler:", error);
    return res.status(200).json({
      success: false,
      message: "Erro interno ao processar webhook Stripe",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
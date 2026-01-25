/**
 * Webhook para receber emails de suporte via Mailgun
 * 
 * Configuração no Mailgun:
 * 1. Vá em Receiving > Create Route
 * 2. Expression Type: Match Recipient
 * 3. Recipient: suporte@seudominio.com (ou catch_all())
 * 4. Actions: Store and Notify
 * 5. Forward URL: https://seu-app.railway.app/api/webhooks/mailgun/incoming
 */

import crypto from "crypto";
import {
  createSupportEmail,
  getSupportEmailByMessageId,
} from "./support-db";

interface MailgunWebhookPayload {
  // Identificação
  "Message-Id"?: string;
  "message-id"?: string;
  
  // Remetente e destinatário
  sender?: string;
  from?: string;
  From?: string;
  recipient?: string;
  To?: string;
  to?: string;
  
  // Conteúdo
  subject?: string;
  Subject?: string;
  "body-plain"?: string;
  "body-html"?: string;
  "stripped-text"?: string;
  "stripped-signature"?: string;
  
  // Anexos
  "attachment-count"?: string;
  attachments?: string;
  
  // Headers
  "message-headers"?: string;
  
  // Verificação Mailgun
  timestamp?: string;
  token?: string;
  signature?: string;
}

/**
 * Verificar assinatura do webhook do Mailgun
 */
export function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
  apiKey: string
): boolean {
  const encodedToken = crypto
    .createHmac("sha256", apiKey)
    .update(timestamp + token)
    .digest("hex");

  return encodedToken === signature;
}

/**
 * Extrair nome do remetente do campo "from"
 */
function extractSenderName(from: string): string | null {
  // Formato: "Nome <email@exemplo.com>" ou apenas "email@exemplo.com"
  const match = from.match(/^(.+?)\s*<.+>$/);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

/**
 * Extrair email do campo "from"
 */
function extractSenderEmail(from: string): string {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

/**
 * Processar webhook de email recebido do Mailgun
 */
export async function processIncomingEmailWebhook(
  payload: MailgunWebhookPayload
): Promise<{ success: boolean; emailId?: number; error?: string }> {
  try {
    console.log("[Webhook Support] 📧 Processando email recebido...");

    // Extrair dados do payload (Mailgun pode enviar com diferentes capitalizações)
    const messageId = payload["Message-Id"] || payload["message-id"];
    const fromField = payload.from || payload.From || payload.sender || "";
    const recipient = payload.recipient || payload.To || payload.to || "";
    const subject = payload.subject || payload.Subject || "(Sem assunto)";
    const bodyPlain = payload["body-plain"] || "";
    const bodyHtml = payload["body-html"] || "";
    const strippedText = payload["stripped-text"] || "";
    const strippedSignature = payload["stripped-signature"] || "";
    const attachmentCount = parseInt(payload["attachment-count"] || "0", 10);
    const attachments = payload.attachments || null;
    const messageHeaders = payload["message-headers"] || null;
    const timestamp = payload.timestamp ? parseInt(payload.timestamp, 10) : null;
    const token = payload.token || null;
    const signature = payload.signature || null;

    // Extrair informações do remetente
    const senderEmail = extractSenderEmail(fromField);
    const senderName = extractSenderName(fromField);

    console.log("[Webhook Support] 📬 De:", senderEmail);
    console.log("[Webhook Support] 📬 Para:", recipient);
    console.log("[Webhook Support] 📬 Assunto:", subject);

    // Verificar se o email já foi processado (evitar duplicatas)
    if (messageId) {
      const existingEmail = await getSupportEmailByMessageId(messageId);
      if (existingEmail) {
        console.log("[Webhook Support] ⚠️ Email já processado:", messageId);
        return { success: true, emailId: existingEmail.id };
      }
    }

    // Criar registro do email no banco de dados
    const emailId = await createSupportEmail({
      messageId: messageId || null,
      sender: senderEmail,
      senderName: senderName || null,
      recipient,
      subject,
      bodyPlain: bodyPlain || null,
      bodyHtml: bodyHtml || null,
      strippedText: strippedText || null,
      strippedSignature: strippedSignature || null,
      attachmentCount,
      attachments: attachments || null,
      messageHeaders: messageHeaders || null,
      mailgunTimestamp: timestamp,
      mailgunToken: token,
      mailgunSignature: signature,
      status: "pending",
    });

    if (!emailId) {
      console.error("[Webhook Support] ❌ Falha ao salvar email no banco");
      return { success: false, error: "Falha ao salvar email" };
    }

    console.log("[Webhook Support] ✅ Email salvo com ID:", emailId);

    return { success: true, emailId };
  } catch (error) {
    console.error("[Webhook Support] ❌ Erro ao processar webhook:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

/**
 * Handler Express para o webhook do Mailgun
 */
export async function handleMailgunIncomingWebhook(req: any, res: any) {
  try {
    console.log("[Webhook Support] 📨 Webhook recebido");

    // O Mailgun envia dados como form-data ou JSON
    const payload = req.body as MailgunWebhookPayload;

    // Verificar assinatura (opcional, mas recomendado em produção)
    const apiKey = process.env.MAILGUN_API_KEY;
    if (apiKey && payload.timestamp && payload.token && payload.signature) {
      const isValid = verifyMailgunSignature(
        payload.timestamp,
        payload.token,
        payload.signature,
        apiKey
      );

      if (!isValid) {
        console.warn("[Webhook Support] ⚠️ Assinatura inválida");
        // Em produção, você pode querer rejeitar a requisição
        // return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Processar o email
    const result = await processIncomingEmailWebhook(payload);

    if (result.success) {
      // Mailgun espera um 200 OK para confirmar recebimento
      res.status(200).json({ 
        success: true, 
        message: "Email received",
        emailId: result.emailId 
      });
    } else {
      // Retornar 200 mesmo em caso de erro para evitar reenvios do Mailgun
      // Logar o erro para investigação
      console.error("[Webhook Support] Erro processado:", result.error);
      res.status(200).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    console.error("[Webhook Support] ❌ Erro no handler:", error);
    // Retornar 200 para evitar reenvios
    res.status(200).json({ 
      success: false, 
      error: "Internal error" 
    });
  }
}

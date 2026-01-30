import sgMail from "@sendgrid/mail";

// Configurar SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@tubetoolsup.uk";
const FROM_NAME = process.env.SENDGRID_FROM_NAME || "TubeTools";

// Inicializar SendGrid
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log("[Email] SendGrid configurado com sucesso");
} else {
  console.warn("[Email] ⚠️ SENDGRID_API_KEY não configurada");
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
}

/**
 * Envia um email usando SendGrid
 */
export async function sendEmail({
  to,
  subject,
  html,
  from = FROM_EMAIL,
  fromName = FROM_NAME,
}: SendEmailParams): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.error("[Email] ❌ SENDGRID_API_KEY não configurada");
    return false;
  }

  try {
    console.log(`[Email] 📤 Enviando email para ${to}...`);
    console.log(`[Email] Assunto: ${subject}`);
    console.log(`[Email] De: ${fromName} <${from}>`);

    const msg = {
      to: to,
      from: {
        email: from,
        name: fromName,
      },
      subject: subject,
      html: html,
      // Adicionar texto alternativo para clientes que não suportam HTML
      text: html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(),
    };

    const response = await sgMail.send(msg);
    
    console.log(`[Email] ✅ Email enviado com sucesso!`);
    console.log(`[Email] Status: ${response[0].statusCode}`);
    
    return true;
  } catch (error: any) {
    console.error("[Email] ❌ Erro ao enviar email:", error);
    
    // Log detalhado do erro do SendGrid
    if (error.response) {
      console.error("[Email] Status:", error.response.statusCode);
      console.error("[Email] Body:", JSON.stringify(error.response.body, null, 2));
    }
    
    return false;
  }
}

/**
 * Verifica se o serviço de email está configurado
 */
export function isEmailConfigured(): boolean {
  return !!SENDGRID_API_KEY;
}

/**
 * Retorna informações sobre a configuração atual
 */
export function getEmailConfig() {
  return {
    provider: "SendGrid",
    configured: !!SENDGRID_API_KEY,
    fromEmail: FROM_EMAIL,
    fromName: FROM_NAME,
  };
}
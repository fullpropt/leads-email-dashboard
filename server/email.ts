/**
 * Módulo de Envio de Emails com Mailgun
 * CORREÇÕES APLICADAS:
 * 1. Removidas importações desnecessárias (form-data, node-fetch)
 * 2. Usando FormData nativa do Node.js 18+
 * 3. Usando fetch nativa do Node.js 18+
 */

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;

    if (!apiKey || !domain) {
      console.error("[Email] ❌ Credenciais não configuradas");
      return false;
    }

    // ✅ FormData nativa (sem import)
    const form = new FormData();
    form.append("from", `Support <support@${domain}>`);
    form.append("to", options.to);
    form.append("subject", options.subject);
    form.append("html", options.html);

    const authString = `api:${apiKey}`;
    const encodedAuth = Buffer.from(authString).toString("base64");

    // ✅ fetch nativa (sem import)
    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodedAuth}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Email] ❌ Erro ao enviar email:", response.status);
      
      if (response.status === 401) console.error("⚠️ API Key inválida");
      if (response.status === 403) console.error("⚠️ Domínio Sandbox (limite excedido)");
      
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Email] ❌ Exceção:", error);
    return false;
  }
}

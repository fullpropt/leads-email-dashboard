import FormData from "form-data";
import fetch from "node-fetch";

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
      console.error("[Email] Mailgun credentials not configured");
      return false;
    }

    const form = new FormData();
    form.append("from", `Support <support@${domain}>`);
    form.append("to", options.to);
    form.append("subject", options.subject);
    form.append("html", options.html);

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}` ).toString("base64")}`,
      },
      body: form,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Email] Erro ao enviar email:", {
        status: response.status,
        error,
      });
      return false;
    }

    const result = await response.json();
    console.log("[Email] Mensagem enviada com sucesso:", result);
    return true;
  } catch (error) {
    console.error("[Email] Erro ao enviar email:", error);
    return false;
  }
}

export async function testEmailConnection(): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;

    if (!apiKey || !domain) {
      console.error("[Email] Mailgun credentials not configured");
      return false;
    }

    const response = await fetch(`https://api.mailgun.net/v3/${domain}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}` ).toString("base64")}`,
      },
    });

    if (response.ok) {
      console.log("[Email] Conexão Mailgun verificada com sucesso");
      return true;
    } else {
      console.error("[Email] Erro ao verificar conexão Mailgun:", response.status);
      return false;
    }
  } catch (error) {
    console.error("[Email] Erro ao verificar conexão Mailgun:", error);
    return false;
  }
}

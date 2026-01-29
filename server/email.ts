import nodemailer from "nodemailer";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  /** Token de unsubscribe do lead (opcional - será buscado automaticamente se não fornecido) */
  unsubscribeToken?: string;
  /** Se true, não processa o template (já está pronto) */
  skipProcessing?: boolean;
}

/**
 * Envia um email usando Brevo como provedor principal, 
 * com fallback para Mailgun.
 * Automaticamente envolve o conteúdo com header e rodapé padrão TubeTools.
 * Inclui link de unsubscribe automático no rodapé.
 * 
 * @param options - Opções do email (destinatário, assunto, conteúdo HTML)
 * @returns Promise<boolean> - true se enviado com sucesso, false caso contrário
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  try {
    // Verificar se o lead está inscrito (não fez unsubscribe)
    const { isLeadSubscribed, getUnsubscribeTokenByEmail } = await import("./db");
    const isSubscribed = await isLeadSubscribed(options.to);
    
    if (!isSubscribed) {
      console.log(`[Email] ⚠️ Lead ${options.to} cancelou inscrição, email não enviado`);
      return false;
    }
    
    // Obter token de unsubscribe se não foi fornecido
    let unsubscribeToken = options.unsubscribeToken;
    if (!unsubscribeToken) {
      unsubscribeToken = await getUnsubscribeTokenByEmail(options.to) || undefined;
    }
    
    // Processar HTML com header, rodapé e link de unsubscribe
    let processedHtml = options.html;
    if (!options.skipProcessing) {
      const { processEmailTemplate } = await import("./emailTemplate");
      processedHtml = processEmailTemplate(options.html, unsubscribeToken);
    }
    
    // Criar opções com HTML processado
    const processedOptions = {
      ...options,
      html: processedHtml
    };
    
    // 1. Tenta enviar com Brevo primeiro (provedor principal)
    const brevoSuccess = await sendWithBrevo(processedOptions);
    if (brevoSuccess) {
      return true;
    }

    // 2. Se Brevo falhar, tenta com Mailgun como fallback
    console.warn("[Email] ⚠️ Brevo falhou, tentando com Mailgun...");
    const mailgunSuccess = await sendWithMailgun(processedOptions);
    return mailgunSuccess;

  } catch (error) {
    console.error("[Email] ❌ Exceção geral ao enviar email:", error);
    return false;
  }
}

/**
 * Envia um email usando a API da Brevo (provedor principal).
 * Usa a API REST em vez de SMTP para melhor performance e funcionalidades.
 */
async function sendWithBrevo(options: SendEmailOptions): Promise<boolean> {
  try {
    // Usar variáveis de ambiente
    const apiKey = process.env.BREVO_API_KEY;
    const fromEmail = process.env.BREVO_FROM_EMAIL || "noreply@tubetoolsup.uk";
    const fromName = process.env.BREVO_FROM_NAME || "TubeTools";

    // Validar credenciais
    if (!apiKey) {
      console.error("[Brevo] ❌ API Key não configurada");
      console.error("[Brevo] ⚠️ Configure a variável de ambiente BREVO_API_KEY");
      return false;
    }

    console.log("[Brevo] 📤 Enviando email para:", options.to);
    console.log("[Brevo] 📧 Assunto:", options.subject);
    console.log("[Brevo] 👤 De:", fromEmail);

    // Preparar payload para a API do Brevo
    const payload = {
      sender: {
        name: fromName,
        email: fromEmail,
      },
      to: [
        {
          email: options.to,
        },
      ],
      subject: options.subject,
      htmlContent: options.html,
      // Opcional: adicionar tags para rastreamento
      tags: ["transactional", "tubetools"],
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Brevo] ❌ Erro ao enviar email");
      console.error("[Brevo] Status:", response.status);
      console.error("[Brevo] Resposta:", errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.error("[Brevo] Erro detalhado:", errorJson);
        
        // Mensagens de erro específicas
        if (response.status === 400) {
          console.error("[Brevo] ⚠️ Erro 400: Requisição inválida - verifique os parâmetros");
        } else if (response.status === 401) {
          console.error("[Brevo] ⚠️ Erro 401: API Key inválida ou expirada");
        } else if (response.status === 403) {
          console.error("[Brevo] ⚠️ Erro 403: Acesso negado");
        } else if (response.status === 429) {
          console.error("[Brevo] ⚠️ Erro 429: Limite de taxa excedido - tente novamente mais tarde");
        }
      } catch (e) {
        // Não é JSON, ignorar
      }
      
      return false;
    }

    const result = await response.json();
    console.log("[Brevo] ✅ Email enviado com sucesso!");
    console.log("[Brevo] ID da mensagem:", result.messageId);
    
    return true;

  } catch (error) {
    console.error("[Brevo] ❌ Exceção ao enviar email:");
    console.error("[Brevo] Erro:", error);
    if (error instanceof Error) {
      console.error("[Brevo] Mensagem:", error.message);
      console.error("[Brevo] Stack:", error.stack);
    }
    return false;
  }
}

/**
 * Envia um email usando a API do Mailgun (fallback).
 */
async function sendWithMailgun(options: SendEmailOptions): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    const fromEmail = process.env.MAILGUN_FROM_EMAIL || "noreply@tubetoolsup.uk";

    // Validar credenciais
    if (!apiKey || !domain) {
      console.error("[Mailgun] ❌ Credenciais não configuradas");
      console.error("[Mailgun] MAILGUN_API_KEY:", apiKey ? "✓ Configurado" : "✗ Faltando");
      console.error("[Mailgun] MAILGUN_DOMAIN:", domain ? "✓ Configurado" : "✗ Faltando");
      return false;
    }

    const form = new FormData();
    form.append("from", `TubeTools <${fromEmail}>`);
    form.append("to", options.to);
    form.append("subject", options.subject);
    form.append("html", options.html);

    const authString = `api:${apiKey}`;
    const encodedAuth = Buffer.from(authString).toString("base64");

    console.log("[Mailgun] 📤 Enviando email para:", options.to);
    console.log("[Mailgun] 📧 Assunto:", options.subject);
    console.log("[Mailgun] 🔐 Domínio:", domain);

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodedAuth}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Mailgun] ❌ Erro ao enviar email");
      console.error("[Mailgun] Status:", response.status);
      console.error("[Mailgun] Resposta:", errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.error("[Mailgun] Erro detalhado:", errorJson);
      } catch (e) {
        // Não é JSON, ignorar
      }
      
      return false;
    }

    const result = await response.json();
    console.log("[Mailgun] ✅ Email enviado com sucesso!");
    console.log("[Mailgun] ID da mensagem:", result.id);
    
    return true;

  } catch (error) {
    console.error("[Mailgun] ❌ Exceção ao enviar email:");
    console.error("[Mailgun] Erro:", error);
    if (error instanceof Error) {
      console.error("[Mailgun] Mensagem:", error.message);
      console.error("[Mailgun] Stack:", error.stack);
    }
    return false;
  }
}

/**
 * Testa a conexão com o Brevo
 * 
 * @returns Promise<boolean> - true se conectado com sucesso, false caso contrário
 */
async function testBrevoConnection(): Promise<boolean> {
  try {
    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      console.error("[Brevo] ❌ API Key não configurada para teste");
      return false;
    }

    console.log("[Brevo] 🔍 Testando conexão com Brevo...");

    const response = await fetch("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: {
        "api-key": apiKey,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log("[Brevo] ✅ Conexão Brevo verificada com sucesso!");
      console.log("[Brevo] Conta:", data.email);
      return true;
    } else {
      const errorText = await response.text();
      console.error("[Brevo] ❌ Erro ao verificar conexão");
      console.error("[Brevo] Status:", response.status);
      console.error("[Brevo] Resposta:", errorText);
      
      if (response.status === 401) {
        console.error("[Brevo] ⚠️ Erro 401: API Key inválida ou expirada");
      } else if (response.status === 403) {
        console.error("[Brevo] ⚠️ Erro 403: Acesso negado");
      }
      
      return false;
    }
  } catch (error) {
    console.error("[Brevo] ❌ Exceção ao testar conexão:", error);
    return false;
  }
}

/**
 * Testa a conexão com o Mailgun
 * 
 * @returns Promise<boolean> - true se conectado com sucesso, false caso contrário
 */
async function testMailgunConnection(): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;

    // Validar credenciais
    if (!apiKey || !domain) {
      console.error("[Mailgun] ❌ Credenciais não configuradas");
      return false;
    }

    console.log("[Mailgun] 🔍 Testando conexão com Mailgun...");
    console.log("[Mailgun] Domínio:", domain);

    const authString = `api:${apiKey}`;
    const encodedAuth = Buffer.from(authString).toString("base64");

    const response = await fetch(`https://api.mailgun.net/v3/${domain}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${encodedAuth}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log("[Mailgun] ✅ Conexão Mailgun verificada com sucesso!");
      console.log("[Mailgun] Dados do domínio:", data);
      return true;
    } else {
      const errorText = await response.text();
      console.error("[Mailgun] ❌ Erro ao verificar conexão");
      console.error("[Mailgun] Status:", response.status);
      console.error("[Mailgun] Resposta:", errorText);
      
      if (response.status === 401) {
        console.error("[Mailgun] ⚠️ Erro 401: API Key inválida ou expirada");
      } else if (response.status === 404) {
        console.error("[Mailgun] ⚠️ Erro 404: Domínio não encontrado");
      } else if (response.status === 403) {
        console.error("[Mailgun] ⚠️ Erro 403: Acesso negado");
      }
      
      return false;
    }
  } catch (error) {
    console.error("[Mailgun] ❌ Exceção ao testar conexão:", error);
    if (error instanceof Error) {
      console.error("[Mailgun] Mensagem:", error.message);
    }
    return false;
  }
}

/**
 * Testa a conexão com todos os provedores de email
 * 
 * @returns Promise<boolean> - true se pelo menos um está conectado
 */
export async function testEmailConnection(): Promise<boolean> {
  try {
    console.log("[Email] 🧪 Iniciando testes de conexão...");
    console.log("[Email] 📋 Ordem de prioridade: Brevo (principal) → Mailgun (fallback)");
    
    const brevoOk = await testBrevoConnection();
    const mailgunOk = await testMailgunConnection();

    console.log("[Email] 📊 Resultado dos testes:");
    console.log("[Email]   - Brevo (principal):", brevoOk ? "✅ OK" : "❌ Falhou");
    console.log("[Email]   - Mailgun (fallback):", mailgunOk ? "✅ OK" : "❌ Falhou");

    if (brevoOk || mailgunOk) {
      console.log("[Email] ✅ Pelo menos um provedor está funcionando!");
      return true;
    } else {
      console.error("[Email] ❌ Nenhum provedor de email está funcionando!");
      return false;
    }
  } catch (error) {
    console.error("[Email] ❌ Exceção ao testar conexões:", error);
    return false;
  }
}

/**
 * Valida um endereço de email
 * 
 * @param email - Endereço de email a validar
 * @returns boolean - true se válido, false caso contrário
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Envia um email de teste para validar configuração
 * 
 * @param testEmail - Email para enviar o teste
 * @returns Promise<boolean> - true se enviado com sucesso
 */
export async function sendTestEmail(testEmail: string): Promise<boolean> {
  if (!validateEmail(testEmail)) {
    console.error("[Email] ❌ Email de teste inválido:", testEmail);
    return false;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #FF0000; color: white; padding: 20px; border-radius: 5px; }
          .content { padding: 20px; background-color: #f5f5f5; margin-top: 20px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Test Email</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>This is a test email to validate your email system configuration.</p>
            <p><strong>If you received this email, the integration is working correctly!</strong></p>
            <hr>
            <p>Test information:</p>
            <ul>
              <li>Date/Time: ${new Date().toLocaleString('en-US')}</li>
              <li>Configured providers:</li>
              <ul>
                <li>1. Brevo (primary)</li>
                <li>2. Mailgun (fallback)</li>
              </ul>
              <li>Status: ✅ Sent successfully</li>
            </ul>
            <p>Best regards,<br>TubeTools Team</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: testEmail,
    subject: "✅ Test Email - TubeTools",
    html: htmlContent,
  });
}
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
 * Envia um email usando Brevo como provedor único.
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
    
    // Enviar com Brevo
    return await sendWithBrevo(processedOptions);

  } catch (error) {
    console.error("[Email] ❌ Exceção geral ao enviar email:", error);
    return false;
  }
}

/**
 * Envia um email usando a API da Brevo.
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
 * Testa a conexão com o provedor de email
 * 
 * @returns Promise<boolean> - true se conectado com sucesso
 */
export async function testEmailConnection(): Promise<boolean> {
  try {
    console.log("[Email] 🧪 Iniciando teste de conexão...");
    console.log("[Email] 📋 Provedor: Brevo");
    
    const brevoOk = await testBrevoConnection();

    console.log("[Email] 📊 Resultado do teste:");
    console.log("[Email]   - Brevo:", brevoOk ? "✅ OK" : "❌ Falhou");

    return brevoOk;
  } catch (error) {
    console.error("[Email] ❌ Exceção ao testar conexão:", error);
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
              <li>Provider: Brevo</li>
              <li>Sender: noreply@tubetoolsup.uk</li>
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
import { Resend } from 'resend';

// Resend client
const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@tubetoolsup.uk';
const resendFromName = process.env.RESEND_FROM_NAME || 'TubeTools';

let resendClient: Resend | null = null;

if (resendApiKey) {
  resendClient = new Resend(resendApiKey);
  console.log('[Resend] ✅ Cliente inicializado');
} else {
  console.warn('[Resend] ⚠️ RESEND_API_KEY não configurada');
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send email using Resend
 */
async function sendWithResend(options: EmailOptions): Promise<boolean> {
  if (!resendClient) {
    console.error('[Resend] ❌ Cliente não inicializado');
    return false;
  }

  try {
    console.log(`[Resend] 📤 Enviando email para: ${options.to}`);
    console.log(`[Resend] 📧 Assunto: ${options.subject}`);
    console.log(`[Resend] 👤 De: ${resendFromEmail}`);

    const { data, error } = await resendClient.emails.send({
      from: `${resendFromName} <${resendFromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      console.error('[Resend] ❌ Erro ao enviar email');
      console.error('[Resend] Erro:', error);
      return false;
    }

    console.log(`[Resend] ✅ Email enviado com sucesso! ID: ${data?.id}`);
    return true;
  } catch (error: any) {
    console.error('[Resend] ❌ Erro ao enviar email');
    console.error('[Resend] Erro:', error.message || error);
    return false;
  }
}

/**
 * Main function to send email
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  console.log(`[Email] Iniciando envio para: ${options.to}`);
  
  // Try Resend
  const success = await sendWithResend(options);
  
  if (success) {
    console.log(`[Email] ✅ Email enviado com sucesso para: ${options.to}`);
  } else {
    console.error(`[Email] ❌ Falha ao enviar email para: ${options.to}`);
  }
  
  return success;
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  const subject = 'Welcome to TubeTools!';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Welcome to TubeTools!</h1>
      <p>Hi ${name},</p>
      <p>Thank you for joining TubeTools. We're excited to have you on board!</p>
      <p>Get started by exploring our platform and discovering all the features we have to offer.</p>
      <br>
      <p>Best regards,</p>
      <p>The TubeTools Team</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">Watch. Rate. Participate.</p>
    </div>
  `;
  
  return sendEmail({ to, subject, html });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<boolean> {
  const subject = 'Reset Your Password';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Password Reset Request</h1>
      <p>You requested to reset your password. Click the button below to proceed:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Reset Password</a>
      </p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p>This link will expire in 24 hours.</p>
      <br>
      <p>Best regards,</p>
      <p>The TubeTools Team</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">Watch. Rate. Participate.</p>
    </div>
  `;
  
  return sendEmail({ to, subject, html });
}

/**
 * Check if email service is configured
 */
export function isEmailServiceConfigured(): boolean {
  return !!resendClient;
}
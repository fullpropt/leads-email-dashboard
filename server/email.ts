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
 * Envia um email usando Hostinger SMTP.
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
    
    // Enviar com Hostinger
    return await sendWithHostinger(processedOptions);

  } catch (error) {
    console.error("[Email] ❌ Exceção geral ao enviar email:", error);
    return false;
  }
}

/**
 * Envia um email usando SMTP da Hostinger.
 * Usa nodemailer para conexão SMTP segura com SSL.
 * 
 * Configuração padrão:
 * - Host: smtp.hostinger.com
 * - Porta: 465 (SSL)
 * - Email: noreply@tubetoolsup.uk
 */
async function sendWithHostinger(options: SendEmailOptions): Promise<boolean> {
  try {
    const smtpHost = process.env.HOSTINGER_SMTP_HOST || "smtp.hostinger.com";
    const smtpPort = parseInt(process.env.HOSTINGER_SMTP_PORT || "465");
    const smtpUser = process.env.HOSTINGER_SMTP_USER || "noreply@tubetoolsup.uk";
    const smtpPass = process.env.HOSTINGER_SMTP_PASS;
    const fromEmail = process.env.HOSTINGER_FROM_EMAIL || smtpUser;
    const fromName = process.env.HOSTINGER_FROM_NAME || "TubeTools";

    // Validar credenciais
    if (!smtpPass) {
      console.error("[Hostinger] ❌ Senha SMTP não configurada");
      console.error("[Hostinger] ⚠️ Configure a variável de ambiente HOSTINGER_SMTP_PASS");
      return false;
    }

    console.log("[Hostinger] 📤 Enviando email para:", options.to);
    console.log("[Hostinger] 📧 Assunto:", options.subject);
    console.log("[Hostinger] 🔐 Servidor:", smtpHost + ":" + smtpPort);
    console.log("[Hostinger] 👤 De:", fromEmail);

    // Criar transporter do nodemailer
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false, // true para 465 (SSL), false para 587 (TLS)
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false, // Aceitar certificados auto-assinados se necessário
      },
    });

    // Enviar email
    const info = await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    console.log("[Hostinger] ✅ Email enviado com sucesso!");
    console.log("[Hostinger] ID da mensagem:", info.messageId);
    
    return true;

  } catch (error) {
    console.error("[Hostinger] ❌ Exceção ao enviar email:");
    console.error("[Hostinger] Erro:", error);
    if (error instanceof Error) {
      console.error("[Hostinger] Mensagem:", error.message);
      console.error("[Hostinger] Stack:", error.stack);
    }
    return false;
  }
}

/**
 * Testa a conexão SMTP com a Hostinger
 * 
 * @returns Promise<boolean> - true se conectado com sucesso, false caso contrário
 */
async function testHostingerConnection(): Promise<boolean> {
  try {
    const smtpHost = process.env.HOSTINGER_SMTP_HOST || "smtp.hostinger.com";
    const smtpPort = parseInt(process.env.HOSTINGER_SMTP_PORT || "465");
    const smtpUser = process.env.HOSTINGER_SMTP_USER || "noreply@tubetoolsup.uk";
    const smtpPass = process.env.HOSTINGER_SMTP_PASS;

    if (!smtpPass) {
      console.error("[Hostinger] ❌ Senha SMTP não configurada para teste");
      return false;
    }

    console.log("[Hostinger] 🔍 Testando conexão SMTP...");
    console.log("[Hostinger] Servidor:", smtpHost + ":" + smtpPort);

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Verificar conexão
    await transporter.verify();
    
    console.log("[Hostinger] ✅ Conexão SMTP verificada com sucesso!");
    return true;

  } catch (error) {
    console.error("[Hostinger] ❌ Erro ao verificar conexão SMTP:");
    console.error("[Hostinger] Erro:", error);
    if (error instanceof Error) {
      console.error("[Hostinger] Mensagem:", error.message);
    }
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
    console.log("[Email] 📋 Provedor: Hostinger SMTP");
    
    const hostingerOk = await testHostingerConnection();

    console.log("[Email] 📊 Resultado do teste:");
    console.log("[Email]   - Hostinger SMTP:", hostingerOk ? "✅ OK" : "❌ Falhou");

    return hostingerOk;
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
              <li>Provider: Hostinger SMTP</li>
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

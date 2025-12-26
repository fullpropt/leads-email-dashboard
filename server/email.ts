export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Envia um email através do Mailgun
 * 
 * @param options - Opções do email (destinatário, assunto, conteúdo HTML)
 * @returns Promise<boolean> - true se enviado com sucesso, false caso contrário
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;

    // Validar credenciais
    if (!apiKey || !domain) {
      console.error("[Email] ❌ Credenciais do Mailgun não configuradas");
      console.error("[Email] MAILGUN_API_KEY:", apiKey ? "✓ Configurado" : "✗ Faltando");
      console.error("[Email] MAILGUN_DOMAIN:", domain ? "✓ Configurado" : "✗ Faltando");
      return false;
    }

    // Criar FormData com os dados do email
    const form = new FormData();
    form.append("from", `TubeTools <contato@mail.youtbviews.online>`);
    form.append("to", options.to);
    form.append("subject", options.subject);
    form.append("html", options.html);

    // Criar header de autenticação Basic Auth
    const authString = `api:${apiKey}`;
    const encodedAuth = Buffer.from(authString).toString("base64");

    console.log("[Email] 📤 Enviando email para:", options.to);
    console.log("[Email] 📧 Assunto:", options.subject);
    console.log("[Email] 🔐 Domínio:", domain);

    // Fazer requisição para API do Mailgun
    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodedAuth}`,
      },
      body: form,
    });

    // Verificar resposta
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Email] ❌ Erro ao enviar email");
      console.error("[Email] Status:", response.status);
      console.error("[Email] Resposta:", errorText);
      
      // Tentar parsear como JSON
      try {
        const errorJson = JSON.parse(errorText);
        console.error("[Email] Erro detalhado:", errorJson);
      } catch (e) {
        // Não é JSON, ignorar
      }
      
      return false;
    }

    // Parsear resposta bem-sucedida
    const result = await response.json();
    console.log("[Email] ✅ Email enviado com sucesso!");
    console.log("[Email] ID da mensagem:", result.id);
    console.log("[Email] Resposta:", result);
    
    return true;
  } catch (error) {
    console.error("[Email] ❌ Exceção ao enviar email:");
    console.error("[Email] Erro:", error);
    if (error instanceof Error) {
      console.error("[Email] Mensagem:", error.message);
      console.error("[Email] Stack:", error.stack);
    }
    return false;
  }
}

/**
 * Testa a conexão com o Mailgun
 * 
 * @returns Promise<boolean> - true se conectado com sucesso, false caso contrário
 */
export async function testEmailConnection(): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;

    // Validar credenciais
    if (!apiKey || !domain) {
      console.error("[Email] ❌ Credenciais do Mailgun não configuradas");
      return false;
    }

    console.log("[Email] 🔍 Testando conexão com Mailgun...");
    console.log("[Email] Domínio:", domain);

    // Criar header de autenticação
    const authString = `api:${apiKey}`;
    const encodedAuth = Buffer.from(authString).toString("base64");

    // Fazer requisição GET para verificar domínio
    const response = await fetch(`https://api.mailgun.net/v3/${domain}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${encodedAuth}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log("[Email] ✅ Conexão Mailgun verificada com sucesso!");
      console.log("[Email] Dados do domínio:", data);
      return true;
    } else {
      const errorText = await response.text();
      console.error("[Email] ❌ Erro ao verificar conexão Mailgun");
      console.error("[Email] Status:", response.status);
      console.error("[Email] Resposta:", errorText);
      
      // Mensagens de erro comuns
      if (response.status === 401) {
        console.error("[Email] ⚠️ Erro 401: API Key inválida ou expirada");
      } else if (response.status === 404) {
        console.error("[Email] ⚠️ Erro 404: Domínio não encontrado");
      } else if (response.status === 403) {
        console.error("[Email] ⚠️ Erro 403: Acesso negado");
      }
      
      return false;
    }
  } catch (error) {
    console.error("[Email] ❌ Exceção ao testar conexão:");
    console.error("[Email] Erro:", error);
    if (error instanceof Error) {
      console.error("[Email] Mensagem:", error.message);
    }
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
          .header { background-color: #007bff; color: white; padding: 20px; border-radius: 5px; }
          .content { padding: 20px; background-color: #f5f5f5; margin-top: 20px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Email de Teste</h1>
          </div>
          <div class="content">
            <p>Olá,</p>
            <p>Este é um email de teste para validar a configuração do Mailgun.</p>
            <p><strong>Se você recebeu este email, a integração está funcionando corretamente!</strong></p>
            <hr>
            <p>Informações do teste:</p>
            <ul>
              <li>Data/Hora: ${new Date().toLocaleString('pt-BR')}</li>
              <li>Domínio: ${process.env.MAILGUN_DOMAIN}</li>
              <li>Status: ✅ Enviado com sucesso</li>
            </ul>
            <p>Atenciosamente,<br>Sistema de Dashboard de Leads</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: testEmail,
    subject: "✅ Email de Teste - Dashboard de Leads",
    html: htmlContent,
  });
}

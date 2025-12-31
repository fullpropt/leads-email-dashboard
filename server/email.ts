export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Envia um email usando Mailrelay como provedor principal e Mailgun como fallback.
 * Automaticamente envolve o conteúdo com header e rodapé padrão TubeTools.
 * 
 * @param options - Opções do email (destinatário, assunto, conteúdo HTML)
 * @returns Promise<boolean> - true se enviado com sucesso, false caso contrário
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  try {
    // Processar HTML com header e rodapé padrão
    const { processEmailTemplate } = await import("./emailTemplate");
    const processedHtml = processEmailTemplate(options.html);
    
    // Criar opções com HTML processado
    const processedOptions = {
      ...options,
      html: processedHtml
    };
    
    // Tenta enviar com Mailrelay primeiro
    const mailrelaySuccess = await sendWithMailrelay(processedOptions);
    if (mailrelaySuccess) {
      return true;
    }

    // Se Mailrelay falhar, tenta com Mailgun
    console.warn("[Email] ⚠️ Mailrelay falhou, tentando com Mailgun...");
    const mailgunSuccess = await sendWithMailgun(processedOptions);
    return mailgunSuccess;

  } catch (error) {
    console.error("[Email] ❌ Exceção geral ao enviar email:", error);
    return false;
  }
}

/**
 * Envia um email usando a API da Mailrelay.
 */
async function sendWithMailrelay(options: SendEmailOptions): Promise<boolean> {
  try {
    // ✅ CORREÇÃO: Usar variáveis de ambiente em vez de hardcoded
    const apiKey = process.env.MAILRELAY_API_KEY;
    const apiUrl = process.env.MAILRELAY_API_URL || "https://youtdvsupport.ipzmarketing.com/api/v1/send_emails";
    const fromEmail = process.env.MAILRELAY_FROM_EMAIL || "noreply@youtdvsupport.online";
    const fromName = process.env.MAILRELAY_FROM_NAME || "TubeTools Support";

    // Validar credenciais
    if (!apiKey) {
      console.error("[Mailrelay] ❌ API Key não configurada");
      console.error("[Mailrelay] ⚠️ Configure a variável de ambiente MAILRELAY_API_KEY");
      return false;
    }

    console.log("[Mailrelay] 📤 Enviando email para:", options.to);
    console.log("[Mailrelay] 📧 Assunto:", options.subject);
    console.log("[Mailrelay] 👤 De:", fromEmail);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-TOKEN": apiKey,
      },
      body: JSON.stringify({
        from: {
          email: fromEmail,
          name: fromName,
        },
        to: [{ email: options.to }],
        subject: options.subject,
        html_part: options.html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Mailrelay] ❌ Erro ao enviar email");
      console.error("[Mailrelay] Status:", response.status);
      console.error("[Mailrelay] Resposta:", errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.error("[Mailrelay] Erro detalhado:", errorJson);
        
        // ✅ CORREÇÃO: Adicionar mensagens de erro específicas
        if (response.status === 422) {
          if (errorJson.errors?.from) {
            console.error("[Mailrelay] ⚠️ AVISO: Email remetente não confirmado!");
            console.error("[Mailrelay] ⚠️ Confirme o email no painel do Mailrelay: https://app.mailrelay.com");
          }
        } else if (response.status === 401) {
          console.error("[Mailrelay] ⚠️ Erro 401: API Key inválida ou expirada");
        } else if (response.status === 403) {
          console.error("[Mailrelay] ⚠️ Erro 403: Acesso negado");
        }
      } catch (e) {
        // Não é JSON, ignorar
      }
      
      return false;
    }

    const result = await response.json();
    console.log("[Mailrelay] ✅ Email enviado com sucesso!");
    console.log("[Mailrelay] Resposta:", result);
    
    return true;

  } catch (error) {
    console.error("[Mailrelay] ❌ Exceção ao enviar email:");
    console.error("[Mailrelay] Erro:", error);
    if (error instanceof Error) {
      console.error("[Mailrelay] Mensagem:", error.message);
      console.error("[Mailrelay] Stack:", error.stack);
    }
    return false;
  }
}

/**
 * Envia um email usando a API do Mailgun.
 */
async function sendWithMailgun(options: SendEmailOptions): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    const fromEmail = process.env.MAILGUN_FROM_EMAIL || "contato@mail.youtbviews.online";

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
    console.log("[Mailgun] Resposta:", result);
    
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
 * Testa a conexão com o Mailrelay
 * 
 * @returns Promise<boolean> - true se conectado com sucesso, false caso contrário
 */
async function testMailrelayConnection(): Promise<boolean> {
  try {
    // ✅ CORREÇÃO: Usar variáveis de ambiente
    const apiKey = process.env.MAILRELAY_API_KEY;
    const account = process.env.MAILRELAY_ACCOUNT || "tubetools";
    const apiUrl = `https://app.${account}.mailrelay.com/api/v1/groups`;

    if (!apiKey) {
      console.error("[Mailrelay] ❌ API Key não configurada para teste");
      return false;
    }

    console.log("[Mailrelay] 🔍 Testando conexão com Mailrelay...");

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "X-AUTH-TOKEN": apiKey,
      },
    });

    if (response.ok) {
      console.log("[Mailrelay] ✅ Conexão Mailrelay verificada com sucesso!");
      return true;
    } else {
      const errorText = await response.text();
      console.error("[Mailrelay] ❌ Erro ao verificar conexão");
      console.error("[Mailrelay] Status:", response.status);
      console.error("[Mailrelay] Resposta:", errorText);
      
      if (response.status === 401) {
        console.error("[Mailrelay] ⚠️ Erro 401: API Key inválida ou expirada");
      } else if (response.status === 404) {
        console.error("[Mailrelay] ⚠️ Erro 404: Conta não encontrada");
      }
      
      return false;
    }
  } catch (error) {
    console.error("[Mailrelay] ❌ Exceção ao testar conexão:", error);
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
 * Testa a conexão com ambos os provedores de email
 * 
 * @returns Promise<boolean> - true se pelo menos um está conectado
 */
export async function testEmailConnection(): Promise<boolean> {
  try {
    console.log("[Email] 🧪 Iniciando testes de conexão...");
    
    const mailrelayOk = await testMailrelayConnection();
    const mailgunOk = await testMailgunConnection();

    if (mailrelayOk || mailgunOk) {
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
            <p>Este é um email de teste para validar a configuração do seu sistema de emails.</p>
            <p><strong>Se você recebeu este email, a integração está funcionando corretamente!</strong></p>
            <hr>
            <p>Informações do teste:</p>
            <ul>
              <li>Data/Hora: ${new Date().toLocaleString('pt-BR')}</li>
              <li>Provedores: Mailrelay (principal) + Mailgun (fallback)</li>
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

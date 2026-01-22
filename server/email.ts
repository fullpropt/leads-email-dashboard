export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Envia um email usando Mailgun como provedor principal, 
 * com fallback para Mailgun2, Mailgun3 e depois Brevo.
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
    
    // 1. Tenta enviar com Mailgun primeiro (provedor principal)
    const mailgunSuccess = await sendWithMailgun(processedOptions);
    if (mailgunSuccess) {
      return true;
    }

    // 2. Se Mailgun falhar, tenta com Mailgun2 como primeiro fallback
    console.warn("[Email] ⚠️ Mailgun falhou, tentando com Mailgun2...");
    const mailgun2Success = await sendWithMailgun2(processedOptions);
    if (mailgun2Success) {
      return true;
    }

    // 3. Se Mailgun2 falhar, tenta com Mailgun3 como segundo fallback
    console.warn("[Email] ⚠️ Mailgun2 falhou, tentando com Mailgun3...");
    const mailgun3Success = await sendWithMailgun3(processedOptions);
    if (mailgun3Success) {
      return true;
    }

    // 4. Se Mailgun3 também falhar, tenta com Brevo como último fallback
    console.warn("[Email] ⚠️ Mailgun3 falhou, tentando com Brevo...");
    const brevoSuccess = await sendWithBrevo(processedOptions);
    return brevoSuccess;

  } catch (error) {
    console.error("[Email] ❌ Exceção geral ao enviar email:", error);
    return false;
  }
}

/**
 * Envia um email usando a API do Mailgun (provedor principal).
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
 * Envia um email usando a API do Mailgun2 (primeiro fallback).
 * Usa uma segunda conta Mailgun com domínio diferente.
 */
async function sendWithMailgun2(options: SendEmailOptions): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN2_API_KEY;
    const domain = process.env.MAILGUN2_DOMAIN;
    const fromEmail = process.env.MAILGUN2_FROM_EMAIL || "noreply@mail.youtbvsupport.online";

    // Validar credenciais
    if (!apiKey || !domain) {
      console.error("[Mailgun2] ❌ Credenciais não configuradas");
      console.error("[Mailgun2] MAILGUN2_API_KEY:", apiKey ? "✓ Configurado" : "✗ Faltando");
      console.error("[Mailgun2] MAILGUN2_DOMAIN:", domain ? "✓ Configurado" : "✗ Faltando");
      return false;
    }

    const form = new FormData();
    form.append("from", `TubeTools <${fromEmail}>`);
    form.append("to", options.to);
    form.append("subject", options.subject);
    form.append("html", options.html);

    const authString = `api:${apiKey}`;
    const encodedAuth = Buffer.from(authString).toString("base64");

    console.log("[Mailgun2] 📤 Enviando email para:", options.to);
    console.log("[Mailgun2] 📧 Assunto:", options.subject);
    console.log("[Mailgun2] 🔐 Domínio:", domain);

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodedAuth}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Mailgun2] ❌ Erro ao enviar email");
      console.error("[Mailgun2] Status:", response.status);
      console.error("[Mailgun2] Resposta:", errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.error("[Mailgun2] Erro detalhado:", errorJson);
      } catch (e) {
        // Não é JSON, ignorar
      }
      
      return false;
    }

    const result = await response.json();
    console.log("[Mailgun2] ✅ Email enviado com sucesso!");
    console.log("[Mailgun2] ID da mensagem:", result.id);
    
    return true;

  } catch (error) {
    console.error("[Mailgun2] ❌ Exceção ao enviar email:");
    console.error("[Mailgun2] Erro:", error);
    if (error instanceof Error) {
      console.error("[Mailgun2] Mensagem:", error.message);
      console.error("[Mailgun2] Stack:", error.stack);
    }
    return false;
  }
}

/**
 * Envia um email usando a API do Mailgun3 (segundo fallback).
 * Usa uma terceira conta Mailgun com domínio diferente.
 */
async function sendWithMailgun3(options: SendEmailOptions): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN3_API_KEY;
    const domain = process.env.MAILGUN3_DOMAIN;
    const fromEmail = process.env.MAILGUN3_FROM_EMAIL || "noreply@mail.youtbsupport.online";

    // Validar credenciais
    if (!apiKey || !domain) {
      console.error("[Mailgun3] ❌ Credenciais não configuradas");
      console.error("[Mailgun3] MAILGUN3_API_KEY:", apiKey ? "✓ Configurado" : "✗ Faltando");
      console.error("[Mailgun3] MAILGUN3_DOMAIN:", domain ? "✓ Configurado" : "✗ Faltando");
      return false;
    }

    const form = new FormData();
    form.append("from", `TubeTools <${fromEmail}>`);
    form.append("to", options.to);
    form.append("subject", options.subject);
    form.append("html", options.html);

    const authString = `api:${apiKey}`;
    const encodedAuth = Buffer.from(authString).toString("base64");

    console.log("[Mailgun3] 📤 Enviando email para:", options.to);
    console.log("[Mailgun3] 📧 Assunto:", options.subject);
    console.log("[Mailgun3] 🔐 Domínio:", domain);

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodedAuth}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Mailgun3] ❌ Erro ao enviar email");
      console.error("[Mailgun3] Status:", response.status);
      console.error("[Mailgun3] Resposta:", errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.error("[Mailgun3] Erro detalhado:", errorJson);
      } catch (e) {
        // Não é JSON, ignorar
      }
      
      return false;
    }

    const result = await response.json();
    console.log("[Mailgun3] ✅ Email enviado com sucesso!");
    console.log("[Mailgun3] ID da mensagem:", result.id);
    
    return true;

  } catch (error) {
    console.error("[Mailgun3] ❌ Exceção ao enviar email:");
    console.error("[Mailgun3] Erro:", error);
    if (error instanceof Error) {
      console.error("[Mailgun3] Mensagem:", error.message);
      console.error("[Mailgun3] Stack:", error.stack);
    }
    return false;
  }
}

/**
 * Envia um email usando a API da Brevo (terceiro fallback).
 * Usa a API REST em vez de SMTP para melhor performance e funcionalidades.
 */
async function sendWithBrevo(options: SendEmailOptions): Promise<boolean> {
  try {
    // Usar variáveis de ambiente
    const apiKey = process.env.BREVO_API_KEY;
    const fromEmail = process.env.BREVO_FROM_EMAIL || "noreply@youtdvsupport.online";
    const fromName = process.env.BREVO_FROM_NAME || "TubeTools Support";

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
      tags: ["transactional", "dashboard"],
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
 * Testa a conexão com o Mailgun2
 * 
 * @returns Promise<boolean> - true se conectado com sucesso, false caso contrário
 */
async function testMailgun2Connection(): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN2_API_KEY;
    const domain = process.env.MAILGUN2_DOMAIN;

    // Validar credenciais
    if (!apiKey || !domain) {
      console.error("[Mailgun2] ❌ Credenciais não configuradas");
      return false;
    }

    console.log("[Mailgun2] 🔍 Testando conexão com Mailgun2...");
    console.log("[Mailgun2] Domínio:", domain);

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
      console.log("[Mailgun2] ✅ Conexão Mailgun2 verificada com sucesso!");
      console.log("[Mailgun2] Dados do domínio:", data);
      return true;
    } else {
      const errorText = await response.text();
      console.error("[Mailgun2] ❌ Erro ao verificar conexão");
      console.error("[Mailgun2] Status:", response.status);
      console.error("[Mailgun2] Resposta:", errorText);
      
      if (response.status === 401) {
        console.error("[Mailgun2] ⚠️ Erro 401: API Key inválida ou expirada");
      } else if (response.status === 404) {
        console.error("[Mailgun2] ⚠️ Erro 404: Domínio não encontrado");
      } else if (response.status === 403) {
        console.error("[Mailgun2] ⚠️ Erro 403: Acesso negado");
      }
      
      return false;
    }
  } catch (error) {
    console.error("[Mailgun2] ❌ Exceção ao testar conexão:", error);
    if (error instanceof Error) {
      console.error("[Mailgun2] Mensagem:", error.message);
    }
    return false;
  }
}

/**
 * Testa a conexão com o Mailgun3
 * 
 * @returns Promise<boolean> - true se conectado com sucesso, false caso contrário
 */
async function testMailgun3Connection(): Promise<boolean> {
  try {
    const apiKey = process.env.MAILGUN3_API_KEY;
    const domain = process.env.MAILGUN3_DOMAIN;

    // Validar credenciais
    if (!apiKey || !domain) {
      console.error("[Mailgun3] ❌ Credenciais não configuradas");
      return false;
    }

    console.log("[Mailgun3] 🔍 Testando conexão com Mailgun3...");
    console.log("[Mailgun3] Domínio:", domain);

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
      console.log("[Mailgun3] ✅ Conexão Mailgun3 verificada com sucesso!");
      console.log("[Mailgun3] Dados do domínio:", data);
      return true;
    } else {
      const errorText = await response.text();
      console.error("[Mailgun3] ❌ Erro ao verificar conexão");
      console.error("[Mailgun3] Status:", response.status);
      console.error("[Mailgun3] Resposta:", errorText);
      
      if (response.status === 401) {
        console.error("[Mailgun3] ⚠️ Erro 401: API Key inválida ou expirada");
      } else if (response.status === 404) {
        console.error("[Mailgun3] ⚠️ Erro 404: Domínio não encontrado");
      } else if (response.status === 403) {
        console.error("[Mailgun3] ⚠️ Erro 403: Acesso negado");
      }
      
      return false;
    }
  } catch (error) {
    console.error("[Mailgun3] ❌ Exceção ao testar conexão:", error);
    if (error instanceof Error) {
      console.error("[Mailgun3] Mensagem:", error.message);
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
    console.log("[Email] 📋 Ordem de prioridade: Mailgun → Mailgun2 → Mailgun3 → Brevo");
    
    const mailgunOk = await testMailgunConnection();
    const mailgun2Ok = await testMailgun2Connection();
    const mailgun3Ok = await testMailgun3Connection();
    const brevoOk = await testBrevoConnection();

    console.log("[Email] 📊 Resultado dos testes:");
    console.log("[Email]   - Mailgun (principal):", mailgunOk ? "✅ OK" : "❌ Falhou");
    console.log("[Email]   - Mailgun2 (fallback 1):", mailgun2Ok ? "✅ OK" : "❌ Falhou");
    console.log("[Email]   - Mailgun3 (fallback 2):", mailgun3Ok ? "✅ OK" : "❌ Falhou");
    console.log("[Email]   - Brevo (fallback 3):", brevoOk ? "✅ OK" : "❌ Falhou");

    if (mailgunOk || mailgun2Ok || mailgun3Ok || brevoOk) {
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
              <li>Provedores configurados:</li>
              <ul>
                <li>1. Mailgun (principal)</li>
                <li>2. Mailgun2 (fallback 1)</li>
                <li>3. Mailgun3 (fallback 2)</li>
                <li>4. Brevo (fallback 3)</li>
              </ul>
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

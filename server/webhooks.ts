import { InsertLead } from "../drizzle/schema_postgresql";

/**
 * Processa webhooks recebidos do PerfectPay
 * Esperado receber um payload com informações de transação aprovada
 */
export async function processWebhook(payload: any) {
  try {
    console.log("[Webhook] Processando payload:", JSON.stringify(payload, null, 2));

    // Validar se o payload contém os dados necessários
    if (!payload) {
      console.warn("[Webhook] Payload vazio recebido");
      return {
        success: false,
        message: "Payload vazio",
      };
    }

    // Extrair dados do webhook do PerfectPay
    // O PerfectPay envia os dados do cliente dentro de um objeto "customer"
    const customer = payload.customer || {};
    const product = payload.product || {};
    const plan = payload.plan || {};
    
    const customer_name = customer.full_name;
    const customer_email = customer.email;
    const product_name = product.name;
    const plan_name = plan.name;
    const sale_value = payload.sale_amount;
    const transaction_id = payload.code;
    const status = payload.sale_status_enum_key; // PerfectPay usa "approved" como valor

    console.log(`[Webhook] Dados extraídos - Email: ${customer_email}, Nome: ${customer_name}, Status: ${status}`);

    // Validar campos obrigatórios
    if (!customer_email || !customer_name) {
      console.warn("[Webhook] Email ou nome do cliente não fornecido");
      console.warn(`[Webhook] Customer data: ${JSON.stringify(customer)}`);
      return {
        success: false,
        message: "Email e nome do cliente são obrigatórios",
      };
    }

    // Determinar o status do lead baseado no status da transação
    let leadStatus = "active"; // padrão: compra aprovada
    
    if (status === "precheckout") {
      leadStatus = "abandoned"; // carrinho abandonado
      console.log(`[Webhook] Carrinho abandonado detectado para ${customer_email}`);
    } else if (status && status !== "approved" && status !== "completed") {
      // Ignorar outros status que não são aprovados nem carrinho abandonado
      console.log(`[Webhook] Transação com status '${status}' ignorada`);
      return {
        success: true,
        message: `Transação com status '${status}' não processada`,
      };
    }

    // Preparar dados do lead para inserção no banco
    const leadData: InsertLead = {
      nome: customer_name,
      email: customer_email,
      produto: product_name || "Produto não especificado",
      plano: plan_name || "Plano não especificado",
      // Converter valor para centavos (se for string, remover símbolos)
      valor: convertValueToCents(sale_value),
      dataAprovacao: leadStatus === "active" ? new Date() : null, // Apenas para compras aprovadas
      dataCriacao: new Date(),
      emailEnviado: 0, // Marcar como não enviado para envio posterior
      status: leadStatus, // "active" ou "abandoned"
    };

    // Importar função de banco de dados dinamicamente
    const { getDb } = await import("./db");
    const { leads } = await import("../drizzle/schema_postgresql");
    const { eq } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) {
      console.error("[Webhook] Banco de dados não disponível");
      return {
        success: false,
        message: "Banco de dados não disponível",
      };
    }

    // Verificar se o lead já existe (por email)
    const existingLead = await db
      .select()
      .from(leads)
      .where(eq(leads.email, customer_email))
      .limit(1);

    if (existingLead.length > 0) {
      console.log(`[Webhook] Lead com email ${customer_email} já existe, atualizando...`);
      // Atualizar lead existente
      await db
        .update(leads)
        .set({
          nome: leadData.nome,
          produto: leadData.produto,
          plano: leadData.plano,
          valor: leadData.valor,
          dataAprovacao: leadData.dataAprovacao,
          status: leadData.status, // Atualizar status
        })
        .where(eq(leads.email, customer_email));
    } else {
      console.log(`[Webhook] Criando novo lead: ${customer_email}`);
      // Inserir novo lead
      await db.insert(leads).values(leadData);
    }

    // ===== NOVO: Verificar se o envio automático está ativado =====
    const { getAutoSendStatus, getTemplatesWithAutoSendOnLeadEnabled, updateLeadEmailStatus, replaceTemplateVariables } = await import("./db");
    const autoSendEnabled = await getAutoSendStatus();
    
    if (autoSendEnabled) {
      console.log(`[Webhook] Auto-envio ativado, buscando templates...`);
      const templatesWithAutoSend = await getTemplatesWithAutoSendOnLeadEnabled();
      
      if (templatesWithAutoSend.length > 0) {
        const { sendEmail } = await import("./email");
        
        for (const template of templatesWithAutoSend) {
          try {
            console.log(`[Webhook] Enviando template '${template.nome}' para ${customer_email}`);
            
            // Buscar o lead recém-criado para ter os dados atualizados
            const createdLead = await db
              .select()
              .from(leads)
              .where(eq(leads.email, customer_email))
              .limit(1);
            
            if (createdLead.length === 0) {
              console.error(`[Webhook] Lead não encontrado após criação: ${customer_email}`);
              continue;
            }
            
            const lead = createdLead[0];
            const htmlContent = replaceTemplateVariables(template.htmlContent, lead);
            
            const emailSent = await sendEmail({
              to: lead.email,
              subject: template.assunto,
              html: htmlContent,
            });
            
            if (emailSent) {
              await updateLeadEmailStatus(lead.id, true);
              console.log(`[Webhook] Email enviado automaticamente para ${customer_email}`);
            } else {
              console.error(`[Webhook] Falha ao enviar email para ${customer_email}`);
            }
          } catch (templateError) {
            console.error(`[Webhook] Erro ao processar template ${template.id}:`, templateError);
          }
        }
      } else {
        console.log(`[Webhook] Nenhum template com auto-envio ativado encontrado`);
      }
    } else {
      console.log(`[Webhook] Auto-envio desativado, email não será enviado automaticamente`);
    }

    console.log(`[Webhook] Lead processado com sucesso: ${customer_email}`);
    return {
      success: true,
      message: "Lead processado com sucesso",
      leadEmail: customer_email,
      transactionId: transaction_id,
    };
  } catch (error) {
    console.error("[Webhook] Erro ao processar webhook:", error);
    return {
      success: false,
      message: "Erro ao processar webhook",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Converte valor para centavos
 * Aceita formatos: "100.00", "100,00", "10000" (já em centavos), 100.00 (número)
 */
function convertValueToCents(value: any): number {
  if (!value) return 0;

  // Se já é um número
  if (typeof value === "number") {
    // Se for maior que 10000, assumir que já está em centavos
    if (value > 10000) return Math.round(value);
    // Caso contrário, converter para centavos
    return Math.round(value * 100);
  }

  // Se é string
  if (typeof value === "string") {
    // Remover símbolos de moeda
    let cleanValue = value.replace(/[R$\s]/g, "");

    // Converter vírgula para ponto
    cleanValue = cleanValue.replace(",", ".");

    const numValue = parseFloat(cleanValue);

    if (isNaN(numValue)) return 0;

    // Se for maior que 10000, assumir que já está em centavos
    if (numValue > 10000) return Math.round(numValue);

    // Caso contrário, converter para centavos
    return Math.round(numValue * 100);
  }

  return 0;
}

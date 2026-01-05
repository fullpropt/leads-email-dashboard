import { InsertLead } from "../drizzle/schema_postgresql";

/**
 * Processa webhooks recebidos do PerfectPay
 * Esperado receber um payload com informações de transação aprovada ou carrinho abandonado
 */
export async function processWebhook(payload: any) {
  try {
    console.log("[Webhook] ===== PAYLOAD COMPLETO RECEBIDO =====");
    console.log(JSON.stringify(payload, null, 2));
    console.log("[Webhook] ===== FIM DO PAYLOAD =====");

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
    
    // Log detalhado de campos de status
    console.log("[Webhook] ===== CAMPOS DE STATUS =====");
    console.log("[Webhook] sale_status_enum_key:", payload.sale_status_enum_key);
    console.log("[Webhook] status:", payload.status);
    console.log("[Webhook] order_status:", payload.order_status);
    console.log("[Webhook] checkout_status:", payload.checkout_status);
    console.log("[Webhook] transaction_status:", payload.transaction_status);
    console.log("[Webhook] ===== FIM DOS CAMPOS DE STATUS =====");
    
    // Tentar extrair status de múltiplos campos possíveis
    const status = payload.sale_status_enum_key || 
                   payload.status || 
                   payload.order_status || 
                   payload.checkout_status ||
                   payload.transaction_status;

    console.log(`[Webhook] Status final extraído: ${status}`);
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
    
    // Lista de status possíveis para carrinho abandonado
    const possibleAbandonedStatuses = [
      "precheckout",
      "abandoned",
      "cart_abandoned",
      "incomplete",
      "checkout_abandoned",
      "pending_payment",
      "awaiting_payment"
    ];
    
    // Lista de status para compra aprovada
    const possibleApprovedStatuses = [
      "approved",
      "completed",
      "success",
      "paid",
      "confirmed"
    ];
    
    if (possibleAbandonedStatuses.includes(status)) {
      leadStatus = "abandoned";
      console.log(`[Webhook] ✅ Carrinho abandonado detectado para ${customer_email} (status: ${status})`);
    } else if (possibleApprovedStatuses.includes(status)) {
      leadStatus = "active";
      console.log(`[Webhook] ✅ Compra aprovada detectada para ${customer_email} (status: ${status})`);
    } else {
      console.warn(`[Webhook] ⚠️ Status desconhecido recebido: '${status}'`);
      console.warn(`[Webhook] ⚠️ Lead não será processado. Verifique se este é um status esperado.`);
      return {
        success: true,
        message: `Status desconhecido: ${status}. Não processado.`,
        statusReceived: status,
      };
    }

    // Determinar o tipo de lead baseado no status
    let leadType = "compra_aprovada";
    if (leadStatus === "abandoned") {
      leadType = "carrinho_abandonado";
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
      leadType: leadType, // tipo de lead
      isNewLeadAfterUpdate: 1, // marcar como novo lead
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
          leadType: leadType, // atualizar tipo de lead
        })
        .where(eq(leads.email, customer_email));
      console.log(`[Webhook] ✅ Lead ${customer_email} atualizado com status: ${leadStatus}`);
    } else {
      console.log(`[Webhook] Criando novo lead: ${customer_email}`);
      // Inserir novo lead
      await db.insert(leads).values(leadData);
      console.log(`[Webhook] ✅ Novo lead ${customer_email} criado com status: ${leadStatus}`);
    }

    // ===== ENVIO AUTOMÁTICO: IMEDIATO E/OU ATRASADO =====
    const { getAutoSendStatus, getTemplatesByTypeAndSendType, updateLeadEmailStatus, replaceTemplateVariables } = await import("./db");
    const autoSendEnabled = await getAutoSendStatus();
    
    // Buscar o lead recém-criado para ter os dados atualizados
    const createdLead = await db
      .select()
      .from(leads)
      .where(eq(leads.email, customer_email))
      .limit(1);
    
    if (createdLead.length === 0) {
      console.error(`[Webhook] Lead não encontrado após criação: ${customer_email}`);
      console.log(`[Webhook] Lead processado com sucesso: ${customer_email}`);
      return {
        success: true,
        message: "Lead processado com sucesso",
        leadEmail: customer_email,
        transactionId: transaction_id,
        leadStatus: leadStatus,
      };
    }
    
    const lead = createdLead[0];
    
    // ===== ENVIO IMEDIATO =====
    if (autoSendEnabled) {
      console.log(`[Webhook] Auto-envio imediato ativado, buscando templates do tipo '${leadType}'...`);
      // Buscar templates de envio imediato do tipo de lead
      const templatesWithAutoSend = await getTemplatesByTypeAndSendType(leadType, "immediate");
      
      if (templatesWithAutoSend.length > 0) {
        const { sendEmail } = await import("./email");
        
        for (const template of templatesWithAutoSend) {
          try {
            console.log(`[Webhook] Enviando template '${template.nome}' para ${customer_email} (IMEDIATO)`);
            
            const htmlContent = replaceTemplateVariables(template.htmlContent, lead);
            
            const emailSent = await sendEmail({
              to: lead.email,
              subject: template.assunto,
              html: htmlContent,
            });
            
            if (emailSent) {
              await updateLeadEmailStatus(lead.id, true);
              console.log(`[Webhook] ✅ Email enviado automaticamente para ${customer_email}`);
            } else {
              console.error(`[Webhook] ❌ Falha ao enviar email para ${customer_email}`);
            }
          } catch (templateError) {
            console.error(`[Webhook] Erro ao processar template ${template.id}:`, templateError);
          }
        }
      } else {
        console.log(`[Webhook] Nenhum template de envio imediato do tipo '${leadType}' encontrado`);
      }
    } else {
      console.log(`[Webhook] Auto-envio imediato desativado`);
    }
    
    // ===== ENVIO ATRASADO =====
    console.log(`[Webhook] Verificando templates com envio atrasado do tipo '${leadType}'...`);
    const templatesWithDelayedSend = await getTemplatesByTypeAndSendType(leadType, "delayed");
    
    if (templatesWithDelayedSend.length > 0) {
      console.log(`[Webhook] Encontrados ${templatesWithDelayedSend.length} template(s) com envio atrasado`);
      
      // Usar o primeiro template com envio atrasado
      const template = templatesWithDelayedSend[0];
      const delayDays = template.delayDaysAfterLeadCreation || 0;
      
      console.log(`[Webhook] Agendando email para ${delayDays} dia(s) após criação do lead`);
      
      // Calcular e atualizar nextEmailSendAt baseado em dataCriacao do lead
      const nextSendDate = new Date(lead.dataCriacao);
      nextSendDate.setDate(nextSendDate.getDate() + delayDays);
      
      await db
        .update(leads)
        .set({ nextEmailSendAt: nextSendDate })
        .where(eq(leads.id, lead.id));
      
      console.log(`[Webhook] ✅ Email agendado para ${nextSendDate.toISOString()}`);
    } else {
      console.log(`[Webhook] Nenhum template com envio atrasado do tipo '${leadType}' encontrado`);
    }

    console.log(`[Webhook] ✅ Lead processado com sucesso: ${customer_email}`);
    return {
      success: true,
      message: "Lead processado com sucesso",
      leadEmail: customer_email,
      transactionId: transaction_id,
      leadStatus: leadStatus,
      leadType: leadType,
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
 * Converte um valor para centavos
 * @param value - Valor em reais (pode ser string ou número)
 * @returns Valor em centavos (inteiro)
 */
function convertValueToCents(value: any): number {
  if (!value) return 0;
  
  // Se for string, remover símbolos de moeda e converter
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,]/g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 100);
  }
  
  // Se for número, converter diretamente
  if (typeof value === "number") {
    return Math.round(value * 100);
  }
  
  return 0;
}

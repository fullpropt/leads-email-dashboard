import { InsertLead } from "../drizzle/schema_postgresql";

/**
 * Processa webhooks recebidos do PerfectPay
 * Esperado receber um payload com informações de transação aprovada ou carrinho abandonado
 * 
 * CORREÇÃO: Agora verifica se o lead é novo antes de enviar email automático
 * e também verifica o histórico de envios para evitar duplicações
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
    
    // Log detalhado de campos de status - CORRIGIDO para campos corretos do PerfectPay
    console.log("[Webhook] ===== CAMPOS DE STATUS =====");
    console.log("[Webhook] sale_status_enum:", payload.sale_status_enum);
    console.log("[Webhook] sale_status_detail:", payload.sale_status_detail);
    console.log("[Webhook] ===== FIM DOS CAMPOS DE STATUS =====");
    
    // Extrair status do webhook PerfectPay - CORRIGIDO
    const statusEnum = payload.sale_status_enum;
    const statusDetail = payload.sale_status_detail;

    console.log(`[Webhook] Status enum: ${statusEnum}, Status detail: ${statusDetail}`);
    console.log(`[Webhook] Dados extraídos - Email: ${customer_email}, Nome: ${customer_name}`);

    // Validar campos obrigatórios
    if (!customer_email || !customer_name) {
      console.warn("[Webhook] Email ou nome do cliente não fornecido");
      console.warn(`[Webhook] Customer data: ${JSON.stringify(customer)}`);
      return {
        success: false,
        message: "Email e nome do cliente são obrigatórios",
      };
    }

    // Determinar o status do lead baseado no sale_status_enum do PerfectPay
    // Códigos de status do PerfectPay:
    // 0 => 'none',
    // 1 => 'pending',        // boleto pendente
    // 2 => 'approved',       // venda aprovada boleto ou cartão
    // 3 => 'in_process',     // em revisão manual
    // 4 => 'in_mediation',   // em moderação
    // 5 => 'rejected',       // rejeitado
    // 6 => 'cancelled',      // cancelado do cartão
    // 7 => 'refunded',       // devolvido
    // 8 => 'authorized',     // autorizada
    // 9 => 'charged_back',   // solicitado charge back
    // 10 => 'completed',     // 30 dias após a venda aprovada
    // 11 => 'checkout_error',// erro durante checkout
    // 12 => 'precheckout',   // ABANDONO
    // 13 => 'expired',       // boleto expirado
    // 16 => 'in_review',     // em análise
    
    let leadStatus = "active"; // padrão: compra aprovada
    
    // Verificar por número (sale_status_enum) - CORRIGIDO
    if (statusEnum === 12) {
      leadStatus = "abandoned";
      console.log(`[Webhook] ✅ Carrinho abandonado detectado para ${customer_email} (sale_status_enum: ${statusEnum})`);
    } else if (statusEnum === 2 || statusEnum === 10 || statusEnum === 8) {
      leadStatus = "active";
      console.log(`[Webhook] ✅ Compra aprovada/autorizada detectada para ${customer_email} (sale_status_enum: ${statusEnum})`);
    } else if (statusEnum === 7 || statusEnum === 9 || statusEnum === 6) {
      console.log(`[Webhook] 💳 Chargeback/Reembolso/Cancelamento detectado para ${customer_email} (sale_status_enum: ${statusEnum})`);
      return {
        success: true,
        message: `Chargeback/Reembolso registrado: ${statusEnum}`,
        statusReceived: statusEnum,
        type: "chargeback",
      };
    } else if (statusEnum === 1 || statusEnum === 13) {
      // Pendente ou Expirado - não processar como lead
      console.log(`[Webhook] ⏳ Status pendente/expirado para ${customer_email} (sale_status_enum: ${statusEnum})`);
      return {
        success: true,
        message: `Status pendente/expirado: ${statusEnum}`,
        statusReceived: statusEnum,
        type: "pending",
      };
    } else {
      console.warn(`[Webhook] ⚠️ Status desconhecido recebido: sale_status_enum=${statusEnum}, sale_status_detail=${statusDetail}`);
      // Tentar processar mesmo assim baseado no statusDetail
      if (statusDetail && (statusDetail.includes("checkout") || statusDetail.includes("precheckout"))) {
        leadStatus = "abandoned";
        console.log(`[Webhook] ✅ Detectado como abandono pelo statusDetail: ${statusDetail}`);
      } else if (statusDetail && (statusDetail.includes("approved") || statusDetail.includes("completed"))) {
        leadStatus = "active";
        console.log(`[Webhook] ✅ Detectado como aprovado pelo statusDetail: ${statusDetail}`);
      } else {
        console.warn(`[Webhook] ⚠️ Lead não será processado.`);
        return {
          success: true,
          message: `Status desconhecido: ${statusEnum}. Não processado.`,
          statusReceived: statusEnum,
        };
      }
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
    const { leads, emailSendHistory } = await import("../drizzle/schema_postgresql");
    const { eq, and } = await import("drizzle-orm");

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

    // ===== CORREÇÃO: Guardar se é um lead novo =====
    const isNewLead = existingLead.length === 0;

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
    const { getAutoSendStatus, getTemplatesForAutoSend, updateLeadEmailStatus, replaceTemplateVariables, recordEmailSend, hasEmailBeenSentForTemplate } = await import("./db");
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
    
    // ===== ENVIO IMEDIATO (APENAS PARA NOVOS LEADS) =====
    // CORREÇÃO: Só envia email automático se for um lead NOVO
    if (autoSendEnabled && isNewLead) {
      console.log(`[Webhook] Auto-envio imediato ativado para NOVO lead, buscando templates do tipo '${leadType}'...`);
      
      // CORREÇÃO: Usar nova função que busca por sendMode = "automatic"
      const templatesWithAutoSend = await getTemplatesForAutoSend(leadType);
      
      if (templatesWithAutoSend.length > 0) {
        const { sendEmail } = await import("./email");
        
        for (const template of templatesWithAutoSend) {
          try {
            // CORREÇÃO: Verificar se já foi enviado para este template
            const alreadySent = await hasEmailBeenSentForTemplate(template.id, lead.id);
            
            if (alreadySent) {
              console.log(`[Webhook] ⏭️ Email já foi enviado para ${customer_email} com template '${template.nome}', pulando...`);
              continue;
            }
            
            console.log(`[Webhook] Enviando template '${template.nome}' para ${customer_email} (IMEDIATO)`);
            
            const htmlContent = replaceTemplateVariables(template.htmlContent, lead);
            const processedSubject = replaceTemplateVariables(template.assunto, lead);
            
            const emailSent = await sendEmail({
              to: lead.email,
              subject: processedSubject,
              html: htmlContent,
            });
            
            if (emailSent) {
              await updateLeadEmailStatus(lead.id, true);
              // CORREÇÃO: Registrar no histórico de envios
              await recordEmailSend(template.id, lead.id, "auto_lead", "sent");
              console.log(`[Webhook] ✅ Email enviado automaticamente para ${customer_email}`);
            } else {
              // CORREÇÃO: Registrar falha no histórico
              await recordEmailSend(template.id, lead.id, "auto_lead", "failed");
              console.error(`[Webhook] ❌ Falha ao enviar email para ${customer_email}`);
            }
          } catch (templateError) {
            console.error(`[Webhook] Erro ao processar template ${template.id}:`, templateError);
            // CORREÇÃO: Registrar erro no histórico
            await recordEmailSend(template.id, lead.id, "auto_lead", "failed", String(templateError));
          }
        }
      } else {
        console.log(`[Webhook] Nenhum template automático do tipo '${leadType}' encontrado`);
      }
    } else if (!isNewLead) {
      console.log(`[Webhook] ⏭️ Lead já existente, NÃO enviando email automático para ${customer_email}`);
    } else {
      console.log(`[Webhook] Auto-envio imediato desativado`);
    }
    
    // ===== ENVIO ATRASADO (APENAS PARA NOVOS LEADS) =====
    // CORREÇÃO: Só agenda envio atrasado se for um lead NOVO
    if (isNewLead) {
      console.log(`[Webhook] Verificando templates com envio atrasado do tipo '${leadType}'...`);
      const { getTemplatesForDelayedSend } = await import("./db");
      const templatesWithDelayedSend = await getTemplatesForDelayedSend(leadType);
      
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
    } else {
      console.log(`[Webhook] ⏭️ Lead já existente, NÃO agendando envio atrasado para ${customer_email}`);
    }

    console.log(`[Webhook] ✅ Lead processado com sucesso: ${customer_email}`);
    return {
      success: true,
      message: "Lead processado com sucesso",
      leadEmail: customer_email,
      transactionId: transaction_id,
      leadStatus: leadStatus,
      leadType: leadType,
      isNewLead: isNewLead,
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

import { InsertLead } from "../drizzle/schema_postgresql";

/**
 * Processa webhooks de novo cadastro/signup
 * Esperado receber um payload com informações do novo usuário
 */
export async function processNewSignupWebhook(payload: any) {
  try {
    console.log("[Webhook Novo Cadastro] Processando payload:", JSON.stringify(payload, null, 2));

    // Validar se o payload contém os dados necessários
    if (!payload) {
      console.warn("[Webhook Novo Cadastro] Payload vazio recebido");
      return {
        success: false,
        message: "Payload vazio",
      };
    }

    // Extrair dados do webhook
    // Suportar múltiplos formatos de payload
    const customer_name = payload.name || payload.full_name || payload.nome;
    const customer_email = payload.email;
    
    // Validar campos obrigatórios
    if (!customer_email || !customer_name) {
      console.warn("[Webhook Novo Cadastro] Email ou nome do cliente não fornecido");
      console.warn(`[Webhook Novo Cadastro] Payload: ${JSON.stringify(payload)}`);
      return {
        success: false,
        message: "Email e nome do cliente são obrigatórios",
      };
    }

    // Preparar dados do lead
    const leadData: InsertLead = {
      nome: customer_name,
      email: customer_email,
      produto: "Novo Cadastro",
      plano: "Plano não especificado",
      valor: 0,
      dataCriacao: new Date(),
      emailEnviado: 0,
      status: "active",
      leadType: "novo_cadastro", // ← NOVO
      isNewLeadAfterUpdate: 1, // ← NOVO
    };

    // Importar funções dinamicamente
    const { getDb } = await import("./db");
    const { leads } = await import("../drizzle/schema_postgresql");
    const { eq } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) {
      console.error("[Webhook Novo Cadastro] Banco de dados não disponível");
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
      console.log(`[Webhook Novo Cadastro] Lead com email ${customer_email} já existe`);
      return {
        success: true,
        message: "Lead já existe",
        leadEmail: customer_email,
      };
    }

    // Criar novo lead
    console.log(`[Webhook Novo Cadastro] Criando novo lead: ${customer_email}`);
    await db.insert(leads).values(leadData);

    // Buscar lead recém-criado
    const createdLead = await db
      .select()
      .from(leads)
      .where(eq(leads.email, customer_email))
      .limit(1);

    if (createdLead.length === 0) {
      console.error(`[Webhook Novo Cadastro] Lead não encontrado após criação: ${customer_email}`);
      return {
        success: true,
        message: "Lead criado mas não encontrado para processamento",
        leadEmail: customer_email,
      };
    }

    const lead = createdLead[0];
    console.log(`[Webhook Novo Cadastro] Lead criado com sucesso: ID ${lead.id}, Email: ${customer_email}`);

    // ===== APLICAR TEMPLATES DE NOVO CADASTRO =====
    const { getTemplatesByTypeAndSendType, updateLeadEmailStatus, replaceTemplateVariables } = await import("./db");
    const { sendEmail } = await import("./email");

    // Buscar templates de novo cadastro com envio imediato
    const immediateTemplates = await getTemplatesByTypeAndSendType("novo_cadastro", "immediate");
    
    console.log(`[Webhook Novo Cadastro] Encontrados ${immediateTemplates.length} template(s) com envio imediato`);
    
    for (const template of immediateTemplates) {
      try {
        console.log(`[Webhook Novo Cadastro] Enviando template '${template.nome}' para ${customer_email} (IMEDIATO)`);
        
        const htmlContent = replaceTemplateVariables(template.htmlContent, lead);
        const processedSubject = replaceTemplateVariables(template.assunto, lead);
        
        const emailSent = await sendEmail({
          to: lead.email,
          subject: processedSubject,
          html: htmlContent,
        });
        
        if (emailSent) {
          await updateLeadEmailStatus(lead.id, true);
          console.log(`[Webhook Novo Cadastro] Email enviado para ${customer_email}`);
        } else {
          console.error(`[Webhook Novo Cadastro] Falha ao enviar email para ${customer_email}`);
        }
      } catch (templateError) {
        console.error(`[Webhook Novo Cadastro] Erro ao processar template ${template.id}:`, templateError);
      }
    }

    // Buscar templates de novo cadastro com envio atrasado
    const delayedTemplates = await getTemplatesByTypeAndSendType("novo_cadastro", "delayed");
    
    console.log(`[Webhook Novo Cadastro] Encontrados ${delayedTemplates.length} template(s) com envio atrasado`);
    
    if (delayedTemplates.length > 0) {
      const template = delayedTemplates[0];
      const delayDays = template.delayDaysAfterLeadCreation || 0;
      
      console.log(`[Webhook Novo Cadastro] Agendando email para ${delayDays} dia(s) após criação do lead`);
      
      // Calcular e atualizar nextEmailSendAt baseado em dataCriacao do lead
      const createdAt = new Date(lead.dataCriacao);
      const nextSendAt = new Date(createdAt);
      nextSendAt.setDate(nextSendAt.getDate() + delayDays);

      await db
        .update(leads)
        .set({ nextEmailSendAt: nextSendAt.toISOString() as any })
        .where(eq(leads.id, lead.id));
      
      console.log(`[Webhook Novo Cadastro] Email agendado para ${nextSendAt.toLocaleString("pt-BR")}`);
    }

    console.log(`[Webhook Novo Cadastro] Lead processado com sucesso: ${customer_email}`);
    return {
      success: true,
      message: "Lead processado com sucesso",
      leadEmail: customer_email,
      leadId: lead.id,
    };
  } catch (error) {
    console.error("[Webhook Novo Cadastro] Erro ao processar webhook:", error);
    return {
      success: false,
      message: "Erro ao processar webhook",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

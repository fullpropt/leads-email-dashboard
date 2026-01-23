import { asc, desc, eq, sql, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { autoSendConfig, emailTemplates, InsertEmailTemplate, InsertLead, InsertUser, Lead, leads, users, funnels, funnelTemplates, funnelLeadProgress, Funnel, FunnelTemplate, FunnelLeadProgress, InsertFunnel, InsertFunnelTemplate, InsertFunnelLeadProgress } from "../drizzle/schema_postgresql";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL);
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ========================================================================
// LEADS QUERIES
// ========================================================================

export async function getAllLeads() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get leads: database not available");
    return [];
  }

  const result = await db.select().from(leads).orderBy(desc(leads.dataCriacao));
  return result;
}

/**
 * Buscar um lead específico por email
 */
export async function getLeadByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get lead: database not available");
    return null;
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const result = await db
      .select()
      .from(leads)
      .where(sql`LOWER(${leads.email}) = ${normalizedEmail}`)
      .limit(1);

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get lead by email:", error);
    return null;
  }
}

/**
 * Buscar histórico de emails enviados para um lead específico
 */
export async function getEmailHistoryByLeadId(leadId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get email history: database not available");
    return [];
  }

  try {
    const { emailSendHistory, emailTemplates } = await import("../drizzle/schema_postgresql");
    
    const result = await db
      .select({
        id: emailSendHistory.id,
        templateId: emailSendHistory.templateId,
        templateName: emailTemplates.nome,
        sendType: emailSendHistory.sendType,
        sentAt: emailSendHistory.sentAt,
        status: emailSendHistory.status,
        errorMessage: emailSendHistory.errorMessage,
      })
      .from(emailSendHistory)
      .leftJoin(emailTemplates, eq(emailSendHistory.templateId, emailTemplates.id))
      .where(eq(emailSendHistory.leadId, leadId))
      .orderBy(desc(emailSendHistory.sentAt));

    return result;
  } catch (error) {
    console.error("[Database] Failed to get email history:", error);
    return [];
  }
}

export async function getLeadsWithPagination(
  page: number = 1,
  emailStatus?: 'pending' | 'sent',
  search?: string,
  leadStatus?: 'active' | 'abandoned' | 'none',
  platformAccess?: 'accessed' | 'not_accessed',
  sortDirection: 'asc' | 'desc' = 'desc'
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get leads: database not available");
    return { leads: [], total: 0, page, pageSize: 30 };
  }

  const pageSize = 30;
  const offset = (page - 1) * pageSize;

  try {
    // Construir condições de filtro
    const conditions = [];
    
    // Filtro de status de email
    if (emailStatus === 'pending') {
      conditions.push(eq(leads.emailEnviado, 0));
    } else if (emailStatus === 'sent') {
      conditions.push(eq(leads.emailEnviado, 1));
    }
    
    // Filtro de situação do lead (baseado em lead_type)
    if (leadStatus === 'active') {
      // Compra Aprovada = lead_type é 'compra_aprovada'
      conditions.push(eq(leads.leadType, 'compra_aprovada'));
    } else if (leadStatus === 'abandoned') {
      // Carrinho Abandonado = lead_type é 'carrinho_abandonado'
      conditions.push(eq(leads.leadType, 'carrinho_abandonado'));
    } else if (leadStatus === 'none') {
      // Nenhum = lead_type não é 'compra_aprovada' nem 'carrinho_abandonado' (leads migrados)
      conditions.push(
        sql`${leads.leadType} NOT IN ('compra_aprovada', 'carrinho_abandonado')`
      );
    }
    
    // Filtro de acesso à plataforma
    if (platformAccess === 'accessed') {
      conditions.push(eq(leads.hasAccessedPlatform, 1));
    } else if (platformAccess === 'not_accessed') {
      conditions.push(eq(leads.hasAccessedPlatform, 0));
    }

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        sql`(${leads.nome} LIKE ${searchPattern} OR ${leads.email} LIKE ${searchPattern} OR ${leads.produto} LIKE ${searchPattern})`
      );
    }

    // Construir a query principal
    let query = db.select().from(leads);
    
    // Aplicar filtros se existirem
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Contar total de registros com o filtro (BUSCA EM TODO O BANCO DE DADOS)
    let countQueryWithFilter = db.select({ count: sql`COUNT(*)` }).from(leads);
    
    if (conditions.length > 0) {
      countQueryWithFilter = countQueryWithFilter.where(and(...conditions));
    }

    const [countResult] = await countQueryWithFilter;
    const total = Number(countResult?.count || 0);

    // Definir ordenação baseada no parâmetro sortDirection
    const orderByClause = sortDirection === 'asc' ? asc(leads.dataCriacao) : desc(leads.dataCriacao);

    // Buscar leads com paginação (RETORNA TODOS OS RESULTADOS ENCONTRADOS, NÃO APENAS OS 30 DA PÁGINA)
    // Se houver busca, retorna todos os resultados encontrados sem limitar a 30
    let result;
    if (search) {
      // Para buscas, retorna todos os resultados encontrados
      result = await query
        .orderBy(orderByClause);
    } else {
      // Para listagem normal, aplica paginação
      result = await query
        .orderBy(orderByClause)
        .limit(pageSize)
        .offset(offset);
    }

    return {
      leads: result,
      total,
      page,
      pageSize: search ? result.length : pageSize,
      totalPages: search ? 1 : Math.ceil(total / pageSize),
    };
  } catch (error) {
    console.error("[Database] Failed to get leads with pagination:", error);
    return { leads: [], total: 0, page, pageSize: 30, totalPages: 0 };
  }
}

export async function updateLeadEmailStatus(leadId: number, enviado: boolean) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update lead: database not available");
    return false;
  }

  try {
    await db
      .update(leads)
      .set({
        emailEnviado: enviado ? 1 : 0,
        dataEnvioEmail: enviado ? new Date() : null,
      })
      .where(eq(leads.id, leadId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update lead email status:", error);
    return false;
  }
}

// ========================================================================
// EMAIL TEMPLATES QUERIES
// ========================================================================

export async function getActiveEmailTemplate() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get template: database not available");
    return null;
  }

  const result = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.ativo, 1))
    .orderBy(desc(emailTemplates.atualizadoEm))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getAllEmailTemplates() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get templates: database not available");
    return [];
  }

  const result = await db
    .select()
    .from(emailTemplates)
    .orderBy(desc(emailTemplates.atualizadoEm));
  return result;
}

/**
 * Buscar um template de email por ID
 */
export async function getEmailTemplateById(templateId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get template: database not available");
    return null;
  }

  try {
    console.log("[DEBUG] Buscando template com ID:", templateId);
    const result = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, templateId))
      .limit(1);

    console.log("[DEBUG] Resultado da query:", result);
    console.log("[DEBUG] Numero de resultados:", result.length);
    
    if (result.length > 0) {
      console.log("[DEBUG] Template encontrado com sucesso");
    } else {
      console.log("[DEBUG] Nenhum template encontrado com ID:", templateId);
    }
    
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get email template by ID:", error);
    return null;
  }
}

export async function updateEmailTemplate(templateId: number, updates: Partial<InsertEmailTemplate>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update template: database not available");
    return false;
  }

  try {
    await db
      .update(emailTemplates)
      .set(updates)
      .where(eq(emailTemplates.id, templateId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update email template:", error);
    return false;
  }
}

export async function deleteEmailTemplate(templateId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete template: database not available");
    return false;
  }

  try {
    await db
      .delete(emailTemplates)
      .where(eq(emailTemplates.id, templateId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete email template:", error);
    return false;
  }
}

export async function createEmailTemplate(template: InsertEmailTemplate) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create template: database not available");
    return null;
  }

  try {
    const result = await db.insert(emailTemplates).values(template);
    // Retornar o ID do último registro inserido
    const [newTemplate] = await db
      .select()
      .from(emailTemplates)
      .orderBy(desc(emailTemplates.id))
      .limit(1);
    return newTemplate?.id ?? null;
  } catch (error) {
    console.error("[Database] Failed to create email template:", error);
    return null;
  }
}

export async function setActiveEmailTemplate(templateId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot set active template: database not available");
    return false;
  }

  try {
    // Desativar todos os templates
    await db.update(emailTemplates).set({ ativo: 0 });
    
    // Ativar o template selecionado
    await db
      .update(emailTemplates)
      .set({ ativo: 1 })
      .where(eq(emailTemplates.id, templateId));
    
    return true;
  } catch (error) {
    console.error("[Database] Failed to set active template:", error);
    return false;
  }
}

/**
 * Atualizar configurações de envio de um template
 * Permite ativar/desativar: envio imediato, automático por lead, e agendado
 */
export async function updateTemplateSendSettings(
  templateId: number,
  settings: {
    sendImmediateEnabled?: number;
    autoSendOnLeadEnabled?: number;
    scheduleEnabled?: number;
    scheduleTime?: string;
    scheduleInterval?: number;
    scheduleIntervalType?: "days" | "weeks";
  }
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update template send settings: database not available");
    return false;
  }

  try {
    const updateData: any = {};

    if (settings.sendImmediateEnabled !== undefined) {
      updateData.sendImmediateEnabled = settings.sendImmediateEnabled;
    }

    if (settings.autoSendOnLeadEnabled !== undefined) {
      updateData.autoSendOnLeadEnabled = settings.autoSendOnLeadEnabled;
    }

    if (settings.scheduleEnabled !== undefined) {
      updateData.scheduleEnabled = settings.scheduleEnabled;
    }

    if (settings.scheduleTime !== undefined) {
      updateData.scheduleTime = settings.scheduleTime;
    }

    if (settings.scheduleInterval !== undefined) {
      updateData.scheduleInterval = settings.scheduleInterval;
    }

    if (settings.scheduleIntervalType !== undefined) {
      updateData.scheduleIntervalType = settings.scheduleIntervalType;
    }

    await db
      .update(emailTemplates)
      .set(updateData)
      .where(eq(emailTemplates.id, templateId));

    return true;
  } catch (error) {
    console.error("[Database] Failed to update template send settings:", error);
    return false;
  }
}

/**
 * Obter todos os templates com envio imediato ativado
 */
export async function getTemplatesWithImmediateSendEnabled() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get templates: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.sendImmediateEnabled, 1));

    return result;
  } catch (error) {
    console.error("[Database] Failed to get templates with immediate send enabled:", error);
    return [];
  }
}

/**
 * Obter todos os templates com envio automático por lead ativado
 */
export async function getTemplatesWithAutoSendOnLeadEnabled() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get templates: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.autoSendOnLeadEnabled, 1));

    return result;
  } catch (error) {
    console.error("[Database] Failed to get templates with auto send on lead enabled:", error);
    return [];
  }
}

/**
 * Obter todos os templates com agendamento ativado
 */
export async function getTemplatesWithScheduleEnabled() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get templates: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.scheduleEnabled, 1));

    return result;
  } catch (error) {
    console.error("[Database] Failed to get templates with schedule enabled:", error);
    return [];
  }
}

export async function getAutoSendStatus() {
  const db = await getDb();
  if (!db) return false;
  
  try {
    const result = await db
      .select()
      .from(autoSendConfig)
      .limit(1);
    
    return result.length > 0 ? result[0].autoSendEnabled === 1 : false;
  } catch (error) {
    console.error("[Database] Failed to get auto send status:", error);
    return false;
  }
}

export async function toggleAutoSend(enabled: boolean) {
  const db = await getDb();
  if (!db) return false;
  
  try {
    const existing = await db
      .select()
      .from(autoSendConfig)
      .limit(1);
    
    if (existing.length === 0) {
      await db.insert(autoSendConfig).values({
        id: 1,
        autoSendEnabled: enabled ? 1 : 0,
      });
    } else {
      await db
        .update(autoSendConfig)
        .set({ autoSendEnabled: enabled ? 1 : 0 })
        .where(eq(autoSendConfig.id, 1));
    }
    return true;
  } catch (error) {
    console.error("[Database] Failed to toggle auto send:", error);
    return false;
  }
}

// ========================================================================
// UTILITY FUNCTION FOR TEMPLATE VARIABLE SUBSTITUTION
// ========================================================================

export function replaceTemplateVariables(htmlContent: string, lead: Lead): string {
  let result = htmlContent;
  const currentYear = new Date().getFullYear();
  
  // Variáveis em formato {{variavel}}
  result = result.replace(/\{\{nome\}\}/g, lead.nome || "");
  result = result.replace(/\{\{email\}\}/g, lead.email || "");
  result = result.replace(/\{\{produto\}\}/g, lead.produto || "");
  result = result.replace(/\{\{plano\}\}/g, lead.plano || "");
  result = result.replace(/\{\{valor\}\}/g, lead.valor ? `$${Number(lead.valor).toFixed(2)}` : "$0.00");
  result = result.replace(/\{\{data_compra\}\}/g, lead.dataAprovacao ? new Date(lead.dataAprovacao).toLocaleDateString("pt-BR") : "");
  result = result.replace(/\{\{year\}\}/g, currentYear.toString());
  
  // Variáveis em formato {VARIAVEL}
  result = result.replace(/\{CUSTOMER_NAME\}/g, lead.nome || "");
  result = result.replace(/\{CUSTOMER_EMAIL\}/g, lead.email || "");
  result = result.replace(/\{PRODUCT_NAME\}/g, lead.produto || "");
  result = result.replace(/\{PLAN_NAME\}/g, lead.plano || "");
  result = result.replace(/\{SALE_VALUE\}/g, lead.valor ? `$${Number(lead.valor).toFixed(2)}` : "$0.00");
  result = result.replace(/\{PURCHASE_DATE\}/g, lead.dataAprovacao ? new Date(lead.dataAprovacao).toLocaleDateString("pt-BR") : "");
  result = result.replace(/\{YEAR\}/g, currentYear.toString());
  
  return result;
}

// ========================================================================
// MANUAL SEND SELECTION
// ========================================================================

export async function updateLeadManualSendSelection(leadId: number, selected: boolean) {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.update(leads)
      .set({ selectedForManualSend: selected ? 1 : 0 })
      .where(eq(leads.id, leadId));
    return true;
  } catch (error) {
    console.error("[Database] Erro ao atualizar seleção de lead:", error);
    return false;
  }
}

export async function updateAllLeadsManualSendSelection(
  selected: boolean,
  leadStatus?: 'active' | 'abandoned' | 'none',
  platformAccess?: 'accessed' | 'not_accessed',
  search?: string
) {
  const db = await getDb();
  if (!db) return false;
  
  try {
    // Construir condições de filtro (mesma lógica de getLeadsWithPagination)
    const conditions = [];
    
    // Filtro de situação do lead (baseado em lead_type)
    if (leadStatus === 'active') {
      // Compra Aprovada = lead_type é 'compra_aprovada'
      conditions.push(eq(leads.leadType, 'compra_aprovada'));
    } else if (leadStatus === 'abandoned') {
      // Carrinho Abandonado = lead_type é 'carrinho_abandonado'
      conditions.push(eq(leads.leadType, 'carrinho_abandonado'));
    } else if (leadStatus === 'none') {
      // Nenhum = lead_type não é 'compra_aprovada' nem 'carrinho_abandonado' (leads migrados)
      conditions.push(
        sql`${leads.leadType} NOT IN ('compra_aprovada', 'carrinho_abandonado')`
      );
    }
    
    // Filtro de acesso à plataforma
    if (platformAccess === 'accessed') {
      conditions.push(eq(leads.hasAccessedPlatform, 1));
    } else if (platformAccess === 'not_accessed') {
      conditions.push(eq(leads.hasAccessedPlatform, 0));
    }

    // Filtro de busca por nome ou email
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        sql`(${leads.nome} LIKE ${searchPattern} OR ${leads.email} LIKE ${searchPattern} OR ${leads.produto} LIKE ${searchPattern})`
      );
    }

    // Executar update com ou sem filtros
    if (conditions.length > 0) {
      await db.update(leads)
        .set({ selectedForManualSend: selected ? 1 : 0 })
        .where(and(...conditions));
    } else {
      // Sem filtros, atualiza todos os leads
      await db.update(leads)
        .set({ selectedForManualSend: selected ? 1 : 0 });
    }
    
    return true;
  } catch (error) {
    console.error("[Database] Erro ao atualizar seleção de todos os leads:", error);
    return false;
  }
}

export async function getSelectedLeadsForManualSend() {
  const db = await getDb();
  if (!db) return [];
  
  try {
    return await db.select()
      .from(leads)
      .where(eq(leads.selectedForManualSend, 1));
  } catch (error) {
    console.error("[Database] Erro ao obter leads selecionados:", error);
    return [];
  }
}

export async function getSelectedLeadsCount() {
  const db = await getDb();
  if (!db) return 0;
  
  try {
    const [result] = await db.select({ count: sql`COUNT(*)` })
      .from(leads)
      .where(eq(leads.selectedForManualSend, 1));
    return Number(result?.count || 0);
  } catch (error) {
    console.error("[Database] Erro ao contar leads selecionados:", error);
    return 0;
  }
}

export async function toggleEmailTemplateActive(templateId: number) {
  const db = await getDb();
  if (!db) return false;
  
  try {
    const template = await db.select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, templateId))
      .limit(1);
    
    if (template.length === 0) return false;
    
    const currentStatus = template[0].ativo;
    await db.update(emailTemplates)
      .set({ ativo: currentStatus === 1 ? 0 : 1 })
      .where(eq(emailTemplates.id, templateId));
    
    return true;
  } catch (error) {
    console.error("[Database] Erro ao toggle template:", error);
    return false;
  }
}

// ========================================================================
// DELAYED SEND ON LEAD (ENVIO ATRASADO)
// ========================================================================

/**
 * Obter todos os templates com envio atrasado ativado
 */
export async function getTemplatesWithDelayedSendEnabled() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get templates: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.sendOnLeadDelayEnabled, 1));

    return result;
  } catch (error) {
    console.error("[Database] Failed to get templates with delayed send enabled:", error);
    return [];
  }
}

/**
 * Obter leads que estão prontos para envio atrasado
 * Retorna leads com nextEmailSendAt <= agora e emailEnviado = 0
 */
export async function getLeadsReadyForDelayedSend() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get leads: database not available");
    return [];
  }

  try {
    const now = new Date();
    const result = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.emailEnviado, 0), // Email não enviado
          sql`${leads.nextEmailSendAt} IS NOT NULL`, // nextEmailSendAt está definido
          sql`${leads.nextEmailSendAt} <= ${now}` // Tempo de envio chegou
        )
      );

    return result;
  } catch (error) {
    console.error("[Database] Failed to get leads ready for delayed send:", error);
    return [];
  }
}

/**
 * Atualizar nextEmailSendAt de um lead
 * Calcula a data baseado em dataCriacao + delayDays
 */
export async function updateLeadNextSendAt(leadId: number, delayDays: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update lead: database not available");
    return false;
  }

  try {
    // Buscar o lead para pegar a data de criação
    const leadResult = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (leadResult.length === 0) {
      console.warn(`[Database] Lead ${leadId} not found`);
      return false;
    }

    const lead = leadResult[0];
    const createdAt = new Date(lead.dataCriacao);
    const nextSendAt = new Date(createdAt);
    nextSendAt.setDate(nextSendAt.getDate() + delayDays);

    await db
      .update(leads)
      .set({ nextEmailSendAt: nextSendAt })
      .where(eq(leads.id, leadId));

    return true;
  } catch (error) {
    console.error("[Database] Failed to update lead next send at:", error);
    return false;
  }
}

/**
 * Limpar nextEmailSendAt de um lead (quando email é enviado)
 */
export async function clearLeadNextSendAt(leadId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update lead: database not available");
    return false;
  }

  try {
    await db
      .update(leads)
      .set({ nextEmailSendAt: null })
      .where(eq(leads.id, leadId));

    return true;
  } catch (error) {
    console.error("[Database] Failed to clear lead next send at:", error);
    return false;
  }
}

// ===== FUNÇÕES PARA SINCRONIZAÇÃO COM TUBETOOLS =====

/**
 * Atualizar o status de acesso à plataforma de um lead
 * @param leadId ID do lead
 * @param hasAccessed true se o lead acessou a plataforma, false caso contrário
 */
export async function updateLeadPlatformAccessStatus(leadId: number, hasAccessed: boolean): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Database] Cannot update platform access status: database not available");
      return false;
    }

    await db
      .update(leads)
      .set({ hasAccessedPlatform: hasAccessed ? 1 : 0 })
      .where(eq(leads.id, leadId));

    console.log(`[Database] Lead ${leadId} platform access status updated: ${hasAccessed}`);
    return true;
  } catch (error) {
    console.error("[Database] Error updating platform access status:", error);
    return false;
  }
}

/**
 * Buscar todos os leads que ainda não foram verificados (has_accessed_platform = 0)
 * @returns Lista de leads não verificados
 */
export async function getUnverifiedLeads(): Promise<Lead[]> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Database] Cannot get unverified leads: database not available");
      return [];
    }

    const result = await db
      .select()
      .from(leads)
      .where(eq(leads.hasAccessedPlatform, 0));

    console.log(`[Database] Found ${result.length} unverified leads`);
    return result;
  } catch (error) {
    console.error("[Database] Error getting unverified leads:", error);
    return [];
  }
}

/**
 * Buscar leads que acessaram a plataforma
 * @returns Lista de leads que acessaram
 */
export async function getLeadsWhoAccessedPlatform(): Promise<Lead[]> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Database] Cannot get accessed leads: database not available");
      return [];
    }

    const result = await db
      .select()
      .from(leads)
      .where(eq(leads.hasAccessedPlatform, 1));

    console.log(`[Database] Found ${result.length} leads who accessed platform`);
    return result;
  } catch (error) {
    console.error("[Database] Error getting accessed leads:", error);
    return [];
  }
}

/**
 * Buscar leads que NÃO acessaram a plataforma
 * @returns Lista de leads que não acessaram
 */
export async function getLeadsWhoDidNotAccessPlatform(): Promise<Lead[]> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Database] Cannot get non-accessed leads: database not available");
      return [];
    }

    const result = await db
      .select()
      .from(leads)
      .where(eq(leads.hasAccessedPlatform, 0));

    console.log(`[Database] Found ${result.length} leads who did not access platform`);
    return result;
  } catch (error) {
    console.error("[Database] Error getting non-accessed leads:", error);
    return [];
  }
}

// Função para contar leads por status de acesso à plataforma
// ATUALIZADO: Agora usa o total de usuários do TubeTools como "accessed"
export async function getLeadsAccessStats() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get access stats: database not available");
    return { total: 0, accessed: 0, notAccessed: 0, abandoned: 0 };
  }

  try {
    const { count, eq, sql } = await import("drizzle-orm");
    const { getTubetoolsDb } = await import("./tubetools-db");
    
    // Contar total de leads (apenas compras aprovadas, não abandonados)
    const [totalResult] = await db
      .select({ count: sql`COUNT(*)` })
      .from(leads)
      .where(eq(leads.status, 'active'));
    const total = Number(totalResult?.count || 0);
    
    // Contar carrinhos abandonados
    const [abandonedResult] = await db
      .select({ count: sql`COUNT(*)` })
      .from(leads)
      .where(eq(leads.status, 'abandoned'));
    const abandoned = Number(abandonedResult?.count || 0);
    
    // Buscar total de usuários ativos no TubeTools (todos os cadastrados)
    let accessed = 0;
    const tubetoolsSql = getTubetoolsDb();
    if (tubetoolsSql) {
      try {
        const [tubetoolsResult] = await tubetoolsSql`SELECT COUNT(*) as count FROM users`;
        accessed = Number(tubetoolsResult?.count || 0);
      } catch (err) {
        console.error("[Database] Failed to get TubeTools user count:", err);
        // Fallback: usar contagem de leads com hasAccessedPlatform = 1
        const [accessedResult] = await db
          .select({ count: sql`COUNT(*)` })
          .from(leads)
          .where(eq(leads.hasAccessedPlatform, 1));
        accessed = Number(accessedResult?.count || 0);
      }
    } else {
      // Fallback: usar contagem de leads com hasAccessedPlatform = 1
      const [accessedResult] = await db
        .select({ count: sql`COUNT(*)` })
        .from(leads)
        .where(eq(leads.hasAccessedPlatform, 1));
      accessed = Number(accessedResult?.count || 0);
    }
    
    // Calcular leads que não acessaram (total de leads - leads que também estão no TubeTools)
    // Para isso, precisamos contar quantos leads têm correspondência no TubeTools
    const [leadsWithAccessResult] = await db
      .select({ count: sql`COUNT(*)` })
      .from(leads)
      .where(eq(leads.hasAccessedPlatform, 1));
    const leadsWithAccess = Number(leadsWithAccessResult?.count || 0);
    const notAccessed = total - leadsWithAccess;
    
    return {
      total,
      accessed,
      notAccessed,
      abandoned,
    };
  } catch (error) {
    console.error("[Database] Failed to get access stats:", error);
    return { total: 0, accessed: 0, notAccessed: 0, abandoned: 0 };
  }
}


// ========================================================================
// NOVAS FUNÇÕES PARA SUPORTE A TIPOS DE TEMPLATES E LEADS
// ========================================================================

/**
 * Buscar templates por tipo
 */
export async function getTemplatesByType(templateType: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get templates: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.templateType, templateType))
      .orderBy(desc(emailTemplates.atualizadoEm));
    
    return result;
  } catch (error) {
    console.error("[Database] Failed to get templates by type:", error);
    return [];
  }
}

/**
 * Buscar templates por tipo E tipo de envio
 */
export async function getTemplatesByTypeAndSendType(
  templateType: string,
  sendType: 'immediate' | 'delayed' | 'scheduled'
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get templates: database not available");
    return [];
  }

  try {
    const conditions: any[] = [eq(emailTemplates.templateType, templateType)];
    
    if (sendType === 'immediate') {
      conditions.push(eq(emailTemplates.sendImmediateEnabled, 1));
    } else if (sendType === 'delayed') {
      conditions.push(eq(emailTemplates.sendOnLeadDelayEnabled, 1));
    } else if (sendType === 'scheduled') {
      conditions.push(eq(emailTemplates.scheduleEnabled, 1));
    }
    
    const result = await db
      .select()
      .from(emailTemplates)
      .where(and(...conditions))
      .orderBy(desc(emailTemplates.atualizadoEm));
    
    return result;
  } catch (error) {
    console.error("[Database] Failed to get templates by type and send type:", error);
    return [];
  }
}

/**
 * Atualizar tipo de lead
 */
export async function updateLeadType(leadId: number, leadType: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update lead type: database not available");
    return false;
  }

  try {
    await db
      .update(leads)
      .set({ leadType })
      .where(eq(leads.id, leadId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update lead type:", error);
    return false;
  }
}

/**
 * Buscar leads novos (isNewLeadAfterUpdate = 1) que precisam de envio agendado
 */
export async function getNewLeadsForScheduledSend() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get leads: database not available");
    return [];
  }

  try {
    const now = new Date();
    
    const result = await db
      .select()
      .from(leads)
      .where(
        and(
          sql`${leads.nextEmailSendAt} IS NOT NULL`,
          sql`${leads.nextEmailSendAt} <= ${now}`,
          eq(leads.emailEnviado, 0),
          eq(leads.isNewLeadAfterUpdate, 1)
        )
      )
      .orderBy(desc(leads.dataCriacao));
    
    return result;
  } catch (error) {
    console.error("[Database] Failed to get leads for scheduled send:", error);
    return [];
  }
}

/**
 * Atualizar flag de novo lead após update
 */
export async function updateIsNewLeadAfterUpdate(leadId: number, isNew: boolean) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update lead: database not available");
    return false;
  }

  try {
    await db
      .update(leads)
      .set({ isNewLeadAfterUpdate: isNew ? 1 : 0 })
      .where(eq(leads.id, leadId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update isNewLeadAfterUpdate:", error);
    return false;
  }
}

/**
 * Atualizar data de envio de email do lead
 */
export async function updateLeadEmailSentDate(leadId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update lead: database not available");
    return false;
  }

  try {
    await db
      .update(leads)
      .set({ dataEnvioEmail: new Date(), emailEnviado: 1 })
      .where(eq(leads.id, leadId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update lead email sent date:", error);
    return false;
  }
}

// ========================================================================
// IMPORTAÇÃO DE DADOS HISTÓRICOS
// ========================================================================

/**
 * Importar carrinhos abandonados históricos da API PerfectPay
 */
export async function importAbandonedCartsFromPerfectPay(
  token: string,
  daysBack: number = 7
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot import abandoned carts: database not available");
    return { success: false, imported: 0, errors: 0, message: "Database not available" };
  }

  try {
    // Calcular datas
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysBack);

    const dateFrom = startDate.toISOString().split('T')[0];
    const dateTo = today.toISOString().split('T')[0];

    console.log(`[Import] Importando carrinhos abandonados de ${dateFrom} a ${dateTo}`);

    // Chamar API da PerfectPay
    const response = await fetch(
      `https://app.perfectpay.com.br/api/v1/sales/get`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          start_date_sale: dateFrom,
          end_date_sale: dateTo,
          sale_status: [12]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Import] Erro ao chamar API PerfectPay:", response.statusText, errorText);
      return { 
        success: false, 
        imported: 0, 
        errors: 1,
        message: `Erro na API PerfectPay: ${response.statusText}`
      };
    }

    const data = await response.json();
    const sales = data.sales?.data || [];

    console.log(`[Import] Total de carrinhos abandonados encontrados: ${sales.length}`);

    let imported = 0;
    let errors = 0;
    let skipped = 0;

    // Processar cada carrinho abandonado
    for (const sale of sales) {
      try {
        // NORMALIZAÇÃO: Converter email para minúsculas para evitar duplicatas por diferença de capitalização
        const customerEmail = sale.customer?.email ? sale.customer.email.toLowerCase().trim() : sale.customer?.email;
        
        if (!customerEmail) {
          console.warn("[Import] ⚠️ Carrinho sem email, pulando...");
          skipped++;
          continue;
        }

        // Verificar se já existe (busca case-insensitive para segurança)
        const existing = await db
          .select()
          .from(leads)
          .where(eq(leads.email, customerEmail))
          .limit(1);

        if (existing.length === 0) {
          // Inserir novo lead
          const leadData: InsertLead = {
            nome: sale.customer?.full_name || "Sem nome",
            email: customerEmail,
            produto: sale.product?.name || "Produto não especificado",
            plano: sale.plan?.name || "Plano não especificado",
            valor: Math.round((sale.sale_amount || 0) * 100), // Converter para centavos
            dataCriacao: new Date(sale.date_created || new Date()),
            emailEnviado: 0,
            status: "abandoned",
            leadType: "carrinho_abandonado",
            isNewLeadAfterUpdate: 1,
          };

          await db.insert(leads).values(leadData);
          imported++;
          console.log(`[Import] ✅ Lead importado: ${customerEmail}`);
        } else {
          console.log(`[Import] ℹ️ Lead já existe: ${customerEmail}`);
          skipped++;
        }
      } catch (error) {
        console.error(`[Import] ❌ Erro ao importar lead:`, error);
        errors++;
      }
    }

    const message = `Importação concluída: ${imported} importados, ${skipped} já existentes, ${errors} erros`;
    console.log(`[Import] ${message}`);
    
    return { 
      success: true, 
      imported, 
      errors,
      skipped,
      message
    };
  } catch (error) {
    console.error("[Database] Failed to import abandoned carts:", error);
    return { 
      success: false, 
      imported: 0, 
      errors: 1,
      message: `Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}


// ========================================================================
// FUNÇÕES PARA FILTROS DE TEMPLATE E CONTADOR DE EMAILS
// ========================================================================

/**
 * Buscar leads filtrados pelos critérios do template
 * @param targetStatusPlataforma - Filtro de status da plataforma ("all", "accessed", "not_accessed")
 * @param targetSituacao - Filtro de situação ("all", "active", "abandoned", "none")
 * @param onlyPending - Se true, retorna apenas leads com email não enviado
 */
export async function getLeadsForTemplateFilters(
  targetStatusPlataforma: "all" | "accessed" | "not_accessed",
  targetSituacao: "all" | "active" | "abandoned" | "none",
  onlyPending: boolean = true
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get leads for template filters: database not available");
    return [];
  }

  try {
    const conditions = [];

    // Filtro de email pendente
    if (onlyPending) {
      conditions.push(eq(leads.emailEnviado, 0));
    }

    // Filtro de status da plataforma
    if (targetStatusPlataforma === "accessed") {
      conditions.push(eq(leads.hasAccessedPlatform, 1));
    } else if (targetStatusPlataforma === "not_accessed") {
      conditions.push(eq(leads.hasAccessedPlatform, 0));
    }

    // Filtro de situação (baseado em leadType)
    if (targetSituacao === "active") {
      conditions.push(eq(leads.leadType, "compra_aprovada"));
    } else if (targetSituacao === "abandoned") {
      conditions.push(eq(leads.leadType, "carrinho_abandonado"));
    } else if (targetSituacao === "none") {
      // Leads sem situação definida (migrados ou outros tipos)
      conditions.push(
        sql`${leads.leadType} NOT IN ('compra_aprovada', 'carrinho_abandonado')`
      );
    }

    // Executar query
    if (conditions.length > 0) {
      return await db.select().from(leads).where(and(...conditions));
    } else {
      return await db.select().from(leads);
    }
  } catch (error) {
    console.error("[Database] Failed to get leads for template filters:", error);
    return [];
  }
}

/**
 * Contar emails enviados por template
 * @param templateId - ID do template
 */
export async function getEmailSentCountByTemplate(templateId: number): Promise<number> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get email sent count: database not available");
    return 0;
  }

  try {
    const { emailSendHistory } = await import("../drizzle/schema_postgresql");
    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(emailSendHistory)
      .where(
        and(
          eq(emailSendHistory.templateId, templateId),
          eq(emailSendHistory.status, "sent")
        )
      );
    return Number(result?.count || 0);
  } catch (error) {
    console.error("[Database] Failed to get email sent count:", error);
    return 0;
  }
}

/**
 * Obter contagem de emails enviados para todos os templates
 */
export async function getAllTemplatesEmailSentCounts(): Promise<Record<number, number>> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get all templates email sent counts: database not available");
    return {};
  }

  try {
    const { emailSendHistory } = await import("../drizzle/schema_postgresql");
    const results = await db
      .select({
        templateId: emailSendHistory.templateId,
        count: sql<number>`COUNT(*)`,
      })
      .from(emailSendHistory)
      .where(eq(emailSendHistory.status, "sent"))
      .groupBy(emailSendHistory.templateId);

    const counts: Record<number, number> = {};
    for (const row of results) {
      counts[row.templateId] = Number(row.count);
    }
    return counts;
  } catch (error) {
    console.error("[Database] Failed to get all templates email sent counts:", error);
    return {};
  }
}

/**
 * Registrar envio de email no histórico
 * @param templateId - ID do template usado
 * @param leadId - ID do lead que recebeu o email
 * @param sendType - Tipo de envio ("immediate", "auto_lead", "scheduled", "manual")
 * @param status - Status do envio ("sent", "failed", "bounced")
 * @param errorMessage - Mensagem de erro (opcional)
 */
export async function recordEmailSend(
  templateId: number,
  leadId: number,
  sendType: string,
  status: "sent" | "failed" | "bounced",
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot record email send: database not available");
    return false;
  }

  try {
    const { emailSendHistory } = await import("../drizzle/schema_postgresql");
    await db.insert(emailSendHistory).values({
      templateId,
      leadId,
      sendType,
      status,
      errorMessage: errorMessage || null,
      sentAt: new Date(),
    });
    return true;
  } catch (error) {
    console.error("[Database] Failed to record email send:", error);
    return false;
  }
}

// ========================================================================
// NOVAS FUNÇÕES PARA CORRIGIR ENVIO DUPLICADO (ADICIONADAS)
// ========================================================================

/**
 * Verificar se um email já foi enviado para um lead com um template específico
 * @param templateId - ID do template
 * @param leadId - ID do lead
 * @returns true se já foi enviado, false caso contrário
 */
export async function hasEmailBeenSentForTemplate(
  templateId: number,
  leadId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot check email sent status: database not available");
    return false;
  }

  try {
    const { emailSendHistory } = await import("../drizzle/schema_postgresql");
    const result = await db
      .select()
      .from(emailSendHistory)
      .where(
        and(
          eq(emailSendHistory.templateId, templateId),
          eq(emailSendHistory.leadId, leadId),
          eq(emailSendHistory.status, "sent")
        )
      )
      .limit(1);

    return result.length > 0;
  } catch (error) {
    console.error("[Database] Failed to check email sent status:", error);
    return false;
  }
}

/**
 * Buscar templates para envio automático (sendMode = "automatic")
 * CORREÇÃO: Usa sendMode em vez de sendImmediateEnabled
 * @param templateType - Tipo do template (compra_aprovada, carrinho_abandonado, etc.)
 * @returns Lista de templates ativos com sendMode = "automatic"
 */
export async function getTemplatesForAutoSend(templateType: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get templates for auto send: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.templateType, templateType),
          eq(emailTemplates.sendMode, "automatic"),
          eq(emailTemplates.ativo, 1)
        )
      )
      .orderBy(desc(emailTemplates.atualizadoEm));

    console.log(`[Database] Encontrados ${result.length} template(s) automáticos para tipo '${templateType}'`);
    return result;
  } catch (error) {
    console.error("[Database] Failed to get templates for auto send:", error);
    return [];
  }
}

/**
 * Buscar templates para envio atrasado (sendMode = "scheduled" com delay)
 * @param templateType - Tipo do template (compra_aprovada, carrinho_abandonado, etc.)
 * @returns Lista de templates ativos com sendMode = "scheduled" e sendOnLeadDelayEnabled = 1
 */
export async function getTemplatesForDelayedSend(templateType: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get templates for delayed send: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.templateType, templateType),
          eq(emailTemplates.sendOnLeadDelayEnabled, 1),
          eq(emailTemplates.ativo, 1)
        )
      )
      .orderBy(desc(emailTemplates.atualizadoEm));

    console.log(`[Database] Encontrados ${result.length} template(s) com envio atrasado para tipo '${templateType}'`);
    return result;
  } catch (error) {
    console.error("[Database] Failed to get templates for delayed send:", error);
    return [];
  }
}


/**
 * Obter estatísticas de chargebacks (leads com status abandonado)
 */
export async function getChargebackStats() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get chargeback stats: database not available");
    return { total: 0, recent: 0 };
  }

  try {
    // Total de chargebacks/abandonados
    const [totalResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads)
      .where(eq(leads.leadType, "carrinho_abandonado"));

    // Chargebacks nos últimos 7 dias
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const [recentResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads)
      .where(
        and(
          eq(leads.leadType, "carrinho_abandonado"),
          sql`${leads.dataCriacao} >= ${sevenDaysAgo}`
        )
      );

    return {
      total: Number(totalResult?.count || 0),
      recent: Number(recentResult?.count || 0),
    };
  } catch (error) {
    console.error("[Database] Failed to get chargeback stats:", error);
    return { total: 0, recent: 0 };
  }
}


// ==================== FUNÇÕES DE FUNIS ====================

/**
 * Listar todos os funis
 */
export async function getAllFunnels() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get funnels: database not available");
    return [];
  }

  try {
    return await db.select().from(funnels).orderBy(desc(funnels.criadoEm));
  } catch (error) {
    console.error("[Database] Failed to get funnels:", error);
    return [];
  }
}

/**
 * Criar um novo funil
 */
export async function createFunnel(data: {
  nome: string;
  targetStatusPlataforma: string;
  targetSituacao: string;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create funnel: database not available");
    return null;
  }

  try {
    const [newFunnel] = await db.insert(funnels).values({
      nome: data.nome,
      targetStatusPlataforma: data.targetStatusPlataforma,
      targetSituacao: data.targetSituacao,
    }).returning();

    // Criar primeiro template vazio automaticamente
    await db.insert(funnelTemplates).values({
      funnelId: newFunnel.id,
      nome: "Primeiro Email",
      assunto: "Assunto do email",
      htmlContent: "<p>Conteúdo do email</p>",
      posicao: 1,
      delayValue: 0,
      delayUnit: "days",
    });

    return newFunnel;
  } catch (error) {
    console.error("[Database] Failed to create funnel:", error);
    return null;
  }
}

/**
 * Obter funil por ID
 */
export async function getFunnelById(funnelId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get funnel: database not available");
    return null;
  }

  try {
    const [funnel] = await db.select().from(funnels).where(eq(funnels.id, funnelId));
    return funnel || null;
  } catch (error) {
    console.error("[Database] Failed to get funnel:", error);
    return null;
  }
}

/**
 * Obter funil com seus templates
 */
export async function getFunnelWithTemplates(funnelId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get funnel with templates: database not available");
    return { funnel: null, templates: [] };
  }

  try {
    const [funnel] = await db.select().from(funnels).where(eq(funnels.id, funnelId));
    const templates = await db.select()
      .from(funnelTemplates)
      .where(eq(funnelTemplates.funnelId, funnelId))
      .orderBy(asc(funnelTemplates.posicao));
    return { funnel: funnel || null, templates };
  } catch (error) {
    console.error("[Database] Failed to get funnel with templates:", error);
    return { funnel: null, templates: [] };
  }
}

/**
 * Toggle ativo do funil
 */
export async function toggleFunnelActive(funnelId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot toggle funnel: database not available");
    return { success: false };
  }

  try {
    const [current] = await db.select().from(funnels).where(eq(funnels.id, funnelId));
    if (!current) return { success: false };

    await db.update(funnels)
      .set({ ativo: current.ativo === 1 ? 0 : 1, atualizadoEm: new Date() })
      .where(eq(funnels.id, funnelId));
    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to toggle funnel:", error);
    return { success: false };
  }
}

/**
 * Deletar funil
 */
export async function deleteFunnel(funnelId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete funnel: database not available");
    return { success: false };
  }

  try {
    await db.delete(funnels).where(eq(funnels.id, funnelId));
    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to delete funnel:", error);
    return { success: false };
  }
}

/**
 * Atualizar funil
 */
export async function updateFunnel(funnelId: number, updates: Partial<{
  nome: string;
  descricao: string;
  targetStatusPlataforma: string;
  targetSituacao: string;
}>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update funnel: database not available");
    return { success: false };
  }

  try {
    await db.update(funnels)
      .set({ ...updates, atualizadoEm: new Date() })
      .where(eq(funnels.id, funnelId));
    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to update funnel:", error);
    return { success: false };
  }
}

// ==================== FUNÇÕES DE TEMPLATES DE FUNIL ====================

/**
 * Criar template no funil
 */
export async function createFunnelTemplate(data: {
  funnelId: number;
  delayValue: number;
  delayUnit: string;
  sendTime?: string;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create funnel template: database not available");
    return null;
  }

  try {
    // Obter maior posição atual
    const result = await db.select({ maxPosicao: sql<number>`COALESCE(MAX(posicao), 0)` })
      .from(funnelTemplates)
      .where(eq(funnelTemplates.funnelId, data.funnelId));

    const newPosicao = (result[0]?.maxPosicao ?? 0) + 1;

    const [newTemplate] = await db.insert(funnelTemplates).values({
      funnelId: data.funnelId,
      nome: `Email ${newPosicao}`,
      assunto: "Assunto do email",
      htmlContent: "<p>Conteúdo do email</p>",
      posicao: newPosicao,
      delayValue: data.delayValue,
      delayUnit: data.delayUnit,
      sendTime: data.sendTime || null,
    }).returning();

    return newTemplate;
  } catch (error) {
    console.error("[Database] Failed to create funnel template:", error);
    return null;
  }
}

/**
 * Atualizar template do funil
 */
export async function updateFunnelTemplate(templateId: number, updates: Partial<{
  nome: string;
  assunto: string;
  htmlContent: string;
  delayValue: number;
  delayUnit: string;
  sendTime: string;
}>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update funnel template: database not available");
    return { success: false };
  }

  try {
    await db.update(funnelTemplates)
      .set({ ...updates, atualizadoEm: new Date() })
      .where(eq(funnelTemplates.id, templateId));
    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to update funnel template:", error);
    return { success: false };
  }
}

/**
 * Toggle ativo do template do funil
 */
export async function toggleFunnelTemplateActive(templateId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot toggle funnel template: database not available");
    return { success: false };
  }

  try {
    const [current] = await db.select().from(funnelTemplates).where(eq(funnelTemplates.id, templateId));
    if (!current) return { success: false };

    await db.update(funnelTemplates)
      .set({ ativo: current.ativo === 1 ? 0 : 1, atualizadoEm: new Date() })
      .where(eq(funnelTemplates.id, templateId));
    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to toggle funnel template:", error);
    return { success: false };
  }
}

/**
 * Deletar template do funil
 */
export async function deleteFunnelTemplate(templateId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete funnel template: database not available");
    return { success: false };
  }

  try {
    await db.delete(funnelTemplates).where(eq(funnelTemplates.id, templateId));
    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to delete funnel template:", error);
    return { success: false };
  }
}

/**
 * Obter template do funil por ID
 */
export async function getFunnelTemplateById(templateId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get funnel template: database not available");
    return null;
  }

  try {
    const [template] = await db.select().from(funnelTemplates).where(eq(funnelTemplates.id, templateId));
    return template || null;
  } catch (error) {
    console.error("[Database] Failed to get funnel template:", error);
    return null;
  }
}

/**
 * Obter primeiro lead para preview
 */
export async function getFirstLead() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get first lead: database not available");
    return null;
  }

  try {
    const [lead] = await db.select().from(leads).limit(1);
    return lead || null;
  } catch (error) {
    console.error("[Database] Failed to get first lead:", error);
    return null;
  }
}

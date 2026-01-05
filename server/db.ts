import { asc, desc, eq, sql, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { autoSendConfig, emailTemplates, InsertEmailTemplate, InsertLead, InsertUser, Lead, leads, users } from "../drizzle/schema_postgresql";
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

export async function getLeadsWithPagination(
  page: number = 1,
  emailStatus?: 'pending' | 'sent',
  search?: string,
  leadStatus?: 'active' | 'abandoned',
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
    
    // Filtro de status de lead (ativo vs carrinho abandonado)
    if (leadStatus === 'active') {
      conditions.push(eq(leads.status, 'active'));
    } else if (leadStatus === 'abandoned') {
      conditions.push(eq(leads.status, 'abandoned'));
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

    // Contar total de registros com o filtro
    let countQueryWithFilter = db.select({ count: sql`COUNT(*)` }).from(leads);
    
    if (conditions.length > 0) {
      countQueryWithFilter = countQueryWithFilter.where(and(...conditions));
    }

    const [countResult] = await countQueryWithFilter;
    const total = Number(countResult?.count || 0);

    // Determinar ordenação
    const orderByClause = sortDirection === 'asc' 
      ? asc(leads.dataCriacao)
      : desc(leads.dataCriacao);

    // Buscar leads com paginação
    let resultData;
    if (search) {
      // Para buscas, retorna todos os resultados encontrados
      resultData = await query
        .orderBy(orderByClause);
    } else {
      // Para listagem normal, aplica paginação
      resultData = await query
        .orderBy(orderByClause)
        .limit(pageSize)
        .offset(offset);
    }

    return {
      leads: resultData,
      total,
      page,
      pageSize: search ? resultData.length : pageSize,
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
  result = result.replace(/\{\{valor\}\}/g, lead.valor ? `R$ ${Number(lead.valor).toFixed(2).replace(".", ",")}` : "R$ 0,00");
  result = result.replace(/\{\{data_compra\}\}/g, lead.dataAprovacao ? new Date(lead.dataAprovacao).toLocaleDateString("pt-BR") : "");
  result = result.replace(/\{\{year\}\}/g, currentYear.toString());
  
  // Variáveis em formato {VARIAVEL}
  result = result.replace(/\{CUSTOMER_NAME\}/g, lead.nome || "");
  result = result.replace(/\{CUSTOMER_EMAIL\}/g, lead.email || "");
  result = result.replace(/\{PRODUCT_NAME\}/g, lead.produto || "");
  result = result.replace(/\{PLAN_NAME\}/g, lead.plano || "");
  result = result.replace(/\{SALE_VALUE\}/g, lead.valor ? `R$ ${Number(lead.valor).toFixed(2).replace(".", ",")}` : "R$ 0,00");
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

export async function updateAllLeadsManualSendSelection(selected: boolean) {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.update(leads)
      .set({ selectedForManualSend: selected ? 1 : 0 });
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
export async function getLeadsAccessStats() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get access stats: database not available");
    return { total: 0, accessed: 0, notAccessed: 0 };
  }

  try {
    const { count, eq, sql } = await import("drizzle-orm");
    
    // Contar total de leads
    const [totalResult] = await db.select({ count: sql`COUNT(*)` }).from(leads);
    const total = Number(totalResult?.count || 0);
    
    // Contar leads que acessaram
    const [accessedResult] = await db
      .select({ count: sql`COUNT(*)` })
      .from(leads)
      .where(eq(leads.hasAccessedPlatform, 1));
    const accessed = Number(accessedResult?.count || 0);
    
    // Contar leads que não acessaram
    const notAccessed = total - accessed;
    
    return {
      total,
      accessed,
      notAccessed,
    };
  } catch (error) {
    console.error("[Database] Failed to get access stats:", error);
    return { total: 0, accessed: 0, notAccessed: 0 };
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
 * Atualizar templateAppliedAt
 */
export async function updateTemplateAppliedAt(leadId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update lead: database not available");
    return false;
  }

  try {
    await db
      .update(leads)
      .set({ templateAppliedAt: new Date() })
      .where(eq(leads.id, leadId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update templateAppliedAt:", error);
    return false;
  }
}

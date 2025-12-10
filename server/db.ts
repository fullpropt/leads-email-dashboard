import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { autoSendConfig, emailTemplates, InsertEmailTemplate, InsertLead, InsertUser, Lead, leads, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, {
        mode: 'default',
      });
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({
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
  status?: 'pending' | 'sent',
  search?: string
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
    
    if (status === 'pending') {
      conditions.push(eq(leads.emailEnviado, 0));
    } else if (status === 'sent') {
      conditions.push(eq(leads.emailEnviado, 1));
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
      // @ts-ignore - and() aceita múltiplos argumentos
      const { and } = await import("drizzle-orm");
      query = query.where(and(...conditions));
    }

    // Contar total de registros com o filtro (BUSCA EM TODO O BANCO DE DADOS)
    let countQueryWithFilter = db.select({ count: sql`COUNT(*)` }).from(leads);
    
    if (conditions.length > 0) {
      // @ts-ignore
      const { and } = await import("drizzle-orm");
      countQueryWithFilter = countQueryWithFilter.where(and(...conditions));
    }

    const [countResult] = await countQueryWithFilter;
    const total = Number(countResult?.count || 0);

    // Buscar leads com paginação (RETORNA TODOS OS RESULTADOS ENCONTRADOS, NÃO APENAS OS 30 DA PÁGINA)
    // Se houver busca, retorna todos os resultados encontrados sem limitar a 30
    let result;
    if (search) {
      // Para buscas, retorna todos os resultados encontrados
      result = await query
        .orderBy(desc(leads.dataCriacao));
    } else {
      // Para listagem normal, aplica paginação
      result = await query
        .orderBy(desc(leads.dataCriacao))
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
export async function getAutoSendStatus() {
  const db = await getDb();
  if (!db) return false;
  
  try {
    const result = await db
      .select()
      .from(autoSendConfig)
      .limit(1);
    
    return result.length > 0 ? result[0].ativo === 1 : false;
  } catch (error) {
    console.error("[Database] Failed to get auto send status:", error);
    return false;
  }
}

export async function toggleAutoSend(ativo: boolean) {
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
        ativo: ativo ? 1 : 0,
      });
    } else {
      await db
        .update(autoSendConfig)
        .set({ ativo: ativo ? 1 : 0 })
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

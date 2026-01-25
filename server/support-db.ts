/**
 * Funções de banco de dados para o sistema de suporte por email
 */

import { eq, desc, asc, sql, and, isNull, inArray } from "drizzle-orm";
import { getDb } from "./db";
import {
  supportEmails,
  supportEmailGroups,
  supportEmailResponses,
  supportResponseHistory,
  type SupportEmail,
  type SupportEmailGroup,
  type SupportEmailResponse,
  type InsertSupportEmail,
  type InsertSupportEmailGroup,
  type InsertSupportEmailResponse,
} from "../drizzle/schema_postgresql";

// ==================== EMAILS DE SUPORTE ====================

/**
 * Criar um novo email de suporte (recebido via webhook)
 */
export async function createSupportEmail(data: InsertSupportEmail): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db.insert(supportEmails).values(data).returning({ id: supportEmails.id });
    console.log("[Support DB] ✅ Email de suporte criado:", result[0]?.id);
    return result[0]?.id || null;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao criar email de suporte:", error);
    return null;
  }
}

/**
 * Buscar email de suporte por ID
 */
export async function getSupportEmailById(id: number): Promise<SupportEmail | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db.select().from(supportEmails).where(eq(supportEmails.id, id)).limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao buscar email:", error);
    return null;
  }
}

/**
 * Buscar email por message_id do Mailgun (para evitar duplicatas)
 */
export async function getSupportEmailByMessageId(messageId: string): Promise<SupportEmail | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db
      .select()
      .from(supportEmails)
      .where(eq(supportEmails.messageId, messageId))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao buscar email por messageId:", error);
    return null;
  }
}

/**
 * Listar todos os emails de suporte com paginação
 */
export async function getSupportEmails(
  page: number = 1,
  limit: number = 50,
  status?: string,
  groupId?: number
): Promise<{ emails: SupportEmail[]; total: number; pages: number }> {
  try {
    const db = await getDb();
    if (!db) return { emails: [], total: 0, pages: 0 };

    const offset = (page - 1) * limit;
    const conditions = [];

    if (status) {
      conditions.push(eq(supportEmails.status, status));
    }
    if (groupId !== undefined) {
      conditions.push(eq(supportEmails.groupId, groupId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [emails, countResult] = await Promise.all([
      db
        .select()
        .from(supportEmails)
        .where(whereClause)
        .orderBy(desc(supportEmails.receivedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(supportEmails)
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.count || 0);
    const pages = Math.ceil(total / limit);

    return { emails, total, pages };
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao listar emails:", error);
    return { emails: [], total: 0, pages: 0 };
  }
}

/**
 * Buscar emails não agrupados (pendentes de classificação)
 */
export async function getUngroupedSupportEmails(): Promise<SupportEmail[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const result = await db
      .select()
      .from(supportEmails)
      .where(isNull(supportEmails.groupId))
      .orderBy(desc(supportEmails.receivedAt));

    return result;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao buscar emails não agrupados:", error);
    return [];
  }
}

/**
 * Atualizar grupo de um email
 */
export async function updateSupportEmailGroup(emailId: number, groupId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db
      .update(supportEmails)
      .set({ groupId, status: "grouped", updatedAt: new Date() })
      .where(eq(supportEmails.id, emailId));

    return true;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao atualizar grupo do email:", error);
    return false;
  }
}

/**
 * Atualizar múltiplos emails para um grupo
 */
export async function assignEmailsToGroup(emailIds: number[], groupId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db
      .update(supportEmails)
      .set({ groupId, status: "grouped", updatedAt: new Date() })
      .where(inArray(supportEmails.id, emailIds));

    // Atualizar contagem do grupo
    await updateGroupCounts(groupId);

    return true;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao atribuir emails ao grupo:", error);
    return false;
  }
}

/**
 * Marcar email como respondido
 */
export async function markEmailAsResponded(emailId: number, responseId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db
      .update(supportEmails)
      .set({
        status: "responded",
        responseId,
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(supportEmails.id, emailId));

    return true;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao marcar email como respondido:", error);
    return false;
  }
}

// ==================== GRUPOS DE EMAIL ====================

/**
 * Criar um novo grupo de emails
 */
export async function createSupportEmailGroup(data: InsertSupportEmailGroup): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db
      .insert(supportEmailGroups)
      .values(data)
      .returning({ id: supportEmailGroups.id });

    console.log("[Support DB] ✅ Grupo criado:", result[0]?.id);
    return result[0]?.id || null;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao criar grupo:", error);
    return null;
  }
}

/**
 * Buscar grupo por ID
 */
export async function getSupportEmailGroupById(id: number): Promise<SupportEmailGroup | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db
      .select()
      .from(supportEmailGroups)
      .where(eq(supportEmailGroups.id, id))
      .limit(1);

    return result[0] || null;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao buscar grupo:", error);
    return null;
  }
}

/**
 * Listar todos os grupos
 */
export async function getSupportEmailGroups(
  status?: string
): Promise<SupportEmailGroup[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const conditions = [];
    if (status) {
      conditions.push(eq(supportEmailGroups.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await db
      .select()
      .from(supportEmailGroups)
      .where(whereClause)
      .orderBy(desc(supportEmailGroups.updatedAt));

    return result;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao listar grupos:", error);
    return [];
  }
}

/**
 * Atualizar contagens de um grupo
 */
export async function updateGroupCounts(groupId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    // Contar emails no grupo
    const [totalResult, pendingResult] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(supportEmails)
        .where(eq(supportEmails.groupId, groupId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(supportEmails)
        .where(and(eq(supportEmails.groupId, groupId), eq(supportEmails.status, "grouped"))),
    ]);

    const emailCount = Number(totalResult[0]?.count || 0);
    const pendingCount = Number(pendingResult[0]?.count || 0);

    await db
      .update(supportEmailGroups)
      .set({ emailCount, pendingCount, updatedAt: new Date() })
      .where(eq(supportEmailGroups.id, groupId));

    return true;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao atualizar contagens do grupo:", error);
    return false;
  }
}

/**
 * Atualizar grupo com dados da IA
 */
export async function updateGroupWithAIData(
  groupId: number,
  data: {
    aiSummary?: string;
    aiKeywords?: string;
    aiSentiment?: string;
    aiPriority?: string;
    suggestedResponseId?: number;
  }
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db
      .update(supportEmailGroups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supportEmailGroups.id, groupId));

    return true;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao atualizar grupo com dados da IA:", error);
    return false;
  }
}

/**
 * Buscar emails de um grupo específico
 */
export async function getEmailsByGroupId(groupId: number): Promise<SupportEmail[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const result = await db
      .select()
      .from(supportEmails)
      .where(eq(supportEmails.groupId, groupId))
      .orderBy(desc(supportEmails.receivedAt));

    return result;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao buscar emails do grupo:", error);
    return [];
  }
}

// ==================== RESPOSTAS ====================

/**
 * Criar uma nova resposta
 */
export async function createSupportResponse(data: InsertSupportEmailResponse): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db
      .insert(supportEmailResponses)
      .values(data)
      .returning({ id: supportEmailResponses.id });

    console.log("[Support DB] ✅ Resposta criada:", result[0]?.id);
    return result[0]?.id || null;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao criar resposta:", error);
    return null;
  }
}

/**
 * Buscar resposta por ID
 */
export async function getSupportResponseById(id: number): Promise<SupportEmailResponse | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db
      .select()
      .from(supportEmailResponses)
      .where(eq(supportEmailResponses.id, id))
      .limit(1);

    return result[0] || null;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao buscar resposta:", error);
    return null;
  }
}

/**
 * Atualizar uma resposta
 */
export async function updateSupportResponse(
  id: number,
  data: Partial<InsertSupportEmailResponse>
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db
      .update(supportEmailResponses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supportEmailResponses.id, id));

    return true;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao atualizar resposta:", error);
    return false;
  }
}

/**
 * Buscar resposta sugerida para um grupo
 */
export async function getGroupSuggestedResponse(groupId: number): Promise<SupportEmailResponse | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db
      .select()
      .from(supportEmailResponses)
      .where(eq(supportEmailResponses.groupId, groupId))
      .orderBy(desc(supportEmailResponses.createdAt))
      .limit(1);

    return result[0] || null;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao buscar resposta sugerida:", error);
    return null;
  }
}

/**
 * Registrar histórico de envio de resposta
 */
export async function createResponseHistory(data: {
  responseId: number;
  emailId: number;
  recipientEmail: string;
  subject: string;
  status: string;
  errorMessage?: string;
}): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const result = await db
      .insert(supportResponseHistory)
      .values(data)
      .returning({ id: supportResponseHistory.id });

    return result[0]?.id || null;
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao criar histórico de resposta:", error);
    return null;
  }
}

// ==================== ESTATÍSTICAS ====================

/**
 * Obter estatísticas gerais do suporte
 */
export async function getSupportStats(): Promise<{
  totalEmails: number;
  pendingEmails: number;
  groupedEmails: number;
  respondedEmails: number;
  totalGroups: number;
  activeGroups: number;
}> {
  try {
    const db = await getDb();
    if (!db) {
      return {
        totalEmails: 0,
        pendingEmails: 0,
        groupedEmails: 0,
        respondedEmails: 0,
        totalGroups: 0,
        activeGroups: 0,
      };
    }

    const [
      totalEmailsResult,
      pendingEmailsResult,
      groupedEmailsResult,
      respondedEmailsResult,
      totalGroupsResult,
      activeGroupsResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(supportEmails),
      db.select({ count: sql<number>`count(*)` }).from(supportEmails).where(eq(supportEmails.status, "pending")),
      db.select({ count: sql<number>`count(*)` }).from(supportEmails).where(eq(supportEmails.status, "grouped")),
      db.select({ count: sql<number>`count(*)` }).from(supportEmails).where(eq(supportEmails.status, "responded")),
      db.select({ count: sql<number>`count(*)` }).from(supportEmailGroups),
      db.select({ count: sql<number>`count(*)` }).from(supportEmailGroups).where(eq(supportEmailGroups.status, "active")),
    ]);

    return {
      totalEmails: Number(totalEmailsResult[0]?.count || 0),
      pendingEmails: Number(pendingEmailsResult[0]?.count || 0),
      groupedEmails: Number(groupedEmailsResult[0]?.count || 0),
      respondedEmails: Number(respondedEmailsResult[0]?.count || 0),
      totalGroups: Number(totalGroupsResult[0]?.count || 0),
      activeGroups: Number(activeGroupsResult[0]?.count || 0),
    };
  } catch (error) {
    console.error("[Support DB] ❌ Erro ao buscar estatísticas:", error);
    return {
      totalEmails: 0,
      pendingEmails: 0,
      groupedEmails: 0,
      respondedEmails: 0,
      totalGroups: 0,
      activeGroups: 0,
    };
  }
}

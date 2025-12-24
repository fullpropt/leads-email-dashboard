import { pgTable, serial, varchar, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Tabela refatorada para armazenar templates de email com suporte a múltiplos tipos de envio
 * Permite: envio imediato, envio automático por lead, e envio agendado
 */
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  assunto: varchar("assunto", { length: 500 }).notNull(),
  htmlContent: text("html_content").notNull(),
  
  // ===== CONTROLES DE ENVIO IMEDIATO =====
  // Permite enviar o email manualmente para todos os leads pendentes
  sendImmediateEnabled: integer("send_immediate_enabled").notNull().default(0), // 0 = desativado, 1 = ativado
  
  // ===== CONTROLES DE ENVIO AUTOMÁTICO POR LEAD =====
  // Quando um novo lead é criado, este template é enviado automaticamente
  autoSendOnLeadEnabled: integer("auto_send_on_lead_enabled").notNull().default(0), // 0 = desativado, 1 = ativado
  
  // ===== CONTROLES DE ENVIO AGENDADO =====
  // Envia o email em horários específicos e intervalos regulares
  scheduleEnabled: integer("schedule_enabled").notNull().default(0), // 0 = desativado, 1 = ativado
  scheduleTime: varchar("schedule_time", { length: 5 }), // formato HH:MM
  scheduleInterval: integer("schedule_interval").notNull().default(1), // intervalo em dias
  scheduleIntervalType: varchar("schedule_interval_type", { length: 10 }).notNull().default("days"), // "days" ou "weeks"
  lastSentAt: timestamp("last_sent_at"), // última vez que foi enviado
  nextSendAt: timestamp("next_send_at"), // próxima data de envio
  
  // ===== METADADOS =====
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().notNull(),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

/**
 * Tabela para armazenar histórico de envios de emails
 * Permite rastrear quais emails foram enviados, para quem e quando
 */
export const emailSendHistory = pgTable("email_send_history", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull(),
  leadId: integer("lead_id").notNull(),
  sendType: varchar("send_type", { length: 20 }).notNull(), // "immediate", "auto_lead", "scheduled"
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  status: varchar("status", { length: 20 }).notNull().default("sent"), // "sent", "failed", "bounced"
  errorMessage: text("error_message"), // mensagem de erro se houver
});

export type EmailSendHistory = typeof emailSendHistory.$inferSelect;
export type InsertEmailSendHistory = typeof emailSendHistory.$inferInsert;

/**
 * Tabela para armazenar configuração de auto-envio de emails
 * DESCONTINUADA: Use sendImmediateEnabled, autoSendOnLeadEnabled e scheduleEnabled nos templates
 */
export const autoSendConfig = pgTable("auto_send_config", {
  id: serial("id").primaryKey(),
  ativo: integer("ativo").notNull().default(0), // 0 = desativado, 1 = ativado
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().notNull(),
});

export type AutoSendConfig = typeof autoSendConfig.$inferSelect;
export type InsertAutoSendConfig = typeof autoSendConfig.$inferInsert;

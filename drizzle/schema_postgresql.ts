import { pgTable, serial, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Tabela de usuários para autenticação e controle de acesso
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /**
   * Manus OAuth identifier (openId) retornado do callback OAuth.
   * Único por usuário.
   */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 10 }).notNull().default("user"), // "user" ou "admin"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tabela de leads capturados (ex: do PerfectPay)
 */
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  produto: text("produto"),
  plano: text("plano"),
  valor: integer("valor").notNull().default(0), // valor em centavos
  dataAprovacao: timestamp("data_aprovacao"),
  dataCriacao: timestamp("data_criacao").defaultNow().notNull(),
  emailEnviado: integer("email_enviado").notNull().default(0), // 0 = não enviado, 1 = enviado
  dataEnvioEmail: timestamp("data_envio_email"),
  selectedForManualSend: integer("selected_for_manual_send").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("active"), // "active" = compra aprovada, "abandoned" = carrinho abandonado
  nextEmailSendAt: timestamp("next_email_send_at"), // Próxima data para enviar email com atraso
  hasAccessedPlatform: integer("has_accessed_platform").notNull().default(0), // 0 = não acessou, 1 = acessou o TubeTools
  
  // ===== NOVOS CAMPOS PARA TIPOS DE LEADS =====
  leadType: varchar("lead_type", { length: 50 }).notNull().default("compra_aprovada"), // "compra_aprovada", "novo_cadastro", "carrinho_abandonado"
  templateAppliedAt: timestamp("template_applied_at"), // Rastreia quando o template foi aplicado ao lead
  isNewLeadAfterUpdate: integer("is_new_lead_after_update").notNull().default(1), // 1 = lead criado após mudanças, 0 = lead antigo
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

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
  ativo: integer("ativo").notNull().default(1), // 0 = inativo, 1 = ativo
  // Permite enviar o email manualmente para todos os leads pendentes
  sendImmediateEnabled: integer("send_immediate_enabled").notNull().default(0), // 0 = desativado, 1 = ativado
  
  // ===== CONTROLES DE ENVIO AUTOMÁTICO POR LEAD =====
  // Quando um novo lead é criado, este template é enviado automaticamente
  autoSendOnLeadEnabled: integer("auto_send_on_lead_enabled").notNull().default(0), // 0 = desativado, 1 = ativado
  
  // ===== CONTROLES DE ENVIO ATRASADO POR LEAD =====
  // Envia o email X dias após o lead ser criado
  sendOnLeadDelayEnabled: integer("send_on_lead_delay_enabled").notNull().default(0), // 0 = desativado, 1 = ativado
  delayDaysAfterLeadCreation: integer("delay_days_after_lead_creation").notNull().default(0), // número de dias para aguardar
  
  // ===== CONTROLES DE ENVIO AGENDADO =====
  // Envia o email em horários específicos e intervalos regulares
  scheduleEnabled: integer("schedule_enabled").notNull().default(0), // 0 = desativado, 1 = ativado
  scheduleTime: varchar("schedule_time", { length: 5 }), // formato HH:MM
  scheduleInterval: integer("schedule_interval").notNull().default(1), // intervalo em dias
  scheduleIntervalType: varchar("schedule_interval_type", { length: 10 }).notNull().default("days"), // "days" ou "weeks"
  lastSentAt: timestamp("last_sent_at"), // última vez que foi enviado
  nextSendAt: timestamp("next_send_at"), // próxima data de envio
  
  // ===== NOVOS CAMPOS PARA TIPOS DE TEMPLATES =====
  templateType: varchar("template_type", { length: 50 }).notNull().default("compra_aprovada"), // "compra_aprovada", "novo_cadastro", "programado", "carrinho_abandonado"
  
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
 * Controla se o envio automático de emails para novos leads está ativado
 */
export const autoSendConfig = pgTable("auto_send_config", {
  id: serial("id").primaryKey(),
  autoSendEnabled: integer("auto_send_enabled").notNull().default(0), // 0 = desativado, 1 = ativado - NOVA CHAVE
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().notNull(),
});

export type AutoSendConfig = typeof autoSendConfig.$inferSelect;
export type InsertAutoSendConfig = typeof autoSendConfig.$inferInsert;

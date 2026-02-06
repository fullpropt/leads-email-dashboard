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
  isNewLeadAfterUpdate: integer("is_new_lead_after_update").notNull().default(1), // 1 = lead criado após mudanças, 0 = lead antigo
  
  // ===== FUSO HORÁRIO DO LEAD =====
  timezone: varchar("timezone", { length: 50 }).default("America/Sao_Paulo"), // Fuso horário do lead (IANA timezone, ex: "America/Sao_Paulo", "America/New_York")
  
  // ===== CAMPOS DE UNSUBSCRIBE =====
  unsubscribed: integer("unsubscribed").notNull().default(0), // 0 = inscrito, 1 = cancelou inscrição
  unsubscribedAt: timestamp("unsubscribed_at"), // Data do cancelamento
  unsubscribeToken: varchar("unsubscribe_token", { length: 64 }), // Token único para link de unsubscribe
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
  
  // ===== CONTROLE DE ATIVAÇÃO INDIVIDUAL =====
  ativo: integer("ativo").notNull().default(1), // 0 = inativo, 1 = ativo (INDEPENDENTE POR TEMPLATE)
  
  // ===== FILTROS DE DESTINATÁRIOS =====
  // Define quais leads receberão este template
  targetStatusPlataforma: varchar("target_status_plataforma", { length: 20 }).notNull().default("all"), // "all", "accessed", "not_accessed"
  targetSituacao: varchar("target_situacao", { length: 20 }).notNull().default("all"), // "all", "active", "abandoned"
  
  // ===== MODO DE ENVIO =====
  // Define como o template será enviado
  sendMode: varchar("send_mode", { length: 20 }).notNull().default("manual"), // "automatic", "scheduled", "manual"
  
  // ===== CONTROLES DE ENVIO IMEDIATO =====
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
  
  // ===== TIPO DE TEMPLATE (LEGADO - mantido para compatibilidade) =====
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
  sendType: varchar("send_type", { length: 20 }).notNull(), // "immediate", "auto_lead", "scheduled", "funnel"
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  status: varchar("status", { length: 20 }).notNull().default("sent"), // "sent", "failed", "bounced"
  errorMessage: text("error_message"), // mensagem de erro se houver
  funnelId: integer("funnel_id"), // ID do funil (se for envio de funil)
  funnelTemplateId: integer("funnel_template_id"), // ID do template do funil (se for envio de funil)
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


// ==================== TABELAS DE FUNIS ====================

/**
 * Tabela de Funis de Email
 * Um funil é um agrupamento de templates programados em sequência
 */
export const funnels = pgTable("funnels", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  targetStatusPlataforma: varchar("target_status_plataforma", { length: 20 }).notNull().default("all"),
  targetSituacao: varchar("target_situacao", { length: 20 }).notNull().default("all"),
  ativo: integer("ativo").notNull().default(1),
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().notNull(),
});

export type Funnel = typeof funnels.$inferSelect;
export type InsertFunnel = typeof funnels.$inferInsert;

/**
 * Templates dentro de um Funil
 * Cada template tem uma posição na sequência e um delay em relação ao anterior
 */
export const funnelTemplates = pgTable("funnel_templates", {
  id: serial("id").primaryKey(),
  funnelId: integer("funnel_id").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  assunto: varchar("assunto", { length: 500 }).notNull(),
  htmlContent: text("html_content").notNull(),
  posicao: integer("posicao").notNull().default(1), // posição na sequência do funil
  delayValue: integer("delay_value").notNull().default(0),
  delayUnit: varchar("delay_unit", { length: 10 }).notNull().default("days"),
  sendTime: varchar("send_time", { length: 5 }),
  ativo: integer("ativo").notNull().default(1),
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().notNull(),
});

export type FunnelTemplate = typeof funnelTemplates.$inferSelect;
export type InsertFunnelTemplate = typeof funnelTemplates.$inferInsert;

/**
 * Progresso do Lead no Funil
 * Rastreia em qual etapa do funil cada lead está
 */
export const funnelLeadProgress = pgTable("funnel_lead_progress", {
  id: serial("id").primaryKey(),
  funnelId: integer("funnel_id").notNull(),
  leadId: integer("lead_id").notNull(),
  currentTemplateId: integer("current_template_id"),
  nextTemplateId: integer("next_template_id"),
  nextSendAt: timestamp("next_send_at"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().notNull(),
});

export type FunnelLeadProgress = typeof funnelLeadProgress.$inferSelect;
export type InsertFunnelLeadProgress = typeof funnelLeadProgress.$inferInsert;


// ==================== TABELAS DE SUPORTE POR EMAIL ====================

/**
 * Grupos de emails de suporte
 * Agrupa emails similares classificados pela IA
 */
export const supportEmailGroups = pgTable("support_email_groups", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  categoria: varchar("categoria", { length: 100 }), // ex: "billing", "technical", "account", "general"
  aiSummary: text("ai_summary"), // Resumo gerado pela IA sobre o grupo
  aiKeywords: text("ai_keywords"), // Palavras-chave identificadas pela IA (JSON array)
  aiSentiment: varchar("ai_sentiment", { length: 20 }), // "positive", "negative", "neutral"
  aiPriority: varchar("ai_priority", { length: 20 }).notNull().default("normal"), // "low", "normal", "high", "urgent"
  suggestedResponseId: integer("suggested_response_id"), // Resposta sugerida pela IA
  emailCount: integer("email_count").notNull().default(0),
  pendingCount: integer("pending_count").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("active"), // "active", "archived"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SupportEmailGroup = typeof supportEmailGroups.$inferSelect;
export type InsertSupportEmailGroup = typeof supportEmailGroups.$inferInsert;

/**
 * Emails de suporte recebidos via Webhook Mailgun
 */
export const supportEmails = pgTable("support_emails", {
  id: serial("id").primaryKey(),
  messageId: varchar("message_id", { length: 255 }).unique(), // ID único do Mailgun
  sender: varchar("sender", { length: 320 }).notNull(), // Email do remetente
  senderName: varchar("sender_name", { length: 255 }), // Nome do remetente
  recipient: varchar("recipient", { length: 320 }).notNull(), // Email de destino (suporte)
  subject: varchar("subject", { length: 500 }).notNull(),
  bodyPlain: text("body_plain"), // Corpo em texto plano
  bodyHtml: text("body_html"), // Corpo em HTML
  strippedText: text("stripped_text"), // Texto sem assinatura/citações
  strippedSignature: text("stripped_signature"), // Assinatura extraída
  attachmentCount: integer("attachment_count").notNull().default(0),
  attachments: text("attachments"), // JSON com informações dos anexos
  messageHeaders: text("message_headers"), // Headers do email (JSON)
  groupId: integer("group_id"), // Grupo ao qual pertence
  status: varchar("status", { length: 20 }).notNull().default("pending"), // "pending", "grouped", "responded", "archived"
  respondedAt: timestamp("responded_at"),
  responseId: integer("response_id"), // Resposta enviada
  mailgunTimestamp: integer("mailgun_timestamp"), // Timestamp do Mailgun
  mailgunToken: varchar("mailgun_token", { length: 100 }), // Token de verificação
  mailgunSignature: varchar("mailgun_signature", { length: 255 }), // Assinatura de verificação
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SupportEmail = typeof supportEmails.$inferSelect;
export type InsertSupportEmail = typeof supportEmails.$inferInsert;

/**
 * Respostas de suporte (geradas pela IA ou manuais)
 */
export const supportEmailResponses = pgTable("support_email_responses", {
  id: serial("id").primaryKey(),
  subject: varchar("subject", { length: 500 }).notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyPlain: text("body_plain"),
  aiGenerated: integer("ai_generated").notNull().default(1), // 1 = gerado pela IA, 0 = manual
  aiPromptUsed: text("ai_prompt_used"), // Prompt usado para gerar a resposta
  aiInstructions: text("ai_instructions"), // Instruções do usuário para a IA
  version: integer("version").notNull().default(1), // Versão da resposta (para histórico de edições)
  parentResponseId: integer("parent_response_id"), // Resposta anterior (se for edição)
  groupId: integer("group_id"), // Grupo relacionado (para respostas em massa)
  emailId: integer("email_id"), // Email específico (para resposta individual)
  status: varchar("status", { length: 20 }).notNull().default("draft"), // "draft", "approved", "sent"
  sentAt: timestamp("sent_at"),
  sentBy: varchar("sent_by", { length: 255 }), // Quem enviou
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SupportEmailResponse = typeof supportEmailResponses.$inferSelect;
export type InsertSupportEmailResponse = typeof supportEmailResponses.$inferInsert;

/**
 * Histórico de envios de respostas de suporte
 */
export const supportResponseHistory = pgTable("support_response_history", {
  id: serial("id").primaryKey(),
  responseId: integer("response_id").notNull(),
  emailId: integer("email_id").notNull(),
  recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("sent"), // "sent", "failed", "bounced"
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export type SupportResponseHistory = typeof supportResponseHistory.$inferSelect;
export type InsertSupportResponseHistory = typeof supportResponseHistory.$inferInsert;


// ==================== CONFIGURAÇÃO DE ENVIO (RATE LIMITING) ====================

/**
 * Configuração global de envio de emails
 * Controla limites diários, intervalo entre envios e status do envio gradual
 */
export const sendingConfig = pgTable("sending_config", {
  id: serial("id").primaryKey(),
  dailyLimit: integer("daily_limit").notNull().default(50), // Limite máximo de emails por dia
  intervalSeconds: integer("interval_seconds").notNull().default(30), // Intervalo mínimo entre envios (em segundos)
  enabled: integer("enabled").notNull().default(1), // 0 = pausado, 1 = ativo
  emailsSentToday: integer("emails_sent_today").notNull().default(0), // Contador de emails enviados hoje
  lastSentAt: timestamp("last_sent_at"), // Último email enviado
  lastResetDate: varchar("last_reset_date", { length: 10 }), // Data do último reset do contador (YYYY-MM-DD)
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().notNull(),
});

export type SendingConfig = typeof sendingConfig.$inferSelect;
export type InsertSendingConfig = typeof sendingConfig.$inferInsert;

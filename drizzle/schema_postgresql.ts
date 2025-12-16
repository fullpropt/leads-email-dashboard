import { serial, pgEnum, pgTable, text, timestamp, varchar, integer } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: pgEnum("role", ["user", "admin"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tabela de leads capturados do PerfectPay
 * Conecta ao banco PostgreSQL no Railway
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
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

/**
 * Tabela para armazenar templates de email HTML com agendamento
 */
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  assunto: varchar("assunto", { length: 500 }).notNull(),
  htmlContent: text("html_content").notNull(),
  ativo: integer("ativo").notNull().default(1), // 0 = inativo, 1 = ativo
  // Configurações de agendamento
  scheduleEnabled: integer("schedule_enabled").notNull().default(0), // 0 = desativado, 1 = ativado
  scheduleTime: varchar("schedule_time", { length: 5 }), // formato HH:MM
  scheduleInterval: integer("schedule_interval").notNull().default(1), // intervalo em dias
  scheduleIntervalType: varchar("schedule_interval_type", { length: 10 }).notNull().default("days"), // "days" ou "weeks"
  lastSentAt: timestamp("last_sent_at"), // última vez que foi enviado
  nextSendAt: timestamp("next_send_at"), // próxima data de envio
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().notNull(),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

/**
 * Tabela para armazenar configuração de auto-envio de emails
 */
export const autoSendConfig = pgTable("auto_send_config", {
  id: serial("id").primaryKey(),
  ativo: integer("ativo").notNull().default(0), // 0 = desativado, 1 = ativado
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizado_em").defaultNow().notNull(),
});

export type AutoSendConfig = typeof autoSendConfig.$inferSelect;
export type InsertAutoSendConfig = typeof autoSendConfig.$inferInsert;
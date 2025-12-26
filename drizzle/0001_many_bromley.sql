CREATE TABLE IF NOT EXISTS "auto_send_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"ativo" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_send_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"send_type" varchar(20) NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'sent' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" varchar(255) NOT NULL,
	"assunto" varchar(500) NOT NULL,
	"html_content" text NOT NULL,
	"ativo" integer DEFAULT 1 NOT NULL,
	"send_immediate_enabled" integer DEFAULT 0 NOT NULL,
	"auto_send_on_lead_enabled" integer DEFAULT 0 NOT NULL,
	"schedule_enabled" integer DEFAULT 0 NOT NULL,
	"schedule_time" varchar(5),
	"schedule_interval" integer DEFAULT 1 NOT NULL,
	"schedule_interval_type" varchar(10) DEFAULT 'days' NOT NULL,
	"last_sent_at" timestamp,
	"next_send_at" timestamp,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" varchar(320) NOT NULL,
	"produto" text,
	"plano" text,
	"valor" integer DEFAULT 0 NOT NULL,
	"data_aprovacao" timestamp,
	"data_criacao" timestamp DEFAULT now() NOT NULL,
	"email_enviado" integer DEFAULT 0 NOT NULL,
	"data_envio_email" timestamp,
	"selected_for_manual_send" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" varchar(10) DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);

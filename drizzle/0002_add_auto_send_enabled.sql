-- Adiciona a coluna auto_send_enabled à tabela auto_send_config
ALTER TABLE "auto_send_config" ADD COLUMN "auto_send_enabled" integer NOT NULL DEFAULT 0;

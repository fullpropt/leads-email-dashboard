-- Script para exportar dados em formato CSV (compatível com PostgreSQL)
-- Execute este comando no MySQL para gerar arquivos CSV

-- 1. Exportar users para CSV
SELECT 
    id, openId, name, email, loginMethod, role, 
    createdAt, updatedAt, lastSignedIn
FROM users 
ORDER BY id
INTO OUTFILE '/tmp/users_backup.csv'
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n';

-- 2. Exportar leads para CSV (tabela principal)
SELECT 
    id, nome, email, produto, plano, valor, 
    dataAprovacao, dataCriacao, emailEnviado, dataEnvioEmail
FROM leads 
ORDER BY id
INTO OUTFILE '/tmp/leads_backup.csv'
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n';

-- 3. Exportar email_templates para CSV
SELECT 
    id, nome, assunto, htmlContent, ativo, 
    scheduleEnabled, scheduleTime, scheduleInterval, 
    scheduleIntervalType, lastSentAt, nextSendAt, 
    criadoEm, atualizadoEm
FROM email_templates 
ORDER BY id
INTO OUTFILE '/tmp/email_templates_backup.csv'
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n';

-- 4. Exportar auto_send_config para CSV
SELECT 
    id, ativo, criadoEm, atualizadoEm
FROM auto_send_config 
ORDER BY id
INTO OUTFILE '/tmp/auto_send_config_backup.csv'
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n';

-- 5. Script para importar no PostgreSQL (execute após criar as tabelas)
-- Copie este bloco para executar no PostgreSQL:

-- COPY users (id, "openId", name, email, "loginMethod", role, "createdAt", "updatedAt", "lastSignedIn")
-- FROM '/tmp/users_backup.csv' WITH CSV HEADER;

-- COPY leads (id, nome, email, produto, plano, valor, "dataAprovacao", "dataCriacao", "emailEnviado", "dataEnvioEmail")
-- FROM '/tmp/leads_backup.csv' WITH CSV HEADER;

-- COPY "emailTemplates" (id, nome, assunto, "htmlContent", ativo, "scheduleEnabled", "scheduleTime", "scheduleInterval", "scheduleIntervalType", "lastSentAt", "nextSendAt", "criadoEm", "atualizadoEm")
-- FROM '/tmp/email_templates_backup.csv' WITH CSV HEADER;

-- COPY "autoSendConfig" (id, ativo, "criadoEm", "atualizadoEm")
-- FROM '/tmp/auto_send_config_backup.csv' WITH CSV HEADER;

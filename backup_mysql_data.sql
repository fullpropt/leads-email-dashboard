-- Backup completo das tabelas do MySQL para migração
-- Execute este script no phpMyAdmin ou MySQL Workbench

-- 1. Exportar dados da tabela users
SELECT id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn 
FROM users 
ORDER BY id;

-- 2. Exportar dados da tabela leads (principal)
SELECT id, nome, email, produto, plano, valor, dataAprovacao, dataCriacao, emailEnviado, dataEnvioEmail 
FROM leads 
ORDER BY id;

-- 3. Exportar dados da tabela email_templates
SELECT id, nome, assunto, htmlContent, ativo, scheduleEnabled, scheduleTime, 
       scheduleInterval, scheduleIntervalType, lastSentAt, nextSendAt, criadoEm, atualizadoEm 
FROM email_templates 
ORDER BY id;

-- 4. Exportar dados da tabela auto_send_config
SELECT id, ativo, criadoEm, atualizadoEm 
FROM auto_send_config 
ORDER BY id;

-- 5. Contagem de registros em cada tabela (para verificação)
SELECT 'users' as tabela, COUNT(*) as total FROM users
UNION ALL
SELECT 'leads', COUNT(*) FROM leads
UNION ALL  
SELECT 'email_templates', COUNT(*) FROM email_templates
UNION ALL
SELECT 'auto_send_config', COUNT(*) FROM auto_send_config;

-- 6. Verificação de dados críticos
SELECT 'Leads sem email' as verificacao, COUNT(*) as total 
FROM leads WHERE email IS NULL OR email = ''
UNION ALL
SELECT 'Leads com email enviado', COUNT(*) 
FROM leads WHERE emailEnviado = 1
UNION ALL
SELECT 'Templates ativos', COUNT(*) 
FROM email_templates WHERE ativo = 1;

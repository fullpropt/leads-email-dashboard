# PASSO A PASSO - EXPORTAR DADOS VIA PHPMYADMIN

## 1. Acessar phpMyAdmin na Hostgator
- Faça login no painel da Hostgator
- Procure "Bancos de Dados" ou "phpMyAdmin"
- Selecione o banco: `tuaces44_emailsperfectpay_db`

## 2. Exportar cada tabela como CSV

### Tabela: users
1. Clique na tabela `users`
2. Clique na aba "Exportar"
3. Configure:
   - Formato: CSV
   - CSV settings: 
     - Fields terminated by: `,`
     - Fields enclosed by: `"`
     - Lines terminated by: `\n`
4. Clique "Go"
5. Salve como `users_backup.csv`

### Tabela: leads (IMPORTANTE!)
1. Clique na tabela `leads`
2. Clique na aba "Exportar"
3. Configure:
   - Formato: CSV
   - Mesmas configurações CSV acima
4. Clique "Go"
5. Salve como `leads_backup.csv`

### Tabela: email_templates
1. Repita o processo para `email_templates`
2. Salve como `email_templates_backup.csv`

### Tabela: auto_send_config
1. Repita o processo para `auto_send_config`
2. Salve como `auto_send_config_backup.csv`

## 3. Verificação dos dados (opcional)
Execute estes comandos SQL no phpMyAdmin para verificar quantos registros:

```sql
-- Verificar contagem de registros
SELECT 'users' as tabela, COUNT(*) as total FROM users
UNION ALL
SELECT 'leads', COUNT(*) FROM leads
UNION ALL
SELECT 'email_templates', COUNT(*) FROM email_templates
UNION ALL
SELECT 'auto_send_config', COUNT(*) FROM auto_send_config;
```

## 4. Organizar os arquivos
Crie uma pasta `backup_mysql/` e coloque todos os arquivos CSV:
- users_backup.csv
- leads_backup.csv
- email_templates_backup.csv
- auto_send_config_backup.csv

## 5. Próximo passo
Após exportar todos os arquivos, me avise que vou:
1. Criar o schema PostgreSQL
2. Preparar scripts de importação
3. Configurar Railway

## IMPORTANTE
- A tabela `leads` é a mais crítica (seus clientes)
- Verifique se o arquivo CSV não está vazio
- Mantenha uma cópia de segurança desses arquivos

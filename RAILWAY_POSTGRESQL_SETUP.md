# CONFIGURAÇÃO POSTGRESQL NO RAILWAY

## 1. Criar Banco PostgreSQL no Railway

### Passos:
1. Acesse seu projeto no Railway
2. Clique em "+ New Service"
3. Selecione "PostgreSQL" 
4. Dê um nome: `leads-email-db`
5. Aguarde a criação (2-3 minutos)

## 2. Configurar Variáveis de Ambiente

### No Railway, vá para "Variables" e adicione:

```
DATABASE_URL=postgresql://username:password@host:port/database
```

**Onde encontrar:**
- No serviço PostgreSQL criado, clique em "Connect"
- Copie a URL de conexão completa

### Outras variáveis necessárias:
```
MAILGUN_API_KEY=04af4ed8-a24af99a
MAILGUN_DOMAIN=sandbox3feb102b722d4f81922762686c67c017.mailgun.org
VITE_GITHUB_CLIENT_ID=Ov23linHYjRctyJZRBta
GITHUB_CLIENT_SECRET=0d7cf2112066baf55a2449bf266532dc5367c175
OAUTH_SERVER_URL=https://github.com
```

## 3. Deploy Automático

Após configurar as variáveis:
1. O Railway fará deploy automático
2. O código já está configurado para PostgreSQL
3. As migrações serão executadas automaticamente

## 4. Migrar Dados (Backup CSV)

### Se você exportou os dados do MySQL:
1. No Railway Console, acesse o PostgreSQL
2. Use os comandos COPY para importar:
```sql
COPY users FROM 'users_backup.csv' WITH CSV HEADER;
COPY leads FROM 'leads_backup.csv' WITH CSV HEADER;
COPY email_templates FROM 'email_templates_backup.csv' WITH CSV HEADER;
COPY auto_send_config FROM 'auto_send_config_backup.csv' WITH CSV HEADER;
```

## 5. Verificação

Após o deploy:
1. Verifique se a aplicação inicia sem erros
2. Teste a funcionalidade de email templates
3. Confirme que os dados foram migrados (se aplicável)

## 6. Troubleshooting

### Erros comuns:
- **DATABASE_URL inválida**: Verifique se copiou a URL completa do Railway
- **Variáveis faltando**: Confirme todas as variáveis de ambiente
- **Timeout de conexão**: PostgreSQL deve resolver isso

### Logs para verificar:
- Railway Console logs
- Database connection logs
- Application startup logs

## Próximo Passo
Após criar o PostgreSQL no Railway, me avise que faremos o deploy e teste final!

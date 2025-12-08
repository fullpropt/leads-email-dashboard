# Dashboard de Leads e Emails - Instruções de Deploy

## Variáveis de Ambiente Necessárias

Ao fazer deploy no Railway (ou outro serviço), você precisará configurar as seguintes variáveis de ambiente:

### Essenciais

```
DATABASE_URL=mysql://usuario:senha@host:3306/nome_do_banco
JWT_SECRET=string_aleatoria_longa_minimo_32_caracteres
```

### SMTP (para envio de emails)

```
SMTP_HOST=smtp.titan.email
SMTP_PORT=465
SMTP_USER=seu_email@dominio.com
SMTP_PASS=sua_senha
SMTP_FROM_NAME=Nome do Remetente
```

### Owner (informações do proprietário)

```
OWNER_OPEN_ID=seu_id_unico
OWNER_NAME=Seu Nome
```

### Opcionais (pode deixar em branco)

```
VITE_APP_TITLE=Dashboard de Leads e Emails
OAUTH_SERVER_URL=
VITE_APP_ID=
VITE_OAUTH_PORTAL_URL=
```

## Guia Completo

Veja o arquivo `DEPLOY_RAILWAY.md` para instruções passo a passo de como fazer deploy no Railway.

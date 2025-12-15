# Guia de Deploy no Railway

Este guia te ajudará a fazer o deploy do Dashboard de Leads e Emails no Railway.

## Pré-requisitos

1. Conta no Railway (https://railway.app)
2. Conta no GitHub (para fazer upload do código)
3. Credenciais do banco MySQL da Hostgator

---

## Arquivos Importantes para o Deploy

O projeto já inclui arquivos de configuração para o Railway:
- `Dockerfile` - Configuração Docker para build (PRINCIPAL)
- `.dockerignore` - Arquivos a ignorar no build Docker
- `railway.json` - Configurações de deploy
- `.nvmrc` - Especifica Node.js 22.13.0 (backup)
- `nixpacks.toml` - Configuração Nixpacks (backup)

**IMPORTANTE**: O Railway agora usará Docker ao invés de Nixpacks para maior controle e confiabilidade.

Certifique-se de que esses arquivos estão incluídos ao fazer upload.

## Passo 1: Preparar o Código no GitHub

### Opção A: Baixar arquivos do Manus e criar repositório

1. **No Manus**, vá em **Code → Download All Files**
2. Extraia o arquivo ZIP
3. No GitHub, crie um novo repositório:
   - Vá em https://github.com/new
   - Nome: `leads-email-dashboard`
   - Visibilidade: Private (recomendado)
   - Clique em **Create repository**

4. Faça upload dos arquivos:
   - Na página do repositório, clique em **uploading an existing file**
   - Arraste todos os arquivos do projeto (INCLUINDO .nvmrc e nixpacks.toml)
   - **IMPORTANTE**: Não esqueça dos arquivos que começam com ponto (.) como `.nvmrc`
   - Clique em **Commit changes**

### Opção B: Usar Git (se você tiver instalado)

```bash
# No terminal, dentro da pasta do projeto
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/leads-email-dashboard.git
git push -u origin main
```

---

## Passo 2: Criar Projeto no Railway

1. Acesse https://railway.app e faça login
2. Clique em **"New Project"**
3. Selecione **"Deploy from GitHub repo"**
4. Autorize o Railway a acessar seu GitHub
5. Selecione o repositório `leads-email-dashboard`
6. Aguarde o Railway detectar automaticamente que é um projeto Node.js

---

## Passo 3: Configurar Variáveis de Ambiente

No Railway, vá em **Variables** e adicione as seguintes variáveis:

### Banco de Dados MySQL (Hostgator)

```
DATABASE_URL=mysql://tuaces44_emailsperfectpay:SUA_SENHA@SEU_HOST:3306/tuaces44_emailsperfectpay_db
```

**Como obter os valores:**
- `tuaces44_emailsperfectpay` = usuário do banco (você já tem)
- `SUA_SENHA` = senha do banco MySQL
- `SEU_HOST` = geralmente é o domínio do seu site ou IP do servidor Hostgator
- `tuaces44_emailsperfectpay_db` = nome do banco de dados

### Configurações de Email SMTP

```
SMTP_HOST=smtp.titan.email
SMTP_PORT=465
SMTP_USER=support@acessaragora.digital
SMTP_PASS=JmTrMiav76eczEt@
SMTP_FROM_NAME=Suporte Acessa Agora
```

### Configurações de Autenticação (Gerar valores aleatórios)

```
JWT_SECRET=cole_uma_string_aleatoria_longa_aqui
```

Para gerar o `JWT_SECRET`, você pode usar:
- Site: https://randomkeygen.com/ (use "CodeIgniter Encryption Keys")
- Ou qualquer string longa e aleatória (mínimo 32 caracteres)

### Configurações do Owner (Seu email)

```
OWNER_OPEN_ID=seu_id_unico
OWNER_NAME=Seu Nome
```

**Nota:** Como você não está usando autenticação OAuth do Manus, pode colocar valores simples aqui.

### Configurações Opcionais

**Nota:** Estas variáveis já têm valores padrão vazios no `nixpacks.toml`. Você não precisa adicioná-las manualmente no Railway, a menos que queira usar funcionalidades específicas do Manus (OAuth, Analytics, etc.).

Se quiser adicionar:
```
VITE_APP_TITLE=Dashboard de Leads e Emails
VITE_APP_LOGO=
OAUTH_SERVER_URL=
VITE_APP_ID=
VITE_OAUTH_PORTAL_URL=
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=
BUILT_IN_FORGE_API_KEY=
BUILT_IN_FORGE_API_URL=
VITE_FRONTEND_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=
```

---

## Passo 4: Configurar Acesso Remoto ao MySQL (IMPORTANTE!)

No **cPanel da Hostgator**:

1. Vá em **"Remote MySQL"** ou **"MySQL Remoto"**
2. Adicione o host: `%` (permite qualquer IP) ou obtenha o IP do Railway
3. Clique em **"Add Host"**

**Para obter o IP do Railway:**
- No Railway, vá em **Settings → Networking**
- Copie o IP público
- Adicione no Remote MySQL da Hostgator

---

## Passo 5: Deploy e Verificação

1. O Railway fará o deploy automaticamente após configurar as variáveis
2. Aguarde alguns minutos (5-10 min na primeira vez)
3. Quando o status ficar **"Active"**, clique em **"Settings → Domains"**
4. Clique em **"Generate Domain"** para obter uma URL pública
5. Acesse a URL gerada (ex: `seu-projeto.up.railway.app`)

---

## Passo 6: Configurar Domínio Personalizado (Opcional)

Se quiser usar seu próprio domínio (ex: `dashboard.acessaragora.digital`):

1. No Railway, vá em **Settings → Domains**
2. Clique em **"Custom Domain"**
3. Digite: `dashboard.acessaragora.digital`
4. O Railway mostrará um registro CNAME para adicionar

No **cPanel da Hostgator**:

1. Vá em **"Zone Editor"** ou **"Editor de Zona"**
2. Adicione um registro CNAME:
   - Nome: `dashboard`
   - Valor: o endereço fornecido pelo Railway
   - TTL: 14400
3. Salve e aguarde propagação (pode levar até 24h)

---

## Solução de Problemas

### Erro de conexão com banco de dados

- Verifique se liberou o acesso remoto no cPanel (Remote MySQL)
- Confirme que a `DATABASE_URL` está correta
- Teste a conexão do banco usando um cliente MySQL

### Aplicação não inicia

- Vá em **Deployments** no Railway
- Clique no último deploy
- Veja os **logs** para identificar o erro
- Verifique se todas as variáveis de ambiente estão configuradas

### SMTP não funciona

- Verifique as credenciais SMTP
- Tente com porta 587 ao invés de 465
- Confirme que o Titan Email permite conexões externas

---

## Custos do Railway

- **Plano Trial**: $5 de crédito grátis por mês
- **Plano Hobby**: $5/mês (500 horas de execução)
- **Plano Pro**: $20/mês (uso ilimitado)

Seu dashboard provavelmente consumirá ~$3-5/mês no plano Hobby.

---

## Suporte

Se tiver problemas:
1. Verifique os logs no Railway
2. Confirme todas as variáveis de ambiente
3. Teste a conexão com o banco MySQL separadamente
4. Verifique se o Remote MySQL está liberado na Hostgator

---

**Pronto!** Seu dashboard estará rodando no Railway conectado ao banco MySQL da Hostgator. 🚀

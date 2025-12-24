/**
 * Script de Migração do Banco de Dados
 * 
 * Execute com: npx ts-node migrate.ts
 * Ou adicione ao package.json:
 * "scripts": {
 *   "migrate": "ts-node migrate.ts"
 * }
 * 
 * Depois execute: npm run migrate
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Erro: DATABASE_URL não está configurado');
  console.error('Configure a variável de ambiente DATABASE_URL e tente novamente');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function runMigration() {
  try {
    console.log('🔄 Iniciando migração do banco de dados...');
    console.log('📊 Conectando ao banco de dados...\n');

    // Adicionar coluna para envio imediato
    console.log('➕ Adicionando coluna send_immediate_enabled...');
    await sql`
      ALTER TABLE email_templates 
      ADD COLUMN IF NOT EXISTS send_immediate_enabled INTEGER DEFAULT 0
    `;
    console.log('✅ Coluna send_immediate_enabled adicionada com sucesso\n');

    // Adicionar coluna para envio automático por lead
    console.log('➕ Adicionando coluna auto_send_on_lead_enabled...');
    await sql`
      ALTER TABLE email_templates 
      ADD COLUMN IF NOT EXISTS auto_send_on_lead_enabled INTEGER DEFAULT 0
    `;
    console.log('✅ Coluna auto_send_on_lead_enabled adicionada com sucesso\n');

    // Verificar se as colunas foram adicionadas
    console.log('🔍 Verificando as colunas adicionadas...');
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'email_templates' 
      AND column_name IN ('send_immediate_enabled', 'auto_send_on_lead_enabled')
      ORDER BY column_name
    `;

    if (columns.length === 2) {
      console.log('✅ Migração concluída com sucesso!\n');
      console.log('📋 Colunas adicionadas:');
      columns.forEach((col: any) => {
        console.log(`   ✓ ${col.column_name} (${col.data_type})`);
      });
      console.log('\n✨ Próximos passos:');
      console.log('   1. Atualize server/db.ts com o arquivo db.ts fornecido');
      console.log('   2. Atualize server/routers.ts com o arquivo routers_refatorado.ts');
      console.log('   3. Atualize client/src/pages/EmailTemplates.tsx com EmailTemplates_refatorado.tsx');
      console.log('   4. Atualize drizzle/schema_postgresql.ts com schema_postgresql_refatorado.ts');
      console.log('   5. Execute: git add . && git commit -m "feat: add multiple email send types"');
      console.log('   6. Execute: git push origin main');
    } else {
      console.error('❌ Erro: Nem todas as colunas foram adicionadas');
      console.error(`   Esperado: 2 colunas, Encontrado: ${columns.length}`);
      process.exit(1);
    }

    await sql.end();
  } catch (error) {
    console.error('❌ Erro durante a migração:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

runMigration();
/**
 * Script de Migração do Banco de Dados
 * 
 * Execute com: npx ts-node migrate.ts
 * Ou adicione ao package.json:
 * "scripts": {
 *   "migrate": "ts-node migrate.ts"
 * }
 * 
 * Depois execute: npm run migrate
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Erro: DATABASE_URL não está configurado');
  console.error('Configure a variável de ambiente DATABASE_URL e tente novamente');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function runMigration() {
  try {
    console.log('🔄 Iniciando migração do banco de dados...');
    console.log('📊 Conectando ao banco de dados...\n');

    // Adicionar coluna para envio imediato
    console.log('➕ Adicionando coluna send_immediate_enabled...');
    await sql`
      ALTER TABLE email_templates 
      ADD COLUMN IF NOT EXISTS send_immediate_enabled INTEGER DEFAULT 0
    `;
    console.log('✅ Coluna send_immediate_enabled adicionada com sucesso\n');

    // Adicionar coluna para envio automático por lead
    console.log('➕ Adicionando coluna auto_send_on_lead_enabled...');
    await sql`
      ALTER TABLE email_templates 
      ADD COLUMN IF NOT EXISTS auto_send_on_lead_enabled INTEGER DEFAULT 0
    `;
    console.log('✅ Coluna auto_send_on_lead_enabled adicionada com sucesso\n');

    // Verificar se as colunas foram adicionadas
    console.log('🔍 Verificando as colunas adicionadas...');
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'email_templates' 
      AND column_name IN ('send_immediate_enabled', 'auto_send_on_lead_enabled')
      ORDER BY column_name
    `;

    if (columns.length === 2) {
      console.log('✅ Migração concluída com sucesso!\n');
      console.log('📋 Colunas adicionadas:');
      columns.forEach((col: any) => {
        console.log(`   ✓ ${col.column_name} (${col.data_type})`);
      });
      console.log('\n✨ Próximos passos:');
      console.log('   1. Atualize server/db.ts com o arquivo db.ts fornecido');
      console.log('   2. Atualize server/routers.ts com o arquivo routers_refatorado.ts');
      console.log('   3. Atualize client/src/pages/EmailTemplates.tsx com EmailTemplates_refatorado.tsx');
      console.log('   4. Atualize drizzle/schema_postgresql.ts com schema_postgresql_refatorado.ts');
      console.log('   5. Execute: git add . && git commit -m "feat: add multiple email send types"');
      console.log('   6. Execute: git push origin main');
    } else {
      console.error('❌ Erro: Nem todas as colunas foram adicionadas');
      console.error(`   Esperado: 2 colunas, Encontrado: ${columns.length}`);
      process.exit(1);
    }

    await sql.end();
  } catch (error) {
    console.error('❌ Erro durante a migração:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

runMigration();

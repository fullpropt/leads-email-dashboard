/**
 * Script de migração para corrigir a tabela email_templates
 * Executa: node fix_email_templates.js
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não está definida');
  process.exit(1);
}

async function runMigration() {
  console.log('🔧 Iniciando migração da tabela email_templates...');
  
  const sql = postgres(DATABASE_URL);

  try {
    // Adicionar colunas faltantes
    console.log('📝 Adicionando colunas faltantes...');
    
    await sql`
      ALTER TABLE email_templates 
      ADD COLUMN IF NOT EXISTS send_immediate_enabled INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS auto_send_on_lead_enabled INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS schedule_enabled INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS schedule_time VARCHAR(5),
      ADD COLUMN IF NOT EXISTS schedule_interval INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS schedule_interval_type VARCHAR(10) DEFAULT 'days',
      ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS next_send_at TIMESTAMP
    `;

    console.log('✅ Colunas adicionadas com sucesso!');

    // Verificar estrutura da tabela
    console.log('📊 Verificando estrutura da tabela...');
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'email_templates'
      ORDER BY ordinal_position
    `;

    console.log('📋 Colunas da tabela email_templates:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    console.log('\n✅ Migração concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante a migração:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();

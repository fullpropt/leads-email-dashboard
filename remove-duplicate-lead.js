/**
 * Script para remover lead duplicado do banco de dados MailMKT
 * Remove o lead com ID 1108, mantendo o ID 1091
 */

import postgres from 'postgres';
import 'dotenv/config';

async function removeDuplicateLead() {
  try {
    console.log('🔄 Conectando ao banco de dados...');
    
    const sql = postgres(process.env.DATABASE_URL);
    
    console.log('✅ Conectado ao banco de dados');
    
    // 1. Verificar os leads duplicados antes de remover
    console.log('\n📋 Leads com email vinicynrotelli@gmail.com ANTES da remoção:');
    const leadsBefore = await sql`
      SELECT id, nome, email, data_criacao
      FROM leads
      WHERE email = 'vinicynrotelli@gmail.com'
      ORDER BY id ASC
    `;
    console.table(leadsBefore);
    
    if (leadsBefore.length === 0) {
      console.log('⚠️  Nenhum lead encontrado com esse email');
      await sql.end();
      return;
    }
    
    if (leadsBefore.length === 1) {
      console.log('✅ Apenas 1 lead encontrado, não há duplicatas');
      await sql.end();
      return;
    }
    
    // 2. Remover o lead com ID 1108 (o mais recente)
    console.log('\n🗑️  Removendo lead com ID 1108...');
    const result = await sql`
      DELETE FROM leads 
      WHERE id = 1108
      RETURNING id, nome, email
    `;
    
    if (result.length > 0) {
      console.log('✅ Lead removido com sucesso:');
      console.table(result);
    } else {
      console.log('⚠️  Lead com ID 1108 não encontrado');
    }
    
    // 3. Verificar os leads após a remoção
    console.log('\n📋 Leads com email vinicynrotelli@gmail.com APÓS a remoção:');
    const leadsAfter = await sql`
      SELECT id, nome, email, data_criacao
      FROM leads
      WHERE email = 'vinicynrotelli@gmail.com'
      ORDER BY id ASC
    `;
    console.table(leadsAfter);
    
    if (leadsAfter.length === 1) {
      console.log('\n✅ Duplicata removida com sucesso! Restou apenas 1 lead.');
    }
    
    await sql.end();
    console.log('\n✅ Conexão fechada');
    
  } catch (error) {
    console.error('❌ Erro ao remover lead duplicado:', error);
    process.exit(1);
  }
}

removeDuplicateLead();

#!/usr/bin/env node

/**
 * Script para sincronizar leads do MailMKT com usuários do TubeTools
 * Uso: node scripts/sync-tubetools.js
 */

const BASE_URL = 'https://leads-email-dashboard-production.up.railway.app';

async function syncTubetools() {
  console.log('🔄 Iniciando sincronização com TubeTools...\n');

  try {
    // Formato correto para tRPC: batch=1 e input como JSON encoded
    const url = `${BASE_URL}/api/trpc/tubetools.syncAll?batch=1&input=${encodeURIComponent(JSON.stringify({}))}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // tRPC retorna em formato batch com json wrapper
    const result = data[0]?.result?.data?.json;

    if (result) {
      console.log('✅ Sincronização concluída com sucesso!\n');
      console.log('📊 Resultados:');
      console.log(`   Total de leads: ${result.total}`);
      console.log(`   ✅ Acessaram a plataforma: ${result.accessed}`);
      console.log(`   ❌ Não acessaram: ${result.notAccessed}`);
      console.log(`   ⚠️  Erros: ${result.errors}`);
      
      if (result.accessed > 0) {
        const percentage = ((result.accessed / result.total) * 100).toFixed(1);
        console.log(`\n   📈 Taxa de conversão: ${percentage}%`);
      }
    } else {
      console.error('❌ Erro: Resposta inesperada do servidor');
      console.log(JSON.stringify(data, null, 2));
    }

  } catch (error) {
    console.error('❌ Erro ao sincronizar:', error.message);
    process.exit(1);
  }
}

syncTubetools();

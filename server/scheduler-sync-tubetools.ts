/**
 * Scheduler para sincronização automática com TubeTools
 * Verifica periodicamente quais leads já se cadastraram na plataforma TubeTools
 * e atualiza o campo has_accessed_platform no banco MailMKT
 */

import { syncAllLeadsWithTubetools, syncUnverifiedLeadsWithTubetools } from "./sync-tubetools";

let syncSchedulerInterval: NodeJS.Timeout | null = null;
let lastFullSyncTime: Date | null = null;

// Intervalo para sincronização rápida (apenas leads não verificados): 5 minutos
const QUICK_SYNC_INTERVAL = 5 * 60 * 1000;

// Intervalo para sincronização completa: 1 hora
const FULL_SYNC_INTERVAL = 60 * 60 * 1000;

/**
 * Iniciar o scheduler de sincronização com TubeTools
 * Executa sincronização rápida a cada 5 minutos
 * Executa sincronização completa a cada 1 hora
 */
export function startSyncScheduler() {
  if (syncSchedulerInterval) {
    console.log("[SyncScheduler] ⚠️ Scheduler de sincronização já está em execução");
    return;
  }

  console.log("[SyncScheduler] 🚀 Iniciando scheduler de sincronização com TubeTools...");

  // Executar sincronização completa imediatamente na primeira vez
  runFullSync().catch(error => {
    console.error("[SyncScheduler] Erro na sincronização inicial:", error);
  });

  // Depois, executar sincronização rápida a cada 5 minutos
  syncSchedulerInterval = setInterval(() => {
    runSync().catch(error => {
      console.error("[SyncScheduler] Erro durante sincronização:", error);
    });
  }, QUICK_SYNC_INTERVAL);

  console.log("[SyncScheduler] ✅ Scheduler de sincronização iniciado com sucesso!");
  console.log("[SyncScheduler] 📋 Configuração:");
  console.log(`  - Sincronização rápida (não verificados): a cada ${QUICK_SYNC_INTERVAL / 60000} minutos`);
  console.log(`  - Sincronização completa: a cada ${FULL_SYNC_INTERVAL / 60000} minutos`);
}

/**
 * Parar o scheduler de sincronização
 */
export function stopSyncScheduler() {
  if (syncSchedulerInterval) {
    clearInterval(syncSchedulerInterval);
    syncSchedulerInterval = null;
    console.log("[SyncScheduler] ⏹️ Scheduler de sincronização parado");
  }
}

/**
 * Executar sincronização
 * Decide se deve fazer sincronização rápida ou completa baseado no tempo
 */
async function runSync() {
  const now = new Date();
  
  // Verificar se é hora de fazer sincronização completa
  if (!lastFullSyncTime || (now.getTime() - lastFullSyncTime.getTime()) >= FULL_SYNC_INTERVAL) {
    await runFullSync();
  } else {
    await runQuickSync();
  }
}

/**
 * Executar sincronização completa (todos os leads)
 */
async function runFullSync() {
  console.log("[SyncScheduler] 🔄 Iniciando sincronização COMPLETA com TubeTools...");
  
  try {
    const result = await syncAllLeadsWithTubetools();
    lastFullSyncTime = new Date();
    
    console.log("[SyncScheduler] ✅ Sincronização completa finalizada:");
    console.log(`  - Total processado: ${result.total}`);
    console.log(`  - Acessaram plataforma: ${result.accessed}`);
    console.log(`  - Não acessaram: ${result.notAccessed}`);
    console.log(`  - Erros: ${result.errors}`);
    
    return result;
  } catch (error) {
    console.error("[SyncScheduler] ❌ Erro na sincronização completa:", error);
    throw error;
  }
}

/**
 * Executar sincronização rápida (apenas leads não verificados)
 */
async function runQuickSync() {
  console.log("[SyncScheduler] 🔄 Iniciando sincronização RÁPIDA com TubeTools (apenas não verificados)...");
  
  try {
    const result = await syncUnverifiedLeadsWithTubetools();
    
    if (result.total > 0) {
      console.log("[SyncScheduler] ✅ Sincronização rápida finalizada:");
      console.log(`  - Total processado: ${result.total}`);
      console.log(`  - Acessaram plataforma: ${result.accessed}`);
      console.log(`  - Não acessaram: ${result.notAccessed}`);
      console.log(`  - Erros: ${result.errors}`);
    } else {
      console.log("[SyncScheduler] ✅ Sincronização rápida: nenhum lead não verificado encontrado");
    }
    
    return result;
  } catch (error) {
    console.error("[SyncScheduler] ❌ Erro na sincronização rápida:", error);
    throw error;
  }
}

/**
 * Forçar sincronização completa manualmente
 */
export async function forceFullSync() {
  console.log("[SyncScheduler] 🔄 Forçando sincronização completa...");
  return await runFullSync();
}

/**
 * Obter status do scheduler
 */
export function getSyncSchedulerStatus() {
  return {
    running: syncSchedulerInterval !== null,
    lastFullSync: lastFullSyncTime,
    quickSyncInterval: QUICK_SYNC_INTERVAL,
    fullSyncInterval: FULL_SYNC_INTERVAL,
  };
}

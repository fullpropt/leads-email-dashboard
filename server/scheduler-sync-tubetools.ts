/**
 * Scheduler para sincronização automática com TubeTools
 * Verifica periodicamente quais leads já se cadastraram na plataforma TubeTools
 * e atualiza o campo has_accessed_platform no banco MailMKT
 */

import { syncAllLeadsWithTubetools, syncUnverifiedLeadsWithTubetools } from "./sync-tubetools";

let syncSchedulerInterval: NodeJS.Timeout | null = null;
let lastFullSyncTime: Date | null = null;
let quickSyncRunsWithoutChanges = 0;

// Intervalo para sincronização rápida (apenas leads não verificados): 5 minutos
const QUICK_SYNC_INTERVAL = 5 * 60 * 1000;

// Intervalo para sincronização completa: 1 hora
const FULL_SYNC_INTERVAL = 60 * 60 * 1000;

// Log de heartbeat da sincronização rápida sem mudanças (a cada 1 hora = 12 ciclos de 5 min)
const QUICK_SYNC_HEARTBEAT_RUNS = 12;

// Ative SYNC_SCHEDULER_VERBOSE=true para logs detalhados do scheduler
const SYNC_SCHEDULER_VERBOSE = process.env.SYNC_SCHEDULER_VERBOSE === "true";

// Ative SYNC_SUPPRESS_NOISY_LOGS=false para voltar a exibir logs por lead do Sync TubeTools/Database
const SYNC_SUPPRESS_NOISY_LOGS = process.env.SYNC_SUPPRESS_NOISY_LOGS !== "false";

/**
 * Converte argumentos do console em string única para facilitar filtro
 */
function argsToString(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

/**
 * Identifica logs de alto ruído (por lead) que atrapalham observabilidade em produção
 */
function isNoisySyncLog(message: string): boolean {
  // Ex: [Sync TubeTools] ❌ email@dominio.com - Não acessou a plataforma
  if (message.startsWith("[Sync TubeTools] ❌")) return true;

  // Ex: [Sync TubeTools] ✅ email@dominio.com - Acessou a plataforma
  if (message.startsWith("[Sync TubeTools] ✅")) return true;

  // Ex: [Database] Lead 123 platform access status updated: true|false
  if (/^\[Database\]\sLead\s\d+\splatform access status updated:\s(?:true|false)\b/i.test(message)) {
    return true;
  }

  return false;
}

/**
 * Executa função com filtro temporário de logs ruidosos
 * Mantém erros e logs relevantes; suprime apenas padrões de alto volume.
 */
async function runWithNoisyLogFilter<T>(fn: () => Promise<T>): Promise<T> {
  if (!SYNC_SUPPRESS_NOISY_LOGS) {
    return fn();
  }

  const originalLog = console.log;

  console.log = (...args: unknown[]) => {
    const msg = argsToString(args);
    if (isNoisySyncLog(msg)) return;
    originalLog(...args);
  };

  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}

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
  runFullSync().catch((error) => {
    console.error("[SyncScheduler] Erro na sincronização inicial:", error);
  });

  // Depois, executar sincronização rápida a cada 5 minutos
  syncSchedulerInterval = setInterval(() => {
    runSync().catch((error) => {
      console.error("[SyncScheduler] Erro durante sincronização:", error);
    });
  }, QUICK_SYNC_INTERVAL);

  console.log("[SyncScheduler] ✅ Scheduler de sincronização iniciado com sucesso!");
  console.log("[SyncScheduler] 📋 Configuração:");
  console.log(`  - Sincronização rápida (não verificados): a cada ${QUICK_SYNC_INTERVAL / 60000} minutos`);
  console.log(`  - Sincronização completa: a cada ${FULL_SYNC_INTERVAL / 60000} minutos`);
  console.log(`  - Logs detalhados do scheduler: ${SYNC_SCHEDULER_VERBOSE ? "ativados" : "reduzidos"}`);
  console.log(`  - Supressão de logs ruidosos por lead: ${SYNC_SUPPRESS_NOISY_LOGS ? "ativada" : "desativada"}`);
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

  // Verificar se passou 1 hora desde a última sincronização completa
  const shouldRunFullSync =
    !lastFullSyncTime || now.getTime() - lastFullSyncTime.getTime() >= FULL_SYNC_INTERVAL;

  if (shouldRunFullSync) {
    await runFullSync();
    return;
  }

  // Sincronização rápida (apenas leads não verificados)
  const startTime = Date.now();
  const result = await runWithNoisyLogFilter(() => syncUnverifiedLeadsWithTubetools());
  const duration = Date.now() - startTime;

  if (!result) {
    console.warn("[SyncScheduler] ⚠️ Sincronização rápida retornou resultado vazio");
    return;
  }

  const updated = result.totalUpdated || 0;
  const alreadyVerified = result.totalAlreadyVerified || 0;
  const verifiedNow = result.totalVerifiedNow || 0;
  const notVerified = result.totalNotVerified || 0;
  const totalChecked = result.totalChecked || 0;

  if (updated > 0 || verifiedNow > 0) {
    quickSyncRunsWithoutChanges = 0;
    console.log(
      `[SyncScheduler] ⚡ Sync rápida: ${totalChecked} verificados | ${verifiedNow} novos acessos | ${updated} updates | ${duration}ms`
    );
    return;
  }

  quickSyncRunsWithoutChanges += 1;

  // Evita spam de "sem alterações" a cada 5 min; mantém heartbeat periódico
  if (
    SYNC_SCHEDULER_VERBOSE ||
    quickSyncRunsWithoutChanges % QUICK_SYNC_HEARTBEAT_RUNS === 0
  ) {
    console.log(
      `[SyncScheduler] ⚡ Sync rápida sem mudanças (${quickSyncRunsWithoutChanges}x) | ` +
      `checados=${totalChecked}, já_verificados=${alreadyVerified}, não_verificados=${notVerified}, ${duration}ms`
    );
  }
}

/**
 * Executar sincronização completa
 */
async function runFullSync() {
  const startTime = Date.now();
  console.log("[SyncScheduler] 🔄 Executando sincronização completa...");

  const result = await runWithNoisyLogFilter(() => syncAllLeadsWithTubetools());
  const duration = Date.now() - startTime;

  lastFullSyncTime = new Date();
  quickSyncRunsWithoutChanges = 0;

  if (!result) {
    console.warn("[SyncScheduler] ⚠️ Sincronização completa retornou resultado vazio");
    return;
  }

  const totalChecked = result.totalChecked || 0;
  const totalUpdated = result.totalUpdated || 0;
  const totalVerifiedNow = result.totalVerifiedNow || 0;
  const totalAlreadyVerified = result.totalAlreadyVerified || 0;
  const totalNotVerified = result.totalNotVerified || 0;
  const totalErrors = result.totalErrors || 0;

  console.log(
    `[SyncScheduler] ✅ Sync completa concluída | ` +
    `checados=${totalChecked}, updates=${totalUpdated}, novos_acessos=${totalVerifiedNow}, ` +
    `já_verificados=${totalAlreadyVerified}, não_verificados=${totalNotVerified}, erros=${totalErrors}, ${duration}ms`
  );
}

/**
 * Verificar se scheduler está rodando
 */
export function isSyncSchedulerRunning(): boolean {
  return syncSchedulerInterval !== null;
}

/**
 * Obter status do scheduler
 */
export function getSyncSchedulerStatus() {
  return {
    isRunning: isSyncSchedulerRunning(),
    lastFullSyncTime,
    quickSyncIntervalMinutes: QUICK_SYNC_INTERVAL / 60000,
    fullSyncIntervalMinutes: FULL_SYNC_INTERVAL / 60000,
    quickSyncRunsWithoutChanges,
    verbose: SYNC_SCHEDULER_VERBOSE,
    suppressNoisyLogs: SYNC_SUPPRESS_NOISY_LOGS,
  };
}

/**
 * Sincronização com TubeTools
 * Verifica quais leads compraram e também se cadastraram na plataforma
 */

import { checkIfUserExistsInTubetools, checkMultipleUsersInTubetools } from "./tubetools-db";
import { getUnverifiedLeads, updateLeadPlatformAccessStatus, getDb } from "./db";
import { leads } from "../drizzle/schema_postgresql";
import { eq } from "drizzle-orm";

/**
 * Sincronizar todos os leads com o banco TubeTools
 * Verifica quais leads se cadastraram na plataforma
 */
export async function syncAllLeadsWithTubetools(): Promise<{
  total: number;
  accessed: number;
  notAccessed: number;
  errors: number;
}> {
  try {
    console.log("[Sync TubeTools] 🔄 Iniciando sincronização...");

    const db = await getDb();
    if (!db) {
      console.error("[Sync TubeTools] Banco de dados não disponível");
      return { total: 0, accessed: 0, notAccessed: 0, errors: 0 };
    }

    // Buscar todos os leads (não apenas os não verificados)
    const allLeads = await db.select().from(leads);
    
    if (allLeads.length === 0) {
      console.log("[Sync TubeTools] Nenhum lead para sincronizar");
      return { total: 0, accessed: 0, notAccessed: 0, errors: 0 };
    }

    console.log(`[Sync TubeTools] 📋 Sincronizando ${allLeads.length} lead(s)...`);

    // Verificar em lote (mais eficiente)
    const emails = allLeads.map(lead => lead.email);
    const accessStatusMap = await checkMultipleUsersInTubetools(emails);

    let accessed = 0;
    let notAccessed = 0;
    let errors = 0;

    // Atualizar cada lead
    for (const lead of allLeads) {
      try {
        const hasAccessed = accessStatusMap[lead.email.toLowerCase().trim()] || false;
        
        await updateLeadPlatformAccessStatus(lead.id, hasAccessed);

        if (hasAccessed) {
          accessed++;
          console.log(`[Sync TubeTools] ✅ ${lead.email} - Acessou a plataforma`);
        } else {
          notAccessed++;
          console.log(`[Sync TubeTools] ❌ ${lead.email} - Não acessou a plataforma`);
        }
      } catch (error) {
        errors++;
        console.error(`[Sync TubeTools] Erro ao processar lead ${lead.id}:`, error);
      }
    }

    console.log("[Sync TubeTools] ✅ Sincronização concluída");
    console.log(`[Sync TubeTools] 📊 Resultados:`);
    console.log(`  - Total: ${allLeads.length}`);
    console.log(`  - Acessaram: ${accessed}`);
    console.log(`  - Não acessaram: ${notAccessed}`);
    console.log(`  - Erros: ${errors}`);

    return {
      total: allLeads.length,
      accessed,
      notAccessed,
      errors,
    };
  } catch (error) {
    console.error("[Sync TubeTools] Erro durante sincronização:", error);
    return { total: 0, accessed: 0, notAccessed: 0, errors: 1 };
  }
}

/**
 * Sincronizar apenas leads não verificados
 */
export async function syncUnverifiedLeadsWithTubetools(): Promise<{
  total: number;
  accessed: number;
  notAccessed: number;
  errors: number;
}> {
  try {
    console.log("[Sync TubeTools] 🔄 Sincronizando leads não verificados...");

    const unverifiedLeads = await getUnverifiedLeads();

    if (unverifiedLeads.length === 0) {
      console.log("[Sync TubeTools] Nenhum lead não verificado");
      return { total: 0, accessed: 0, notAccessed: 0, errors: 0 };
    }

    console.log(`[Sync TubeTools] 📋 Sincronizando ${unverifiedLeads.length} lead(s) não verificados...`);

    // Verificar em lote
    const emails = unverifiedLeads.map(lead => lead.email);
    const accessStatusMap = await checkMultipleUsersInTubetools(emails);

    let accessed = 0;
    let notAccessed = 0;
    let errors = 0;

    for (const lead of unverifiedLeads) {
      try {
        const hasAccessed = accessStatusMap[lead.email.toLowerCase().trim()] || false;
        
        await updateLeadPlatformAccessStatus(lead.id, hasAccessed);

        if (hasAccessed) {
          accessed++;
        } else {
          notAccessed++;
        }
      } catch (error) {
        errors++;
        console.error(`[Sync TubeTools] Erro ao processar lead ${lead.id}:`, error);
      }
    }

    console.log("[Sync TubeTools] ✅ Sincronização de não verificados concluída");
    console.log(`  - Acessaram: ${accessed}`);
    console.log(`  - Não acessaram: ${notAccessed}`);
    console.log(`  - Erros: ${errors}`);

    return {
      total: unverifiedLeads.length,
      accessed,
      notAccessed,
      errors,
    };
  } catch (error) {
    console.error("[Sync TubeTools] Erro durante sincronização:", error);
    return { total: 0, accessed: 0, notAccessed: 0, errors: 1 };
  }
}

/**
 * Verificar um único lead
 */
export async function syncSingleLead(leadId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) {
      console.error("[Sync TubeTools] Banco de dados não disponível");
      return false;
    }

    const lead = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (lead.length === 0) {
      console.error(`[Sync TubeTools] Lead ${leadId} não encontrado`);
      return false;
    }

    const hasAccessed = await checkIfUserExistsInTubetools(lead[0].email);
    await updateLeadPlatformAccessStatus(leadId, hasAccessed);

    console.log(`[Sync TubeTools] Lead ${leadId} (${lead[0].email}): ${hasAccessed ? "✅ Acessou" : "❌ Não acessou"}`);

    return true;
  } catch (error) {
    console.error(`[Sync TubeTools] Erro ao sincronizar lead ${leadId}:`, error);
    return false;
  }
}

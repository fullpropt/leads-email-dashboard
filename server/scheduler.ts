/**
 * Scheduler para envio automático de emails com atraso
 * Executa a cada 5 minutos para verificar e enviar emails atrasados
 */

import { getDb } from "./db";
import { leads, emailTemplates } from "../drizzle/schema_postgresql";
import { eq, and, sql } from "drizzle-orm";

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Iniciar o scheduler
 * Executa a cada 5 minutos (300.000 ms)
 */
export function startScheduler() {
  if (schedulerInterval) {
    console.log("[Scheduler] ⚠️ Scheduler já está em execução");
    return;
  }

  console.log("[Scheduler] 🚀 Iniciando scheduler de envio atrasado...");

  // Executar imediatamente na primeira vez
  processDelayedSends().catch(error => {
    console.error("[Scheduler] Erro na execução inicial:", error);
  });

  // Depois, executar a cada 5 minutos
  schedulerInterval = setInterval(() => {
    processDelayedSends().catch(error => {
      console.error("[Scheduler] Erro durante execução:", error);
    });
  }, 5 * 60 * 1000); // 5 minutos

  console.log("[Scheduler] ✅ Scheduler iniciado com sucesso!");
}

/**
 * Parar o scheduler
 */
export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Scheduler] ⏹️ Scheduler parado");
  }
}

/**
 * Processar envios atrasados
 * Busca leads prontos para envio e envia emails
 * CORRIGIDO: Envia apenas UM template por lead (o primeiro encontrado)
 */
async function processDelayedSends() {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Scheduler] Banco de dados não disponível");
      return;
    }

    const { canCurrentServiceProcessQueue } = await import("./email");
    const queuePermission = await canCurrentServiceProcessQueue();
    if (!queuePermission.allowed) {
      if (queuePermission.reason) {
        console.log(`[Scheduler] ${queuePermission.reason}`);
      }
      return;
    }

    const now = new Date();
    console.log(`[Scheduler] 🔍 Verificando envios atrasados em ${now.toLocaleString("pt-BR")}...`);

    // Buscar leads prontos para envio
    const leadsReadyForSend = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.emailEnviado, 0), // Email não enviado
          sql`${leads.nextEmailSendAt} IS NOT NULL`, // nextEmailSendAt está definido
          sql`${leads.nextEmailSendAt} <= ${now.toISOString()}` // Tempo de envio chegou
        )
      );

    if (leadsReadyForSend.length === 0) {
      console.log("[Scheduler] ✓ Nenhum lead pronto para envio no momento");
      return;
    }

    console.log(`[Scheduler] 📧 Encontrados ${leadsReadyForSend.length} lead(s) prontos para envio`);

    // Buscar templates com envio atrasado ativado
    const templatesWithDelayedSend = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.sendOnLeadDelayEnabled, 1));

    if (templatesWithDelayedSend.length === 0) {
      console.log("[Scheduler] ⚠️ Nenhum template com envio atrasado ativado");
      return;
    }

    console.log(`[Scheduler] 📋 Encontrados ${templatesWithDelayedSend.length} template(s) com envio atrasado`);

    // CORREÇÃO: Usar apenas o primeiro template (não enviar todos)
    const template = templatesWithDelayedSend[0];
    console.log(`[Scheduler] 📋 Usando template: "${template.nome}" (ID: ${template.id})`);

    // Importar funções necessárias
    const { sendEmail } = await import("./email");
    const { replaceTemplateVariables } = await import("./db");

    // Processar cada lead - enviar apenas UM template
    for (const lead of leadsReadyForSend) {
      console.log(`[Scheduler] 📤 Processando lead: ${lead.email}`);

      try {
        console.log(`[Scheduler] 📧 Enviando template "${template.nome}" para ${lead.email}`);

        // Substituir variáveis no template (HTML e assunto)
        const htmlContent = replaceTemplateVariables(template.htmlContent, lead);
        const processedSubject = replaceTemplateVariables(template.assunto, lead);
        
        // Gerar/obter token de unsubscribe para o lead
        const { generateUnsubscribeToken } = await import("./db");
        const unsubscribeToken = await generateUnsubscribeToken(lead.id);
        
        // Processar template com header, CSS e rodapé (incluindo link de unsubscribe)
        const { processEmailTemplate } = await import("./emailTemplate");
        const processedHtml = processEmailTemplate(htmlContent, unsubscribeToken || undefined);

        // Enviar email
        const emailSent = await sendEmail({
          to: lead.email,
          subject: processedSubject,
          html: processedHtml,
        });

        if (emailSent) {
          // Marcar email como enviado
          await db
            .update(leads)
            .set({
              emailEnviado: 1,
              dataEnvioEmail: new Date(),
              nextEmailSendAt: null, // Limpar a data de envio agendado
            })
            .where(eq(leads.id, lead.id));

          console.log(`[Scheduler] ✅ Email enviado com sucesso para ${lead.email}`);
        } else {
          console.error(`[Scheduler] ❌ Falha ao enviar email para ${lead.email}`);
        }
      } catch (templateError) {
        console.error(`[Scheduler] ❌ Erro ao processar template ${template.id}:`, templateError);
      }
    }

    console.log("[Scheduler] ✅ Ciclo de envio concluído");
  } catch (error) {
    console.error("[Scheduler] ❌ Erro ao processar envios atrasados:", error);
  }
}

/**
 * Função para calcular e atualizar nextEmailSendAt para todos os leads
 * Útil para aplicar a lógica a leads existentes
 */
export async function recalculateAllLeadsNextSendAt() {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Scheduler] Banco de dados não disponível");
      return;
    }

    console.log("[Scheduler] 🔄 Recalculando nextEmailSendAt para todos os leads...");

    // Buscar todos os templates com envio atrasado ativado
    const templatesWithDelayedSend = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.sendOnLeadDelayEnabled, 1));

    if (templatesWithDelayedSend.length === 0) {
      console.log("[Scheduler] ⚠️ Nenhum template com envio atrasado ativado");
      return;
    }

    // Buscar todos os leads que ainda não receberam email
    const allLeads = await db
      .select()
      .from(leads)
      .where(eq(leads.emailEnviado, 0));

    console.log(`[Scheduler] 📋 Processando ${allLeads.length} lead(s)`);

      // Importar função de cálculo de timezone
      const { calculateSendTimeInLeadTimezone } = await import("./timezone-utils");

      // Para cada lead, usar o template com maior atraso (para não sobrescrever)
      for (const lead of allLeads) {
        // Usar o primeiro template (você pode customizar essa lógica)
        const template = templatesWithDelayedSend[0];
        const delayDays = template.delayDaysAfterLeadCreation || 0;
        
        // Usar timezone do lead ou padrão
        const leadTimezone = lead.timezone || "America/Sao_Paulo";
        
        // Usar horário do template ou padrão 12:00
        const sendTime = template.scheduleTime || "12:00";
        
        // Calcular próximo envio considerando timezone do lead
        const nextSendAt = calculateSendTimeInLeadTimezone(sendTime, delayDays, leadTimezone);

        await db
          .update(leads)
          .set({ nextEmailSendAt: nextSendAt })
          .where(eq(leads.id, lead.id));

        console.log(`[Scheduler] ✓ Lead ${lead.email} agendado para ${nextSendAt.toLocaleString("pt-BR")} (timezone: ${leadTimezone})`);
      }

    console.log("[Scheduler] ✅ Recálculo concluído");
  } catch (error) {
    console.error("[Scheduler] ❌ Erro ao recalcular nextEmailSendAt:", error);
  }
}

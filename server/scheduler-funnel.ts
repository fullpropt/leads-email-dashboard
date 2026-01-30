/**
 * Scheduler para processar funis de email com suporte a fuso horário do lead
 * Executa a cada 5 minutos para verificar e enviar emails de funis
 * 
 * FUNCIONALIDADE: Envia emails no horário local de cada lead
 */

import { getDb } from "./db";
import { leads, funnels, funnelTemplates, funnelLeadProgress } from "../drizzle/schema_postgresql";
import { eq, and, sql, lte, isNotNull, asc } from "drizzle-orm";

let funnelSchedulerInterval: NodeJS.Timeout | null = null;

/**
 * Iniciar o scheduler de funis
 * Executa a cada 5 minutos (300.000 ms)
 */
export function startFunnelScheduler() {
  if (funnelSchedulerInterval) {
    console.log("[FunnelScheduler] ⚠️ Scheduler de funis já está em execução");
    return;
  }

  console.log("[FunnelScheduler] 🚀 Iniciando scheduler de funis...");

  // Executar imediatamente na primeira vez
  processFunnelEmails().catch(error => {
    console.error("[FunnelScheduler] Erro na execução inicial:", error);
  });

  // Depois, executar a cada 5 minutos
  funnelSchedulerInterval = setInterval(() => {
    processFunnelEmails().catch(error => {
      console.error("[FunnelScheduler] Erro durante execução:", error);
    });
  }, 5 * 60 * 1000); // 5 minutos

  console.log("[FunnelScheduler] ✅ Scheduler de funis iniciado com sucesso!");
}

/**
 * Parar o scheduler de funis
 */
export function stopFunnelScheduler() {
  if (funnelSchedulerInterval) {
    clearInterval(funnelSchedulerInterval);
    funnelSchedulerInterval = null;
    console.log("[FunnelScheduler] ⏹️ Scheduler de funis parado");
  }
}

/**
 * Processar emails de funis
 * Verifica leads com nextSendAt <= agora e envia os emails correspondentes
 */
async function processFunnelEmails() {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[FunnelScheduler] Banco de dados não disponível");
      return;
    }

    const now = new Date();
    console.log(`[FunnelScheduler] 🔍 Verificando funis em ${now.toLocaleString("pt-BR")}...`);

    // Buscar progressos de funis prontos para envio
    const progressReadyForSend = await db
      .select()
      .from(funnelLeadProgress)
      .where(
        and(
          eq(funnelLeadProgress.status, "active"),
          isNotNull(funnelLeadProgress.nextSendAt),
          lte(funnelLeadProgress.nextSendAt, now)
        )
      );

    if (progressReadyForSend.length === 0) {
      console.log("[FunnelScheduler] ✓ Nenhum email de funil pronto para envio");
      return;
    }

    console.log(`[FunnelScheduler] 📧 Encontrados ${progressReadyForSend.length} email(s) de funil prontos`);

    // Importar funções necessárias
    const { sendEmail } = await import("./email");
    const { replaceTemplateVariables } = await import("./db");

    // Processar cada progresso
    for (const progress of progressReadyForSend) {
      try {
        // Buscar o lead
        const [lead] = await db
          .select()
          .from(leads)
          .where(eq(leads.id, progress.leadId));

        if (!lead) {
          console.warn(`[FunnelScheduler] Lead ${progress.leadId} não encontrado`);
          continue;
        }

        // Buscar o template atual
        if (!progress.nextTemplateId) {
          console.warn(`[FunnelScheduler] Progresso ${progress.id} sem próximo template`);
          continue;
        }

        const [template] = await db
          .select()
          .from(funnelTemplates)
          .where(eq(funnelTemplates.id, progress.nextTemplateId));

        if (!template) {
          console.warn(`[FunnelScheduler] Template ${progress.nextTemplateId} não encontrado`);
          continue;
        }

        // Verificar se o template está ativo
        if (template.ativo !== 1) {
          console.log(`[FunnelScheduler] Template ${template.id} está desativado, pulando...`);
          continue;
        }

        console.log(`[FunnelScheduler] 📤 Enviando template "${template.nome}" para ${lead.email}`);

        // Substituir variáveis no template (HTML e assunto)
        const htmlContent = replaceTemplateVariables(template.htmlContent || "", lead);
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

        // Importar função para registrar envio no histórico
        const { recordFunnelEmailSend } = await import("./db");

        if (emailSent) {
          console.log(`[FunnelScheduler] ✅ Email enviado para ${lead.email}`);
          
          // Registrar envio bem-sucedido no histórico
          await recordFunnelEmailSend({
            funnelId: progress.funnelId,
            funnelTemplateId: template.id,
            leadId: lead.id,
            status: "sent",
          });

          // Buscar próximo template na sequência
          const [nextTemplate] = await db
            .select()
            .from(funnelTemplates)
            .where(
              and(
                eq(funnelTemplates.funnelId, progress.funnelId),
                sql`${funnelTemplates.posicao} > ${template.posicao}`,
                eq(funnelTemplates.ativo, 1)
              )
            )
            .orderBy(asc(funnelTemplates.posicao))
            .limit(1);

          if (nextTemplate) {
            // Calcular próximo envio considerando timezone do lead e unidade de delay
            // CORREÇÃO: Agora suporta corretamente horas, dias e semanas
            const leadTimezone = lead.timezone || "America/Sao_Paulo";
            const { calculateSendTimeWithUnit } = await import("./timezone-utils");
            
            const nextSendAt = calculateSendTimeWithUnit(
              nextTemplate.delayValue,
              nextTemplate.delayUnit,
              nextTemplate.sendTime,
              leadTimezone
            );

            // Atualizar progresso para próximo template
            await db
              .update(funnelLeadProgress)
              .set({
                currentTemplateId: template.id,
                nextTemplateId: nextTemplate.id,
                nextSendAt: nextSendAt,
                atualizadoEm: new Date(),
              })
              .where(eq(funnelLeadProgress.id, progress.id));

            console.log(`[FunnelScheduler] 📅 Próximo email agendado para ${nextSendAt.toLocaleString("pt-BR")} (timezone: ${leadTimezone})`);
          } else {
            // Funil concluído
            await db
              .update(funnelLeadProgress)
              .set({
                currentTemplateId: template.id,
                nextTemplateId: null,
                nextSendAt: null,
                status: "completed",
                completedAt: new Date(),
                atualizadoEm: new Date(),
              })
              .where(eq(funnelLeadProgress.id, progress.id));

            console.log(`[FunnelScheduler] 🎉 Funil concluído para ${lead.email}`);
          }
        } else {
          console.error(`[FunnelScheduler] ❌ Falha ao enviar email para ${lead.email}`);
          
          // Registrar falha no histórico
          await recordFunnelEmailSend({
            funnelId: progress.funnelId,
            funnelTemplateId: template.id,
            leadId: lead.id,
            status: "failed",
            errorMessage: "Falha ao enviar email",
          });
        }
      } catch (progressError) {
        console.error(`[FunnelScheduler] ❌ Erro ao processar progresso ${progress.id}:`, progressError);
      }
    }

    console.log("[FunnelScheduler] ✅ Ciclo de processamento de funis concluído");
  } catch (error) {
    console.error("[FunnelScheduler] ❌ Erro ao processar funis:", error);
  }
}

/**
 * Adicionar um lead a um funil
 * Calcula o primeiro envio considerando o timezone do lead
 */
export async function addLeadToFunnel(leadId: number, funnelId: number) {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[FunnelScheduler] Banco de dados não disponível");
      return { success: false, message: "Banco de dados não disponível" };
    }

    // Buscar o lead
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId));

    if (!lead) {
      return { success: false, message: "Lead não encontrado" };
    }

    // Verificar se o lead já está no funil
    const [existingProgress] = await db
      .select()
      .from(funnelLeadProgress)
      .where(
        and(
          eq(funnelLeadProgress.leadId, leadId),
          eq(funnelLeadProgress.funnelId, funnelId)
        )
      );

    if (existingProgress) {
      return { success: false, message: "Lead já está neste funil" };
    }

    // Buscar o primeiro template do funil
    const [firstTemplate] = await db
      .select()
      .from(funnelTemplates)
      .where(
        and(
          eq(funnelTemplates.funnelId, funnelId),
          eq(funnelTemplates.ativo, 1)
        )
      )
      .orderBy(asc(funnelTemplates.posicao))
      .limit(1);

    if (!firstTemplate) {
      return { success: false, message: "Funil não tem templates ativos" };
    }

    // Calcular primeiro envio considerando timezone do lead e unidade de delay
    // CORREÇÃO: Agora suporta corretamente horas, dias e semanas
    const { calculateSendTimeWithUnit } = await import("./timezone-utils");
    const leadTimezone = lead.timezone || "America/Sao_Paulo";
    
    const nextSendAt = calculateSendTimeWithUnit(
      firstTemplate.delayValue,
      firstTemplate.delayUnit,
      firstTemplate.sendTime,
      leadTimezone
    );

    // Criar progresso do funil
    await db.insert(funnelLeadProgress).values({
      funnelId: funnelId,
      leadId: leadId,
      currentTemplateId: null,
      nextTemplateId: firstTemplate.id,
      nextSendAt: nextSendAt,
      status: "active",
      startedAt: new Date(),
    });

    console.log(`[FunnelScheduler] ✅ Lead ${lead.email} adicionado ao funil ${funnelId}`);
    console.log(`[FunnelScheduler] 📅 Primeiro email agendado para ${nextSendAt.toLocaleString("pt-BR")} (timezone: ${leadTimezone})`);

    return { 
      success: true, 
      message: "Lead adicionado ao funil",
      nextSendAt: nextSendAt.toISOString(),
      timezone: leadTimezone,
    };
  } catch (error) {
    console.error("[FunnelScheduler] ❌ Erro ao adicionar lead ao funil:", error);
    return { success: false, message: "Erro ao adicionar lead ao funil" };
  }
}

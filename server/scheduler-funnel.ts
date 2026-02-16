/**
 * Scheduler para processar funis de email com suporte a fuso horário do lead
 * Executa a cada 5 minutos para verificar e enviar emails de funis
 * 
 * FUNCIONALIDADE: Envia emails no horário local de cada lead
 * RATE LIMITING: Respeita limite diário e intervalo entre envios
 */

import { getDb } from "./db";
import { leads, funnels, funnelTemplates, funnelLeadProgress, sendingConfig } from "../drizzle/schema_postgresql";
import { eq, and, or, sql, lte, isNotNull, asc, desc } from "drizzle-orm";

let funnelSchedulerInterval: NodeJS.Timeout | null = null;
const emailAccountRotationEnabled =
  process.env.EMAIL_ACCOUNT_ROTATION_ENABLED === "true";

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
 * Obter ou criar configuração de envio
 */
async function getSendingConfig() {
  const db = await getDb();
  if (!db) return null;

  const [config] = await db.select().from(sendingConfig).limit(1);
  
  if (!config) {
    // Criar configuração padrão
    const [newConfig] = await db.insert(sendingConfig).values({
      dailyLimit: 50,
      intervalSeconds: 30,
      enabled: 1,
      emailsSentToday: 0,
      lastResetDate: new Date().toISOString().split("T")[0],
    }).returning();
    return newConfig;
  }

  // Verificar se precisa resetar o contador diário
  const today = new Date().toISOString().split("T")[0];
  if (config.lastResetDate !== today) {
    const [updatedConfig] = await db
      .update(sendingConfig)
      .set({
        emailsSentToday: 0,
        lastResetDate: today,
        atualizadoEm: new Date(),
      })
      .where(eq(sendingConfig.id, config.id))
      .returning();
    return updatedConfig;
  }

  return config;
}

/**
 * Incrementar contador de emails enviados hoje
 */
async function incrementEmailsSentToday() {
  const db = await getDb();
  if (!db) return;

  await db
    .update(sendingConfig)
    .set({
      emailsSentToday: sql`${sendingConfig.emailsSentToday} + 1`,
      lastSentAt: new Date(),
      atualizadoEm: new Date(),
    })
    .where(eq(sendingConfig.id, 1));
}

/**
 * Verificar se pode enviar email (rate limiting)
 */
async function canSendEmail(): Promise<{ allowed: boolean; reason?: string }> {
  const config = await getSendingConfig();
  if (!config) {
    return { allowed: false, reason: "Configuração de envio não disponível" };
  }
  if (!emailAccountRotationEnabled && config.emailsSentToday >= config.dailyLimit) {
    return { allowed: false, reason: `Limite diário atingido (${config.emailsSentToday}/${config.dailyLimit})` };
  }

  // Verificar intervalo entre envios
  if (config.lastSentAt) {
    const timeSinceLastSend = Date.now() - new Date(config.lastSentAt).getTime();
    const intervalMs = config.intervalSeconds * 1000;
    if (timeSinceLastSend < intervalMs) {
      return { allowed: false, reason: `Aguardando intervalo (${Math.ceil((intervalMs - timeSinceLastSend) / 1000)}s restantes)` };
    }
  }

  return { allowed: true };
}

/**
 * Esperar o intervalo configurado entre envios
 */
async function waitForInterval(): Promise<void> {
  const config = await getSendingConfig();
  if (!config) return;
  
  const intervalMs = config.intervalSeconds * 1000;
  
  if (config.lastSentAt) {
    const timeSinceLastSend = Date.now() - new Date(config.lastSentAt).getTime();
    const waitTime = intervalMs - timeSinceLastSend;
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

/**
 * Processar emails de funis
 * Verifica leads com nextSendAt <= agora e envia os emails correspondentes
 * RESPEITA rate limiting: limite diário e intervalo entre envios
 */
async function processFunnelEmails() {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[FunnelScheduler] Banco de dados não disponível");
      return;
    }

    const { canCurrentServiceProcessQueue } = await import("./email");
    const queuePermission = await canCurrentServiceProcessQueue();
    if (!queuePermission.allowed) {
      if (queuePermission.reason) {
        console.log(`[FunnelScheduler] ${queuePermission.reason}`);
      }
      return;
    }

    const now = new Date();
    console.log(`[FunnelScheduler] 🔍 Verificando funis em ${now.toLocaleString("pt-BR")}...`);
    // Obter configuracao de ritmo de envio
    const config = await getSendingConfig();
    if (!config) {
      console.log("[FunnelScheduler] Configuracao de envio nao disponivel");
      return;
    }
    // Verificar limite diário
    if (!emailAccountRotationEnabled && config.emailsSentToday >= config.dailyLimit) {
      console.log(`[FunnelScheduler] 🛑 Limite diário atingido (${config.emailsSentToday}/${config.dailyLimit})`);
      return;
    }

    const remainingToday = emailAccountRotationEnabled
      ? 500
      : config.dailyLimit - config.emailsSentToday;
    if (emailAccountRotationEnabled) {
      console.log("[FunnelScheduler] Rotacao por conta ativa (limite global ignorado neste ciclo)");
    } else {
      console.log(`[FunnelScheduler] 📊 Envios hoje: ${config.emailsSentToday}/${config.dailyLimit} (restam ${remainingToday})`);
    }

    // Buscar progressos de funis prontos para envio
    // Ordenar por data de criação do lead (mais novos primeiro)
    const progressReadyForSend = await db
      .select({
        progress: funnelLeadProgress,
        leadCreatedAt: leads.dataCriacao,
      })
      .from(funnelLeadProgress)
      .innerJoin(leads, eq(leads.id, funnelLeadProgress.leadId))
      .innerJoin(funnels, eq(funnels.id, funnelLeadProgress.funnelId))
      .where(
        and(
          eq(funnels.ativo, 1),
          eq(funnelLeadProgress.status, "active"),
          isNotNull(funnelLeadProgress.nextSendAt),
          lte(funnelLeadProgress.nextSendAt, now)
        )
      )
      .orderBy(desc(leads.dataCriacao)) // Mais novos primeiro
      .limit(remainingToday); // Limitar ao que resta do dia

    if (progressReadyForSend.length === 0) {
      console.log("[FunnelScheduler] ✓ Nenhum email de funil pronto para envio");
      return;
    }

    console.log(`[FunnelScheduler] 📧 Encontrados ${progressReadyForSend.length} email(s) de funil prontos (limitado a ${remainingToday})`);

    // Importar funções necessárias
    const { sendEmail } = await import("./email");
    const { replaceTemplateVariables } = await import("./db");
    const { applyAICopyVariation } = await import("./email-ai-variation");
    const serviceName =
      process.env.MAILMKT_SERVICE_NAME ||
      process.env.RAILWAY_SERVICE_NAME ||
      "mailmkt";
    const fromEmail =
      process.env.MAILGUN_FROM_EMAIL ||
      process.env.SENDGRID_FROM_EMAIL ||
      "noreply@tubetoolsup.uk";

    let sentCount = 0;
    const variedTemplateCache = new Map<
      number,
      { subject: string; html: string }
    >();

    // Processar cada progresso
    for (const { progress } of progressReadyForSend) {
      try {
        // Verificar rate limiting antes de cada envio
        const canSend = await canSendEmail();
        if (!canSend.allowed) {
          console.log(`[FunnelScheduler] ⏳ ${canSend.reason} — parando ciclo`);
          break;
        }

        // Esperar intervalo entre envios
        if (sentCount > 0) {
          await waitForInterval();
        }

        // Buscar o lead
        const [lead] = await db
          .select()
          .from(leads)
          .where(eq(leads.id, progress.leadId));

        if (!lead) {
          console.warn(`[FunnelScheduler] Lead ${progress.leadId} não encontrado`);
          continue;
        }

        // Verificar se o lead cancelou inscrição
        if (lead.unsubscribed === 1) {
          console.log(`[FunnelScheduler] Lead ${lead.email} cancelou inscrição, pulando...`);
          // Marcar como cancelado no funil
          await db
            .update(funnelLeadProgress)
            .set({
              status: "cancelled",
              nextSendAt: null,
              nextTemplateId: null,
              atualizadoEm: new Date(),
            })
            .where(eq(funnelLeadProgress.id, progress.id));
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

        let baseTemplate = variedTemplateCache.get(template.id);
        if (!baseTemplate) {
          const varied = await applyAICopyVariation({
            subject: template.assunto,
            html: template.htmlContent || "",
            scopeKey: `funnel-template:${template.id}:${String(
              template.atualizadoEm || ""
            )}`,
            serviceName,
            fromEmail,
          });
          baseTemplate = { subject: varied.subject, html: varied.html };
          variedTemplateCache.set(template.id, baseTemplate);
        }

        // Substituir variáveis no template (HTML e assunto)
        const htmlContent = replaceTemplateVariables(baseTemplate.html || "", lead);
        const processedSubject = replaceTemplateVariables(
          baseTemplate.subject,
          lead
        );
        
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
          sentCount++;
          
          // Incrementar contador de rate limiting
          await incrementEmailsSentToday();
          
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

    console.log(`[FunnelScheduler] ✅ Ciclo concluído: ${sentCount} email(s) enviados neste ciclo`);
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

/**
 * Enfileirar leads existentes em um funil (em lote)
 * Adiciona leads filtrados por status, ordenados do mais novo ao mais antigo
 * @param funnelId - ID do funil
 * @param leadStatus - Filtro de status ("abandoned", "active", "all")
 * @param batchSize - Quantidade de leads a enfileirar
 */
export async function enqueueExistingLeads(
  funnelId: number,
  leadStatus: "abandoned" | "active" | "all",
  batchSize: number
): Promise<{ success: boolean; enqueued: number; skipped: number; message: string }> {
  try {
    const db = await getDb();
    if (!db) {
      return { success: false, enqueued: 0, skipped: 0, message: "Banco de dados não disponível" };
    }

    // Buscar o funil
    const [funnel] = await db.select().from(funnels).where(eq(funnels.id, funnelId));
    if (!funnel) {
      return { success: false, enqueued: 0, skipped: 0, message: "Funil não encontrado" };
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
      return { success: false, enqueued: 0, skipped: 0, message: "Funil não tem templates ativos" };
    }

    // Buscar leads que NÃO estão no funil, filtrados por status, ordenados do mais novo ao mais antigo
    // Também exclui leads que cancelaram inscrição
    const statusFilter = leadStatus === "all"
      ? sql`1=1`
      : leadStatus === "abandoned"
        ? or(eq(leads.status, "abandoned"), eq(leads.leadType, "carrinho_abandonado"))
        : or(eq(leads.status, "active"), eq(leads.leadType, "compra_aprovada"));

    const eligibleLeads = await db
      .select({ id: leads.id, timezone: leads.timezone, email: leads.email })
      .from(leads)
      .where(
        and(
          statusFilter,
          eq(leads.unsubscribed, 0),
          sql`${leads.id} NOT IN (
            SELECT lead_id FROM funnel_lead_progress 
            WHERE funnel_id = ${funnelId} 
            AND status IN ('active', 'completed')
          )`
        )
      )
      .orderBy(desc(leads.dataCriacao)) // Mais novos primeiro
      .limit(batchSize);

    if (eligibleLeads.length === 0) {
      return { success: true, enqueued: 0, skipped: 0, message: "Nenhum lead elegível encontrado" };
    }

    const { calculateSendTimeWithUnit } = await import("./timezone-utils");
    
    let enqueued = 0;
    let skipped = 0;

    for (const lead of eligibleLeads) {
      try {
        const leadTimezone = lead.timezone || "America/Sao_Paulo";
        
        const nextSendAt = calculateSendTimeWithUnit(
          firstTemplate.delayValue,
          firstTemplate.delayUnit,
          firstTemplate.sendTime,
          leadTimezone
        );

        await db.insert(funnelLeadProgress).values({
          funnelId: funnelId,
          leadId: lead.id,
          currentTemplateId: null,
          nextTemplateId: firstTemplate.id,
          nextSendAt: nextSendAt,
          status: "active",
          startedAt: new Date(),
        });

        enqueued++;
      } catch (err) {
        skipped++;
        console.warn(`[FunnelScheduler] Erro ao enfileirar lead ${lead.id}:`, err);
      }
    }

    console.log(`[FunnelScheduler] 📋 Enfileirados ${enqueued} leads no funil ${funnelId} (${skipped} pulados)`);

    return {
      success: true,
      enqueued,
      skipped,
      message: `${enqueued} leads adicionados ao funil com sucesso${skipped > 0 ? ` (${skipped} pulados)` : ""}`,
    };
  } catch (error) {
    console.error("[FunnelScheduler] ❌ Erro ao enfileirar leads:", error);
    return { success: false, enqueued: 0, skipped: 0, message: "Erro ao enfileirar leads" };
  }
}


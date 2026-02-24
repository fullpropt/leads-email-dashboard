/**
 * Scheduler para processar emails agendados com atraso
 * Verifica periodicamente leads que têm nextEmailSendAt <= agora
 * e envia os emails correspondentes
 */

let schedulerRunning = false;

/**
 * Função principal para processar emails agendados
 */
export async function processScheduledEmails() {
  if (schedulerRunning) {
    console.log("[Scheduler] Processamento já em andamento, pulando...");
    return;
  }

  schedulerRunning = true;

  try {
    const { getDb } = await import("./db");
    const { leads, emailTemplates } = await import("../drizzle/schema_postgresql");
    const { and, eq, lte, isNotNull, sql } = await import("drizzle-orm");
    const { sendEmail } = await import("./email");
    const { replaceTemplateVariables, updateLeadEmailStatus } = await import("./db");
    const { applyAICopyVariation } = await import("./email-ai-variation");
    const serviceName =
      process.env.MAILMKT_SERVICE_NAME ||
      process.env.RAILWAY_SERVICE_NAME ||
      "mailmkt";
    const fromEmail =
      process.env.MAILGUN_FROM_EMAIL ||
      process.env.SENDGRID_FROM_EMAIL ||
      process.env.DEFAULT_FROM_EMAIL ||
      "noreply@example.com";
    const variedTemplateCache = new Map<
      number,
      { subject: string; html: string }
    >();

    const db = await getDb();
    if (!db) {
      console.error("[Scheduler] Banco de dados não disponível");
      schedulerRunning = false;
      return;
    }

    try {
      const { canCurrentServiceProcessQueue } = await import("./email");
      const queuePermission = await canCurrentServiceProcessQueue();
      if (!queuePermission.allowed) {
        if (queuePermission.reason) {
          console.log(`[Scheduler] ${queuePermission.reason}`);
        }
        schedulerRunning = false;
        return;
      }

      // Buscar leads com email agendado para envio
      const now = new Date();
      
      console.log(`[Scheduler] Verificando leads com envio agendado (${now.toLocaleString("pt-BR")})`);
      
      const leadsToSend = await db
        .select()
        .from(leads)
        .where(
          and(
            isNotNull(leads.nextEmailSendAt),
            sql`${leads.nextEmailSendAt} <= ${now}`,
            eq(leads.emailEnviado, 0),
            eq(leads.isNewLeadAfterUpdate, 1) // Apenas novos leads
          )
        );

      console.log(`[Scheduler] Encontrados ${leadsToSend.length} leads para envio agendado`);

      if (leadsToSend.length === 0) {
        schedulerRunning = false;
        return;
      }

      for (const lead of leadsToSend) {
        try {
          console.log(`[Scheduler] Processando lead ID ${lead.id} (${lead.email})`);
          
          // Buscar templates de envio atrasado para este tipo de lead
          const templates = await db
            .select()
            .from(emailTemplates)
            .where(
              and(
                eq(emailTemplates.sendOnLeadDelayEnabled, 1),
                eq(emailTemplates.templateType, lead.leadType)
              )
            );
            
          // Se não houver templates específicos, tenta buscar templates genéricos
          if (templates.length === 0) {
            console.log(`[Scheduler] Nenhum template encontrado para tipo '${lead.leadType}', pulando lead`);
            continue;
          }

          console.log(`[Scheduler] Encontrados ${templates.length} template(s) para tipo '${lead.leadType}'`);

          for (const template of templates) {
            try {
              console.log(`[Scheduler] Enviando template '${template.nome}' para ${lead.email}`);

              let baseTemplate = variedTemplateCache.get(template.id);
              if (!baseTemplate) {
                const varied = await applyAICopyVariation({
                  subject: template.assunto,
                  html: template.htmlContent,
                  scopeKey: `delayed-template:${template.id}:${String(
                    template.atualizadoEm || ""
                  )}`,
                  serviceName,
                  fromEmail,
                });
                baseTemplate = { subject: varied.subject, html: varied.html };
                variedTemplateCache.set(template.id, baseTemplate);
              }
              
              const htmlContent = replaceTemplateVariables(baseTemplate.html, lead);
              const processedSubject = replaceTemplateVariables(baseTemplate.subject, lead);
              
              // Gerar/obter token de unsubscribe para o lead
              const { generateUnsubscribeToken } = await import("./db");
              const unsubscribeToken = await generateUnsubscribeToken(lead.id);
              
              // Processar template com header, CSS e rodapé (incluindo link de unsubscribe)
              const { processEmailTemplate } = await import("./emailTemplate");
              const processedHtml = processEmailTemplate(htmlContent, unsubscribeToken || undefined);
              
              const emailSent = await sendEmail({
                to: lead.email,
                subject: processedSubject,
                html: processedHtml,
              });
              
              if (emailSent) {
                await updateLeadEmailStatus(lead.id, true);
                console.log(`[Scheduler] ✓ Email agendado enviado para ${lead.email}`);
              } else {
                console.error(`[Scheduler] ✗ Falha ao enviar email para ${lead.email}`);
              }
            } catch (error) {
              console.error(`[Scheduler] Erro ao enviar template ${template.id}:`, error);
            }
          }
        } catch (error) {
          console.error(`[Scheduler] Erro ao processar lead ${lead.id}:`, error);
        }
      }
    } catch (error) {
      console.error("[Scheduler] Erro ao processar emails agendados:", error);
    }
  } finally {
    schedulerRunning = false;
  }
}

/**
 * Inicializar scheduler
 * Executa a cada 5 minutos
 */
export function initScheduler() {
  console.log("[Scheduler] Iniciando scheduler de emails agendados...");
  
  // Executar imediatamente na primeira vez
  processScheduledEmails();
  
  // Executar a cada 5 minutos
  setInterval(() => {
    processScheduledEmails();
  }, 5 * 60 * 1000);
  
  console.log("[Scheduler] Scheduler iniciado (intervalo: 5 minutos)");
}

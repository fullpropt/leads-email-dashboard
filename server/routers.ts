import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { supportRouter } from "./support-routers";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Routers para gerenciamento de leads
  leads: router({
    list: publicProcedure.query(async () => {
      const { getAllLeads } = await import("./db");
      return getAllLeads();
    }),
    listPaginated: publicProcedure
      .input(z.object({ 
        page: z.number().min(1).default(1), 
        status: z.enum(['pending', 'sent', 'all']).default('all'),
        search: z.string().optional(),
        leadStatus: z.enum(['active', 'abandoned', 'none', 'all']).default('all'),
        platformAccess: z.enum(['all', 'accessed', 'not_accessed']).default('all'),
        sortDirection: z.enum(['asc', 'desc']).default('desc')
      }))
      .query(async ({ input }) => {
        const { getLeadsWithPagination } = await import("./db");
        const emailStatus = input.status === 'all' ? undefined : input.status;
        const leadStatus = input.leadStatus === 'all' ? undefined : input.leadStatus;
        const platformAccess = input.platformAccess === 'all' ? undefined : input.platformAccess;
        return getLeadsWithPagination(input.page, emailStatus, input.search, leadStatus, platformAccess, input.sortDirection);
      }),
    updateEmailStatus: publicProcedure
      .input(z.object({ leadId: z.number(), enviado: z.boolean() }))
      .mutation(async ({ input }) => {
        const { updateLeadEmailStatus } = await import("./db");
        const success = await updateLeadEmailStatus(input.leadId, input.enviado);
        return { success };
      }),
    updateManualSendSelection: publicProcedure
      .input(z.object({ 
        leadId: z.number(), 
        selected: z.boolean() 
      }))
      .mutation(async ({ input }) => {
        const { updateLeadManualSendSelection } = await import("./db");
        const success = await updateLeadManualSendSelection(input.leadId, input.selected);
        return { success };
      }),

    updateAllManualSendSelection: publicProcedure
      .input(z.object({ 
        selected: z.boolean(),
        leadStatus: z.enum(['active', 'abandoned', 'none', 'all']).default('all'),
        platformAccess: z.enum(['all', 'accessed', 'not_accessed']).default('all'),
        search: z.string().optional()
      }))
      .mutation(async ({ input }) => {
        const { updateAllLeadsManualSendSelection } = await import("./db");
        const leadStatus = input.leadStatus === 'all' ? undefined : input.leadStatus;
        const platformAccess = input.platformAccess === 'all' ? undefined : input.platformAccess;
        const success = await updateAllLeadsManualSendSelection(
          input.selected,
          leadStatus,
          platformAccess,
          input.search
        );
        return { success };
      }),

    getSelectedCount: publicProcedure
      .query(async () => {
        const { getSelectedLeadsCount } = await import("./db");
        return getSelectedLeadsCount();
      }),

    getAccessStats: publicProcedure
      .query(async () => {
        const { getLeadsAccessStats } = await import("./db");
        return getLeadsAccessStats();
      }),

    getChargebackStats: publicProcedure
      .query(async () => {
        const { getChargebackStats } = await import("./db");
        return getChargebackStats();
      }),

    // Consulta detalhada de um lead por email (integra dados MailMKT + TubeTools)
    getDetailedByEmail: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .query(async ({ input }) => {
        const { getLeadByEmail, getEmailHistoryByLeadId } = await import("./db");
        const { getFullUserDetailsByEmail } = await import("./tubetools-db");

        // Buscar lead no banco MailMKT
        const lead = await getLeadByEmail(input.email);
        
        // Buscar histórico de emails enviados
        const emailHistory = lead ? await getEmailHistoryByLeadId(lead.id) : [];
        
        // Buscar dados completos do TubeTools
        const tubetoolsData = await getFullUserDetailsByEmail(input.email);

        return {
          found: !!lead || !!tubetoolsData,
          mailmkt: lead ? {
            id: lead.id,
            nome: lead.nome,
            email: lead.email,
            produto: lead.produto,
            plano: lead.plano,
            valor: lead.valor,
            dataAprovacao: lead.dataAprovacao,
            dataCriacao: lead.dataCriacao,
            emailEnviado: lead.emailEnviado === 1,
            dataEnvioEmail: lead.dataEnvioEmail,
            status: lead.status,
            leadType: lead.leadType,
            hasAccessedPlatform: lead.hasAccessedPlatform === 1,
            emailHistory,
          } : null,
          tubetools: tubetoolsData,
        };
      }),

    // ===== UNSUBSCRIBE ENDPOINTS =====
    unsubscribe: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const { processUnsubscribe } = await import("./db");
        return processUnsubscribe(input.token);
      }),

    checkSubscription: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .query(async ({ input }) => {
        const { isLeadSubscribed } = await import("./db");
        const subscribed = await isLeadSubscribed(input.email);
        return { subscribed };
      }),
  }),

  // Routers para gerenciamento de templates de email
  emailTemplates: router({
    list: publicProcedure.query(async () => {
      const { getAllEmailTemplates } = await import("./db");
      return getAllEmailTemplates();
    }),
    getActive: publicProcedure.query(async () => {
      const { getActiveEmailTemplate } = await import("./db");
      return getActiveEmailTemplate();
    }),
    create: publicProcedure
      .input(
        z.object({
          nome: z.string().min(1),
          assunto: z.string().min(1),
          htmlContent: z.string().min(1),
          templateType: z.enum(["compra_aprovada", "novo_cadastro", "programado", "carrinho_abandonado"]).default("compra_aprovada"),
          // ===== NOVOS CAMPOS PARA FILTROS E MODO DE ENVIO =====
          targetStatusPlataforma: z.enum(["all", "accessed", "not_accessed"]).default("all"),
          targetSituacao: z.enum(["all", "active", "abandoned", "none"]).default("all"),
          sendMode: z.enum(["automatic", "scheduled", "manual"]).default("manual"),
          // ===== CAMPOS PARA AGENDAMENTO =====
          sendOnLeadDelayEnabled: z.number().min(0).max(1).optional(),
          delayDaysAfterLeadCreation: z.number().min(0).optional(),
          scheduleEnabled: z.number().min(0).max(1).optional(),
          scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          scheduleInterval: z.number().min(1).optional(),
          scheduleIntervalType: z.enum(["days", "weeks"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { createEmailTemplate } = await import("./db");
        const templateId = await createEmailTemplate({
          ...input,
          ativo: 1,
        });
        return { success: !!templateId, templateId };
      }),
    update: publicProcedure
      .input(
        z.object({
          templateId: z.number(),
          updates: z.object({
            nome: z.string().min(1).optional(),
            assunto: z.string().min(1).optional(),
            htmlContent: z.string().min(1).optional(),
            // ===== NOVOS CAMPOS PARA FILTROS E MODO DE ENVIO =====
            targetStatusPlataforma: z.enum(["all", "accessed", "not_accessed"]).optional(),
            targetSituacao: z.enum(["all", "active", "abandoned", "none"]).optional(),
            sendMode: z.enum(["automatic", "scheduled", "manual"]).optional(),
            // ===== CAMPOS EXISTENTES PARA MÚLTIPLOS TIPOS DE ENVIO =====
            sendImmediateEnabled: z.number().min(0).max(1).optional(),
            autoSendOnLeadEnabled: z.number().min(0).max(1).optional(),
            sendOnLeadDelayEnabled: z.number().min(0).max(1).optional(),
            delayDaysAfterLeadCreation: z.number().min(0).optional(),
            scheduleEnabled: z.number().min(0).max(1).optional(),
            scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
            scheduleInterval: z.number().min(1).optional(),
            scheduleIntervalType: z.enum(["days", "weeks"]).optional(),
            templateType: z.enum(["compra_aprovada", "novo_cadastro", "programado", "carrinho_abandonado"]).optional(),
          }),
        })
      )
      .mutation(async ({ input }) => {
        const { updateEmailTemplate } = await import("./db");
        const success = await updateEmailTemplate(input.templateId, input.updates);
        return { success };
      }),
    delete: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteEmailTemplate } = await import("./db");
        const success = await deleteEmailTemplate(input.templateId);
        return { success };
      }),
    setActive: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { setActiveEmailTemplate } = await import("./db");
        const success = await setActiveEmailTemplate(input.templateId);
        return { success };
      }),
    previewWithFirstLead: publicProcedure
      .input(z.object({ templateId: z.number().min(1) }))
      .query(async ({ input }) => {
        const { getAllLeads, replaceTemplateVariables, getEmailTemplateById } = await import("./db");
        
        console.log("[DEBUG ROTA] Input recebido:", input);
        console.log("[DEBUG ROTA] Input.templateId:", input.templateId);
        console.log("[DEBUG ROTA] Tipo de templateId:", typeof input.templateId);
        
        const leads = await getAllLeads();
        if (leads.length === 0) {
          return { success: false, html: "", message: "Nenhum lead disponível para preview" };
        }
        
        // Buscar o template do banco de dados
        console.log("[DEBUG ROTA] Chamando getEmailTemplateById com:", input.templateId);
        const template = await getEmailTemplateById(input.templateId);
        console.log("[DEBUG] Template ID:", input.templateId);
        console.log("[DEBUG] Template encontrado:", template);
        if (!template || !template.htmlContent) {
          console.log("[DEBUG] Template vazio ou sem HTML");
          return { success: false, html: "", message: "Template não encontrado ou sem conteúdo HTML" };
        }
        
        const replacedHtml = replaceTemplateVariables(template.htmlContent, leads[0]);
        
        // ✅ CORREÇÃO: Aplicar o processamento de template com header, CSS e rodapé
        const { processEmailTemplate } = await import("./emailTemplate");
        const html = processEmailTemplate(replacedHtml);
        
        return { success: true, html, message: "Preview gerado com sucesso" };
      }),
    toggleActive: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { toggleEmailTemplateActive } = await import("./db");
        const success = await toggleEmailTemplateActive(input.templateId);
        return { success };
      }),
    getByType: publicProcedure
      .input(z.object({
        templateType: z.enum(["compra_aprovada", "novo_cadastro", "programado", "carrinho_abandonado"]),
      }))
      .query(async ({ input }) => {
        const { getTemplatesByType } = await import("./db");
        return getTemplatesByType(input.templateType);
      }),
    // Obter contagem de emails enviados por template
    getEmailSentCount: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .query(async ({ input }) => {
        const { getEmailSentCountByTemplate } = await import("./db");
        return { count: await getEmailSentCountByTemplate(input.templateId) };
      }),
    // Obter contagem de emails enviados para todos os templates
    getAllEmailSentCounts: publicProcedure
      .query(async () => {
        const { getAllTemplatesEmailSentCounts } = await import("./db");
        return await getAllTemplatesEmailSentCounts();
      }),
  }),
  
  // Router para webhooks
  webhooks: router({
    newSignup: publicProcedure
      .input(z.object({
        name: z.string(),
        email: z.string().email(),
        full_name: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { processNewSignupWebhook } = await import("./webhooks-signup");
        return processNewSignupWebhook(input);
      }),
  }),

  // Router para recuperação de senha (TubeTools)
  passwordReset: router({
    sendResetEmail: publicProcedure
      .input(z.object({ 
        email: z.string().email(),
        resetToken: z.string(),
        appName: z.string().default('TubeTools')
      }))
      .mutation(async ({ input }) => {
        const { sendEmail } = await import("./email");

        const resetLink = `https://tubetoolsacess.work/reset-password?token=${input.resetToken}`;
        
        const htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { 
                  font-family: Arial, sans-serif; 
                  background-color: #f5f5f5;
                  margin: 0;
                  padding: 0;
                }
                .container { 
                  max-width: 600px; 
                  margin: 40px auto; 
                  background-color: white;
                  border-radius: 8px;
                  overflow: hidden;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header { 
                  background-color: #dc2626; 
                  color: white; 
                  padding: 30px 20px;
                  text-align: center;
                }
                .header h1 {
                  margin: 0;
                  font-size: 24px;
                }
                .content { 
                  padding: 40px 30px;
                  line-height: 1.6;
                  color: #333;
                }
                .button { 
                  display: inline-block;
                  background-color: #dc2626; 
                  color: white !important; 
                  padding: 14px 30px; 
                  text-decoration: none; 
                  border-radius: 5px;
                  margin: 20px 0;
                  font-weight: bold;
                }
                .footer {
                  background-color: #f9f9f9;
                  padding: 20px;
                  text-align: center;
                  font-size: 12px;
                  color: #666;
                  border-top: 1px solid #eee;
                }
                .warning {
                  background-color: #fff3cd;
                  border-left: 4px solid #ffc107;
                  padding: 15px;
                  margin: 20px 0;
                  font-size: 14px;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🔐 Reset Password - ${input.appName}</h1>
                </div>
                <div class="content">
                  <p>Hello,</p>
                  <p>We received a request to reset your password for your <strong>${input.appName}</strong> account.</p>
                  <p>Click the button below to create a new password:</p>
                  
                  <div style="text-align: center;">
                    <a href="${resetLink}" class="button">Reset My Password</a>
                  </div>

                  <div class="warning">
                    <strong>⚠️ Important:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                      <li>This link expires in <strong>1 hour</strong></li>
                      <li>If you didn't request this reset, ignore this email</li>
                      <li>Your current password will remain unchanged</li>
                    </ul>
                  </div>

                  <p style="margin-top: 30px; font-size: 14px; color: #666;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 12px;">
                    ${resetLink}
                  </p>
                </div>
                <div class="footer">
                  <p>This is an automated email, please do not reply.</p>
                  <p>© ${new Date().getFullYear()} ${input.appName}. All rights reserved.</p>
                </div>
              </div>
            </body>
          </html>
        `;

        const success = await sendEmail({
          to: input.email,
          subject: `🔐 Reset Password - ${input.appName}`,
          html: htmlContent,
        });

        if (success) {
          return { 
            success: true, 
            message: "Password reset email sent successfully" 
          };
        } else {
          return { 
            success: false, 
            message: "Error sending password reset email" 
          };
        }
      }),
  }),

  // Routers para envio de emails
  email: router({
    // Enviar email para um lead específico usando um template específico
    sendToLead: publicProcedure
      .input(z.object({ leadId: z.number(), templateId: z.number().optional() }))
      .mutation(async ({ input }) => {
        const { getAllLeads, updateLeadEmailStatus, replaceTemplateVariables, getEmailTemplateById } = await import("./db");
        const { sendEmail } = await import("./email");

        // Buscar o lead
        const leads = await getAllLeads();
        const lead = leads.find((l) => l.id === input.leadId);
        if (!lead) {
          return { success: false, message: "Lead não encontrado" };
        }

        // Buscar template (específico ou ativo)
        let template;
        if (input.templateId) {
          template = await getEmailTemplateById(input.templateId);
        } else {
          const { getActiveEmailTemplate } = await import("./db");
          template = await getActiveEmailTemplate();
        }
        
        if (!template) {
          return { success: false, message: "Nenhum template encontrado" };
        }

        // Substituir variáveis no HTML usando função utilitária
        const htmlContent = replaceTemplateVariables(template.htmlContent, lead);
        
        // Processar template com header, CSS e rodapé
        const { processEmailTemplate } = await import("./emailTemplate");
        const processedHtml = processEmailTemplate(htmlContent);

        // Enviar email
        const success = await sendEmail({
          to: lead.email,
          subject: template.assunto,
          html: processedHtml,
        });

        if (success) {
          await updateLeadEmailStatus(input.leadId, true);
          return { success: true, message: "Email enviado com sucesso" };
        } else {
          return { success: false, message: "Erro ao enviar email" };
        }
      }),
    
    // Enviar email imediato para todos os leads pendentes usando um template específico
    // Aplica os filtros de targetStatusPlataforma e targetSituacao do template
    sendImmediateToAllPending: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { updateLeadEmailStatus, replaceTemplateVariables, getEmailTemplateById, getLeadsForTemplateFilters, recordEmailSend } = await import("./db");
        const { sendEmail } = await import("./email");

        const template = await getEmailTemplateById(input.templateId);
        if (!template) {
          return { success: false, sent: 0, failed: 0, message: "Template não encontrado" };
        }

        // Usar os filtros do template para buscar leads
        const targetStatusPlataforma = (template.targetStatusPlataforma || "all") as "all" | "accessed" | "not_accessed";
        const targetSituacao = (template.targetSituacao || "all") as "all" | "active" | "abandoned" | "none";
        
        const pendingLeads = await getLeadsForTemplateFilters(targetStatusPlataforma, targetSituacao, true);

        if (pendingLeads.length === 0) {
          return { success: true, sent: 0, failed: 0, message: "Nenhum lead pendente com os filtros selecionados" };
        }

        let sent = 0;
        let failed = 0;

        // Importar processEmailTemplate uma vez fora do loop
        const { processEmailTemplate } = await import("./emailTemplate");
        
        for (const lead of pendingLeads) {
          const htmlContent = replaceTemplateVariables(template.htmlContent, lead);
          const processedHtml = processEmailTemplate(htmlContent);

          const success = await sendEmail({
            to: lead.email,
            subject: template.assunto,
            html: processedHtml,
          });

          if (success) {
            await updateLeadEmailStatus(lead.id, true);
            await recordEmailSend(input.templateId, lead.id, "immediate", "sent");
            sent++;
          } else {
            await recordEmailSend(input.templateId, lead.id, "immediate", "failed");
            failed++;
          }

          // Aguardar 1 segundo entre envios para evitar rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        return {
          success: true,
          sent,
          failed,
          message: `${sent} emails enviados, ${failed} falharam`,
        };
      }),
    
    // Enviar email para todos os leads (independente do status)
    sendToAllLeads: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { getAllLeads, replaceTemplateVariables, getEmailTemplateById } = await import("./db");
        const { sendEmail } = await import("./email");

        const leads = await getAllLeads();

        if (leads.length === 0) {
          return { success: true, sent: 0, failed: 0, message: "Nenhum lead disponível" };
        }

        const template = await getEmailTemplateById(input.templateId);
        if (!template) {
          return { success: false, sent: 0, failed: 0, message: "Template não encontrado" };
        }

        let sent = 0;
        let failed = 0;

        // Importar processEmailTemplate uma vez fora do loop
        const { processEmailTemplate } = await import("./emailTemplate");

        for (const lead of leads) {
          const htmlContent = replaceTemplateVariables(template.htmlContent, lead);
          const processedHtml = processEmailTemplate(htmlContent);

          const success = await sendEmail({
            to: lead.email,
            subject: template.assunto,
            html: processedHtml,
          });

          if (success) {
            sent++;
          } else {
            failed++;
          }

          // Aguardar 1 segundo entre envios para evitar rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        return {
          success: true,
          sent,
          failed,
          message: `${sent} emails enviados, ${failed} falharam`,
        };
      }),
    
    testConnection: publicProcedure.query(async () => {
      const { testEmailConnection } = await import("./email");
      const isConnected = await testEmailConnection();
      return { connected: isConnected };
    }),
    
    sendToSelectedLeads: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { getSelectedLeadsForManualSend, updateLeadEmailStatus, replaceTemplateVariables, getEmailTemplateById, recordEmailSend } = await import("./db");
        const { sendEmail } = await import("./email");

        const selectedLeads = await getSelectedLeadsForManualSend();
        
        if (selectedLeads.length === 0) {
          return { success: true, sent: 0, failed: 0, message: "Nenhum lead selecionado" };
        }

        const template = await getEmailTemplateById(input.templateId);
        if (!template) {
          return { success: false, message: "Template não encontrado" };
        }

        let sent = 0;
        let failed = 0;

        // Importar processEmailTemplate uma vez fora do loop
        const { processEmailTemplate } = await import("./emailTemplate");

        for (const lead of selectedLeads) {
          try {
            const htmlContent = replaceTemplateVariables(template.htmlContent, lead);
            const processedHtml = processEmailTemplate(htmlContent);
            const success = await sendEmail({
              to: lead.email,
              subject: template.assunto,
              html: processedHtml,
            });

            if (success) {
              await updateLeadEmailStatus(lead.id, true);
              await recordEmailSend(input.templateId, lead.id, "manual", "sent");
              sent++;
            } else {
              await recordEmailSend(input.templateId, lead.id, "manual", "failed");
              failed++;
            }
          } catch (error) {
            console.error(`Erro ao enviar email para lead ${lead.id}:`, error);
            await recordEmailSend(input.templateId, lead.id, "manual", "failed", String(error));
            failed++;
          }
        }

        return { success: true, sent, failed, message: `${sent} emails enviados, ${failed} falharam` };
      }),
  }),

  // Routers para gerenciamento de auto-envio
  autoSend: router({
    getStatus: publicProcedure.query(async () => {
      const { getAutoSendStatus } = await import("./db");
      return await getAutoSendStatus();
    }),
    
    toggle: publicProcedure
      .input(z.boolean())
      .mutation(async ({ input }) => {
        const { toggleAutoSend } = await import("./db");
        return await toggleAutoSend(input);
      }),
  }),

  // Routers para sincronização com TubeTools
  tubetools: router({
    // Sincronizar todos os leads
    syncAll: publicProcedure.mutation(async () => {
      const { syncAllLeadsWithTubetools } = await import("./sync-tubetools");
      return await syncAllLeadsWithTubetools();
    }),

    // Sincronizar apenas leads não verificados
    syncUnverified: publicProcedure.mutation(async () => {
      const { syncUnverifiedLeadsWithTubetools } = await import("./sync-tubetools");
      return await syncUnverifiedLeadsWithTubetools();
    }),

    // Sincronizar um único lead
    syncSingle: publicProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async ({ input }) => {
        const { syncSingleLead } = await import("./sync-tubetools");
        const success = await syncSingleLead(input.leadId);
        return { success };
      }),

    // Buscar leads que acessaram a plataforma
    getAccessedLeads: publicProcedure.query(async () => {
      const { getLeadsWhoAccessedPlatform } = await import("./db");
      return await getLeadsWhoAccessedPlatform();
    }),

    // Buscar leads que NÃO acessaram a plataforma
    getNotAccessedLeads: publicProcedure.query(async () => {
      const { getLeadsWhoDidNotAccessPlatform } = await import("./db");
      return await getLeadsWhoDidNotAccessPlatform();
    }),

    // Buscar analytics do TubeTools
    getAnalytics: publicProcedure.query(async () => {
      const { getTubetoolsAnalytics } = await import("./tubetools-db");
      return await getTubetoolsAnalytics();
    }),

    // Buscar informações de um usuário específico por email
    getUserByEmail: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .query(async ({ input }) => {
        const { getTubetoolsUserByEmail } = await import("./tubetools-db");
        return await getTubetoolsUserByEmail(input.email);
      }),

    // Buscar analytics temporais (votos por hora, cadastros por dia, etc)
    getTemporalAnalytics: publicProcedure.query(async () => {
      const { getTemporalAnalytics } = await import("./tubetools-db");
      return await getTemporalAnalytics();
    }),

    // Obter status do scheduler de sincronização
    getSyncSchedulerStatus: publicProcedure.query(async () => {
      const { getSyncSchedulerStatus } = await import("./scheduler-sync-tubetools");
      return getSyncSchedulerStatus();
    }),

    // Forçar sincronização completa
    forceFullSync: publicProcedure.mutation(async () => {
      const { forceFullSync } = await import("./scheduler-sync-tubetools");
      return await forceFullSync();
    }),
  }),

  // ==================== ROUTER DE FUNIS ====================
  funnels: router({
    list: publicProcedure.query(async () => {
      const { getAllFunnels } = await import("./db");
      return getAllFunnels();
    }),

    // Obter estatísticas de emails enviados por funil
    getEmailStats: publicProcedure.query(async () => {
      const { getFunnelEmailStats } = await import("./db");
      return getFunnelEmailStats();
    }),

    // Obter estatísticas de um funil específico
    getEmailStatsByFunnelId: publicProcedure
      .input(z.object({ funnelId: z.number() }))
      .query(async ({ input }) => {
        const { getFunnelEmailStatsByFunnelId } = await import("./db");
        return getFunnelEmailStatsByFunnelId(input.funnelId);
      }),

    create: publicProcedure
      .input(z.object({
        nome: z.string(),
        targetStatusPlataforma: z.enum(["all", "accessed", "not_accessed"]),
        targetSituacao: z.enum(["all", "active", "abandoned"]),
      }))
      .mutation(async ({ input }) => {
        const { createFunnel } = await import("./db");
        const funnel = await createFunnel(input);
        return { success: !!funnel, funnel };
      }),

    getById: publicProcedure
      .input(z.object({ funnelId: z.number() }))
      .query(async ({ input }) => {
        const { getFunnelById } = await import("./db");
        return getFunnelById(input.funnelId);
      }),

    getWithTemplates: publicProcedure
      .input(z.object({ funnelId: z.number() }))
      .query(async ({ input }) => {
        const { getFunnelWithTemplates } = await import("./db");
        return getFunnelWithTemplates(input.funnelId);
      }),

    update: publicProcedure
      .input(z.object({
        funnelId: z.number(),
        updates: z.object({
          nome: z.string().optional(),
          descricao: z.string().optional(),
          targetStatusPlataforma: z.string().optional(),
          targetSituacao: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const { updateFunnel } = await import("./db");
        return updateFunnel(input.funnelId, input.updates);
      }),

    toggleActive: publicProcedure
      .input(z.object({ funnelId: z.number() }))
      .mutation(async ({ input }) => {
        const { toggleFunnelActive } = await import("./db");
        return toggleFunnelActive(input.funnelId);
      }),

    delete: publicProcedure
      .input(z.object({ funnelId: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteFunnel } = await import("./db");
        return deleteFunnel(input.funnelId);
      }),
  }),

  // ==================== ROUTER DE TEMPLATES DE FUNIL ====================
  funnelTemplates: router({
    create: publicProcedure
      .input(z.object({
        funnelId: z.number(),
        delayValue: z.number(),
        delayUnit: z.enum(["hours", "days", "weeks"]),
        sendTime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createFunnelTemplate } = await import("./db");
        const template = await createFunnelTemplate(input);
        return { success: !!template, template };
      }),

    update: publicProcedure
      .input(z.object({
        templateId: z.number(),
        updates: z.object({
          nome: z.string().optional(),
          assunto: z.string().optional(),
          htmlContent: z.string().optional(),
          delayValue: z.number().optional(),
          delayUnit: z.enum(["hours", "days", "weeks"]).optional(),
          sendTime: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const { updateFunnelTemplate } = await import("./db");
        return updateFunnelTemplate(input.templateId, input.updates);
      }),

    toggleActive: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { toggleFunnelTemplateActive } = await import("./db");
        return toggleFunnelTemplateActive(input.templateId);
      }),

    delete: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteFunnelTemplate } = await import("./db");
        return deleteFunnelTemplate(input.templateId);
      }),

    getById: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .query(async ({ input }) => {
        const { getFunnelTemplateById } = await import("./db");
        return getFunnelTemplateById(input.templateId);
      }),

    previewWithFirstLead: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .query(async ({ input }) => {
        const { getFunnelTemplateById, getFirstLead, replaceTemplateVariables } = await import("./db");
        const template = await getFunnelTemplateById(input.templateId);
        const lead = await getFirstLead();

        if (!template || !template.htmlContent) {
          return { success: false, html: "", message: "Template não encontrado ou sem conteúdo HTML" };
        }

        // Substituir variáveis do template com dados do lead
        let replacedHtml = template.htmlContent;
        if (lead) {
          replacedHtml = replaceTemplateVariables(template.htmlContent, lead);
        }

        // Aplicar o processamento de template com header, CSS e rodapé
        const { processEmailTemplate } = await import("./emailTemplate");
        const html = processEmailTemplate(replacedHtml);

        return { success: true, html };
      }),
  }),

  // Router para sistema de suporte por email
  support: supportRouter,

});
export type AppRouter = typeof appRouter;

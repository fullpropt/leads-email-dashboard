import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

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
        leadStatus: z.enum(['active', 'abandoned', 'all']).default('all')
      }))
      .query(async ({ input }) => {
        const { getLeadsWithPagination } = await import("./db");
        const emailStatus = input.status === 'all' ? undefined : input.status;
        const leadStatus = input.leadStatus === 'all' ? undefined : input.leadStatus;
        return getLeadsWithPagination(input.page, emailStatus, input.search, leadStatus);
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
      .input(z.object({ selected: z.boolean() }))
      .mutation(async ({ input }) => {
        const { updateAllLeadsManualSendSelection } = await import("./db");
        const success = await updateAllLeadsManualSendSelection(input.selected);
        return { success };
      }),

    getSelectedCount: publicProcedure
      .query(async () => {
        const { getSelectedLeadsCount } = await import("./db");
        return getSelectedLeadsCount();
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
            // ===== NOVOS CAMPOS PARA MÚLTIPLOS TIPOS DE ENVIO =====
            sendImmediateEnabled: z.number().min(0).max(1).optional(),
            autoSendOnLeadEnabled: z.number().min(0).max(1).optional(),
            scheduleEnabled: z.number().min(0).max(1).optional(),
            scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
            scheduleInterval: z.number().min(1).optional(),
            scheduleIntervalType: z.enum(["days", "weeks"]).optional(),
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
        
        const html = replaceTemplateVariables(template.htmlContent, leads[0]);
        return { success: true, html, message: "Preview gerado com sucesso" };
      }),
    toggleActive: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { toggleEmailTemplateActive } = await import("./db");
        const success = await toggleEmailTemplateActive(input.templateId);
        return { success };
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

        const resetLink = `https://youtbviews.online/reset-password?token=${input.resetToken}`;
        
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

        // Enviar email
        const success = await sendEmail({
          to: lead.email,
          subject: template.assunto,
          html: htmlContent,
        });

        if (success) {
          await updateLeadEmailStatus(input.leadId, true);
          return { success: true, message: "Email enviado com sucesso" };
        } else {
          return { success: false, message: "Erro ao enviar email" };
        }
      }),
    
    // Enviar email imediato para todos os leads pendentes usando um template específico
    sendImmediateToAllPending: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { getAllLeads, updateLeadEmailStatus, replaceTemplateVariables, getEmailTemplateById } = await import("./db");
        const { sendEmail } = await import("./email");

        const leads = await getAllLeads();
        const pendingLeads = leads.filter((l) => l.emailEnviado === 0);

        if (pendingLeads.length === 0) {
          return { success: true, sent: 0, failed: 0, message: "Nenhum lead pendente" };
        }

        const template = await getEmailTemplateById(input.templateId);
        if (!template) {
          return { success: false, sent: 0, failed: 0, message: "Template não encontrado" };
        }

        let sent = 0;
        let failed = 0;

        for (const lead of pendingLeads) {
          const htmlContent = replaceTemplateVariables(template.htmlContent, lead);

          const success = await sendEmail({
            to: lead.email,
            subject: template.assunto,
            html: htmlContent,
          });

          if (success) {
            await updateLeadEmailStatus(lead.id, true);
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

        for (const lead of leads) {
          const htmlContent = replaceTemplateVariables(template.htmlContent, lead);

          const success = await sendEmail({
            to: lead.email,
            subject: template.assunto,
            html: htmlContent,
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
        const { getSelectedLeadsForManualSend, updateLeadEmailStatus, replaceTemplateVariables, getEmailTemplateById } = await import("./db");
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

        for (const lead of selectedLeads) {
          try {
            const htmlContent = replaceTemplateVariables(template.htmlContent, lead);
            const success = await sendEmail({
              to: lead.email,
              subject: template.assunto,
              html: htmlContent,
            });

            if (success) {
              await updateLeadEmailStatus(lead.id, true);
              sent++;
            } else {
              failed++;
            }
          } catch (error) {
            console.error(`Erro ao enviar email para lead ${lead.id}:`, error);
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
});

export type AppRouter = typeof appRouter;

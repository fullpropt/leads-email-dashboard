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
        search: z.string().optional()
      }))
      .query(async ({ input }) => {
        const { getLeadsWithPagination } = await import("./db");
        const status = input.status === 'all' ? undefined : input.status;
        return getLeadsWithPagination(input.page, status, input.search);
      }),
    updateEmailStatus: publicProcedure
      .input(z.object({ leadId: z.number(), enviado: z.boolean() }))
      .mutation(async ({ input }) => {
        const { updateLeadEmailStatus } = await import("./db");
        const success = await updateLeadEmailStatus(input.leadId, input.enviado);
        return { success };
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

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
    setActive: publicProcedure
      .input(z.object({ templateId: z.number() }))
      .mutation(async ({ input }) => {
        const { setActiveEmailTemplate } = await import("./db");
        const success = await setActiveEmailTemplate(input.templateId);
        return { success };
      }),
  }),

  // Routers para envio de emails
  email: router({
    sendToLead: publicProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async ({ input }) => {
        const { getAllLeads, updateLeadEmailStatus } = await import("./db");
        const { getActiveEmailTemplate } = await import("./db");
        const { sendEmail } = await import("./email");

        // Buscar o lead
        const leads = await getAllLeads();
        const lead = leads.find((l) => l.id === input.leadId);
        if (!lead) {
          return { success: false, message: "Lead não encontrado" };
        }

        // Buscar template ativo
        const template = await getActiveEmailTemplate();
        if (!template) {
          return { success: false, message: "Nenhum template ativo encontrado" };
        }

        // Substituir variáveis no HTML
        let htmlContent = template.htmlContent;
        htmlContent = htmlContent.replace(/\{\{nome\}\}/g, lead.nome);
        htmlContent = htmlContent.replace(/\{\{email\}\}/g, lead.email);
        htmlContent = htmlContent.replace(/\{\{produto\}\}/g, lead.produto || "");
        htmlContent = htmlContent.replace(/\{\{plano\}\}/g, lead.plano || "");

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
    sendToAllPending: publicProcedure.mutation(async () => {
      const { getAllLeads, updateLeadEmailStatus } = await import("./db");
      const { getActiveEmailTemplate } = await import("./db");
      const { sendEmail } = await import("./email");

      const leads = await getAllLeads();
      const pendingLeads = leads.filter((l) => l.emailEnviado === 0);

      if (pendingLeads.length === 0) {
        return { success: true, sent: 0, failed: 0, message: "Nenhum lead pendente" };
      }

      const template = await getActiveEmailTemplate();
      if (!template) {
        return { success: false, sent: 0, failed: 0, message: "Nenhum template ativo" };
      }

      let sent = 0;
      let failed = 0;

      for (const lead of pendingLeads) {
        let htmlContent = template.htmlContent;
        htmlContent = htmlContent.replace(/\{\{nome\}\}/g, lead.nome);
        htmlContent = htmlContent.replace(/\{\{email\}\}/g, lead.email);
        htmlContent = htmlContent.replace(/\{\{produto\}\}/g, lead.produto || "");
        htmlContent = htmlContent.replace(/\{\{plano\}\}/g, lead.plano || "");

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

        // Delay de 1 segundo entre envios para evitar rate limiting
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
});

export type AppRouter = typeof appRouter;

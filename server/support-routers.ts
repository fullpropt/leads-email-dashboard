/**
 * Rotas da API para o sistema de suporte por email
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";

export const supportRouter = router({
  // ==================== ESTATÍSTICAS ====================
  
  getStats: publicProcedure.query(async () => {
    const { getSupportStats } = await import("./support-db");
    return getSupportStats();
  }),

  // ==================== EMAILS ====================

  listEmails: publicProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(["pending", "grouped", "responded", "archived", "all"]).default("all"),
        groupId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const { getSupportEmails } = await import("./support-db");
      const status = input.status === "all" ? undefined : input.status;
      return getSupportEmails(input.page, input.limit, status, input.groupId);
    }),

  getEmailById: publicProcedure
    .input(z.object({ emailId: z.number() }))
    .query(async ({ input }) => {
      const { getSupportEmailById } = await import("./support-db");
      return getSupportEmailById(input.emailId);
    }),

  getEmailsByGroup: publicProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const { getEmailsByGroupId } = await import("./support-db");
      return getEmailsByGroupId(input.groupId);
    }),

  getUngroupedEmails: publicProcedure.query(async () => {
    const { getUngroupedSupportEmails } = await import("./support-db");
    return getUngroupedSupportEmails();
  }),

  // ==================== GRUPOS ====================

  listGroups: publicProcedure
    .input(
      z.object({
        status: z.enum(["active", "archived", "all"]).default("active"),
      }).optional()
    )
    .query(async ({ input }) => {
      const { getSupportEmailGroups } = await import("./support-db");
      const status = input?.status === "all" ? undefined : input?.status || "active";
      return getSupportEmailGroups(status);
    }),

  getGroupById: publicProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const { getSupportEmailGroupById, getEmailsByGroupId, getGroupSuggestedResponse } = await import("./support-db");
      
      const [group, emails, suggestedResponse] = await Promise.all([
        getSupportEmailGroupById(input.groupId),
        getEmailsByGroupId(input.groupId),
        getGroupSuggestedResponse(input.groupId),
      ]);

      return {
        group,
        emails,
        suggestedResponse,
      };
    }),

  createGroup: publicProcedure
    .input(
      z.object({
        nome: z.string().min(1),
        descricao: z.string().optional(),
        categoria: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { createSupportEmailGroup } = await import("./support-db");
      const groupId = await createSupportEmailGroup({
        nome: input.nome,
        descricao: input.descricao || null,
        categoria: input.categoria || null,
        status: "active",
      });
      return { success: !!groupId, groupId };
    }),

  assignEmailsToGroup: publicProcedure
    .input(
      z.object({
        emailIds: z.array(z.number()),
        groupId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const { assignEmailsToGroup } = await import("./support-db");
      const success = await assignEmailsToGroup(input.emailIds, input.groupId);
      return { success };
    }),

  // ==================== CLASSIFICAÇÃO IA ====================

  classifyEmails: publicProcedure.mutation(async () => {
    const { classifyAndGroupEmails } = await import("./support-ai");
    return classifyAndGroupEmails();
  }),

  // ==================== RESPOSTAS ====================

  generateGroupResponse: publicProcedure
    .input(
      z.object({
        groupId: z.number(),
        instructions: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { generateGroupResponse } = await import("./support-ai");
      return generateGroupResponse(input.groupId, input.instructions);
    }),

  generateEmailResponse: publicProcedure
    .input(
      z.object({
        emailId: z.number(),
        instructions: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { generateEmailResponse } = await import("./support-ai");
      return generateEmailResponse(input.emailId, input.instructions);
    }),

  regenerateResponse: publicProcedure
    .input(
      z.object({
        responseId: z.number(),
        instructions: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { regenerateResponse } = await import("./support-ai");
      return regenerateResponse(input.responseId, input.instructions);
    }),

  getResponseById: publicProcedure
    .input(z.object({ responseId: z.number() }))
    .query(async ({ input }) => {
      const { getSupportResponseById } = await import("./support-db");
      return getSupportResponseById(input.responseId);
    }),

  updateResponse: publicProcedure
    .input(
      z.object({
        responseId: z.number(),
        subject: z.string().optional(),
        bodyHtml: z.string().optional(),
        bodyPlain: z.string().optional(),
        status: z.enum(["draft", "approved", "sent"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { updateSupportResponse } = await import("./support-db");
      const { responseId, ...updates } = input;
      const success = await updateSupportResponse(responseId, updates);
      return { success };
    }),

  // ==================== ENVIO DE RESPOSTAS ====================

  sendResponse: publicProcedure
    .input(
      z.object({
        responseId: z.number(),
        emailIds: z.array(z.number()), // IDs dos emails para responder
      })
    )
    .mutation(async ({ input }) => {
      const { getSupportResponseById, getSupportEmailById, markEmailAsResponded, createResponseHistory } = await import("./support-db");
      const { sendEmail } = await import("./email");

      const response = await getSupportResponseById(input.responseId);
      if (!response) {
        return { success: false, error: "Resposta não encontrada" };
      }

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const emailId of input.emailIds) {
        const email = await getSupportEmailById(emailId);
        if (!email) {
          failed++;
          errors.push(`Email ${emailId} não encontrado`);
          continue;
        }

        try {
          const success = await sendEmail({
            to: email.sender,
            subject: response.subject,
            html: response.bodyHtml,
            skipProcessing: true, // Não aplicar template padrão
          });

          if (success) {
            await markEmailAsResponded(emailId, response.id);
            await createResponseHistory({
              responseId: response.id,
              emailId,
              recipientEmail: email.sender,
              subject: response.subject,
              status: "sent",
            });
            sent++;
          } else {
            await createResponseHistory({
              responseId: response.id,
              emailId,
              recipientEmail: email.sender,
              subject: response.subject,
              status: "failed",
              errorMessage: "Falha no envio",
            });
            failed++;
            errors.push(`Falha ao enviar para ${email.sender}`);
          }
        } catch (error) {
          failed++;
          const errorMsg = error instanceof Error ? error.message : "Erro desconhecido";
          errors.push(`Erro ao enviar para ${email.sender}: ${errorMsg}`);
          
          await createResponseHistory({
            responseId: response.id,
            emailId,
            recipientEmail: email.sender,
            subject: response.subject,
            status: "failed",
            errorMessage: errorMsg,
          });
        }
      }

      // Atualizar status da resposta se todos foram enviados
      if (sent > 0) {
        const { updateSupportResponse } = await import("./support-db");
        await updateSupportResponse(response.id, { 
          status: "sent", 
          sentAt: new Date() 
        });
      }

      return {
        success: failed === 0,
        sent,
        failed,
        errors: errors.length > 0 ? errors : undefined,
      };
    }),

  // Enviar resposta para todos os emails de um grupo
  sendGroupResponse: publicProcedure
    .input(
      z.object({
        groupId: z.number(),
        responseId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const { getEmailsByGroupId } = await import("./support-db");
      
      // Buscar todos os emails do grupo que ainda não foram respondidos
      const emails = await getEmailsByGroupId(input.groupId);
      const pendingEmails = emails.filter(e => e.status !== "responded");
      
      if (pendingEmails.length === 0) {
        return { success: true, sent: 0, failed: 0, message: "Nenhum email pendente no grupo" };
      }

      // Usar a rota sendResponse para enviar
      const emailIds = pendingEmails.map(e => e.id);
      
      // Importar e chamar diretamente a lógica
      const { getSupportResponseById, getSupportEmailById, markEmailAsResponded, createResponseHistory, updateSupportResponse } = await import("./support-db");
      const { sendEmail } = await import("./email");

      const response = await getSupportResponseById(input.responseId);
      if (!response) {
        return { success: false, error: "Resposta não encontrada", sent: 0, failed: 0 };
      }

      let sent = 0;
      let failed = 0;

      for (const emailId of emailIds) {
        const email = await getSupportEmailById(emailId);
        if (!email) {
          failed++;
          continue;
        }

        try {
          const success = await sendEmail({
            to: email.sender,
            subject: response.subject,
            html: response.bodyHtml,
            skipProcessing: true,
          });

          if (success) {
            await markEmailAsResponded(emailId, response.id);
            await createResponseHistory({
              responseId: response.id,
              emailId,
              recipientEmail: email.sender,
              subject: response.subject,
              status: "sent",
            });
            sent++;
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
        }
      }

      if (sent > 0) {
        await updateSupportResponse(response.id, { 
          status: "sent", 
          sentAt: new Date() 
        });
      }

      return { success: failed === 0, sent, failed };
    }),
});

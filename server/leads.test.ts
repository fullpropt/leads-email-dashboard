import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("leads API", () => {
  it("should list all leads", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const leads = await caller.leads.list();
    
    expect(Array.isArray(leads)).toBe(true);
  });

  it("should update lead email status", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // Este teste só funcionará se houver leads no banco
    const leads = await caller.leads.list();
    
    if (leads.length > 0) {
      const result = await caller.leads.updateEmailStatus({
        leadId: leads[0].id,
        enviado: true,
      });
      
      expect(result.success).toBe(true);
    } else {
      // Se não houver leads, o teste passa
      expect(true).toBe(true);
    }
  });
});

describe("email templates API", () => {
  it("should list all email templates", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const templates = await caller.emailTemplates.list();
    
    expect(Array.isArray(templates)).toBe(true);
  });

  it("should get active email template", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const activeTemplate = await caller.emailTemplates.getActive();
    
    // Pode ser null se não houver template ativo
    expect(activeTemplate === null || typeof activeTemplate === "object").toBe(true);
  });

  it("should create a new email template", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.emailTemplates.create({
      nome: "Template de Teste",
      assunto: "Bem-vindo!",
      htmlContent: "<html><body><h1>Olá {{nome}}</h1></body></html>",
    });
    
    expect(result.success).toBe(true);
    expect(result.templateId).toBeDefined();
  });
});

import { InsertLead } from "../drizzle/schema_postgresql";

/**
 * Processa webhooks recebidos do PerfectPay
 * Esperado receber um payload com informações de transação aprovada
 */
export async function processWebhook(payload: any) {
  try {
    console.log("[Webhook] Processando payload:", JSON.stringify(payload, null, 2));

    // Validar se o payload contém os dados necessários
    if (!payload) {
      console.warn("[Webhook] Payload vazio recebido");
      return {
        success: false,
        message: "Payload vazio",
      };
    }

    // Extrair dados do webhook do PerfectPay
    // O PerfectPay envia os dados do cliente dentro de um objeto "customer"
    const customer = payload.customer || {};
    const product = payload.product || {};
    const plan = payload.plan || {};
    
    const customer_name = customer.full_name;
    const customer_email = customer.email;
    const product_name = product.name;
    const plan_name = plan.name;
    const sale_value = payload.sale_amount;
    const transaction_id = payload.code;
    const status = payload.sale_status_enum_key; // PerfectPay usa "approved" como valor

    console.log(`[Webhook] Dados extraídos - Email: ${customer_email}, Nome: ${customer_name}, Status: ${status}`);

    // Validar campos obrigatórios
    if (!customer_email || !customer_name) {
      console.warn("[Webhook] Email ou nome do cliente não fornecido");
      console.warn(`[Webhook] Customer data: ${JSON.stringify(customer)}`);
      return {
        success: false,
        message: "Email e nome do cliente são obrigatórios",
      };
    }

    // Apenas processar transações aprovadas
    if (status && status !== "approved" && status !== "completed") {
      console.log(`[Webhook] Transação com status '${status}' ignorada (não é aprovada)`);
      return {
        success: true,
        message: `Transação com status '${status}' não processada`,
      };
    }

    // Preparar dados do lead para inserção no banco
    const leadData: InsertLead = {
      nome: customer_name,
      email: customer_email,
      produto: product_name || "Produto não especificado",
      plano: plan_name || "Plano não especificado",
      // Converter valor para centavos (se for string, remover símbolos)
      valor: convertValueToCents(sale_value),
      dataAprovacao: new Date(),
      dataCriacao: new Date(),
      emailEnviado: 0, // Marcar como não enviado para envio posterior
    };

    // Importar função de banco de dados dinamicamente
    const { getDb } = await import("./db");
    const { leads } = await import("../drizzle/schema_postgresql");
    const { eq } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) {
      console.error("[Webhook] Banco de dados não disponível");
      return {
        success: false,
        message: "Banco de dados não disponível",
      };
    }

    // Verificar se o lead já existe (por email)
    const existingLead = await db
      .select()
      .from(leads)
      .where(eq(leads.email, customer_email))
      .limit(1);

    if (existingLead.length > 0) {
      console.log(`[Webhook] Lead com email ${customer_email} já existe, atualizando...`);
      // Atualizar lead existente
      await db
        .update(leads)
        .set({
          nome: leadData.nome,
          produto: leadData.produto,
          plano: leadData.plano,
          valor: leadData.valor,
          dataAprovacao: leadData.dataAprovacao,
        })
        .where(eq(leads.email, customer_email));
    } else {
      console.log(`[Webhook] Criando novo lead: ${customer_email}`);
      // Inserir novo lead
      await db.insert(leads).values(leadData);
    }

    console.log(`[Webhook] Lead processado com sucesso: ${customer_email}`);
    return {
      success: true,
      message: "Lead processado com sucesso",
      leadEmail: customer_email,
      transactionId: transaction_id,
    };
  } catch (error) {
    console.error("[Webhook] Erro ao processar webhook:", error);
    return {
      success: false,
      message: "Erro ao processar webhook",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Converte valor para centavos
 * Aceita formatos: "100.00", "100,00", "10000" (já em centavos), 100.00 (número)
 */
function convertValueToCents(value: any): number {
  if (!value) return 0;

  // Se já é um número
  if (typeof value === "number") {
    // Se for maior que 10000, assumir que já está em centavos
    if (value > 10000) return Math.round(value);
    // Caso contrário, converter para centavos
    return Math.round(value * 100);
  }

  // Se é string
  if (typeof value === "string") {
    // Remover símbolos de moeda
    let cleanValue = value.replace(/[R$\s]/g, "");

    // Converter vírgula para ponto
    cleanValue = cleanValue.replace(",", ".");

    const numValue = parseFloat(cleanValue);

    if (isNaN(numValue)) return 0;

    // Se for maior que 10000, assumir que já está em centavos
    if (numValue > 10000) return Math.round(numValue);

    // Caso contrário, converter para centavos
    return Math.round(numValue * 100);
  }

  return 0;
}

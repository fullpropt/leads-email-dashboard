/**
 * Serviço de IA para classificação de emails de suporte e geração de respostas
 * Utiliza a API do OpenAI (ChatGPT) para análise e processamento
 */

import OpenAI from "openai";
import {
  getUngroupedSupportEmails,
  getSupportEmailGroups,
  createSupportEmailGroup,
  assignEmailsToGroup,
  updateGroupWithAIData,
  createSupportResponse,
  getSupportEmailById,
  getEmailsByGroupId,
  getSupportEmailGroupById,
  type SupportEmail,
  type SupportEmailGroup,
} from "./support-db";

// Inicializar cliente OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Modelo a ser utilizado
const AI_MODEL = "gpt-4.1-mini";

interface EmailClassification {
  groupName: string;
  groupDescription: string;
  category: string;
  keywords: string[];
  sentiment: "positive" | "negative" | "neutral";
  priority: "low" | "normal" | "high" | "urgent";
  summary: string;
}

interface GroupClassificationResult {
  emailId: number;
  classification: EmailClassification;
  existingGroupId?: number;
  newGroupName?: string;
}

/**
 * Classificar um único email usando IA
 */
async function classifyEmail(email: SupportEmail): Promise<EmailClassification> {
  const prompt = `Analise o seguinte email de suporte e forneça uma classificação detalhada.

REMETENTE: ${email.sender}
ASSUNTO: ${email.subject}
CONTEÚDO:
${email.strippedText || email.bodyPlain || ""}

Responda APENAS com um JSON válido no seguinte formato (sem markdown, sem explicações):
{
  "groupName": "Nome curto e descritivo para agrupar emails similares (max 50 caracteres)",
  "groupDescription": "Descrição do tipo de problema/solicitação",
  "category": "Uma das categorias: billing, technical, account, withdrawal, general",
  "keywords": ["palavra1", "palavra2", "palavra3"],
  "sentiment": "positive, negative ou neutral",
  "priority": "low, normal, high ou urgent",
  "summary": "Resumo de uma linha do email"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: "Você é um assistente especializado em classificar emails de suporte ao cliente. Responda apenas com JSON válido, sem formatação markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "";
    
    // Tentar extrair JSON da resposta
    let jsonStr = content.trim();
    
    // Remover possíveis marcadores de código
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    
    const classification = JSON.parse(jsonStr.trim()) as EmailClassification;
    
    return classification;
  } catch (error) {
    console.error("[Support AI] ❌ Erro ao classificar email:", error);
    
    // Retornar classificação padrão em caso de erro
    return {
      groupName: "Não classificado",
      groupDescription: "Email pendente de classificação manual",
      category: "general",
      keywords: [],
      sentiment: "neutral",
      priority: "normal",
      summary: email.subject,
    };
  }
}

/**
 * Encontrar grupo existente que corresponda à classificação
 */
async function findMatchingGroup(
  classification: EmailClassification,
  existingGroups: SupportEmailGroup[]
): Promise<SupportEmailGroup | null> {
  if (existingGroups.length === 0) return null;

  // Criar prompt para a IA decidir se o email pertence a algum grupo existente
  const groupsDescription = existingGroups.map((g) => ({
    id: g.id,
    nome: g.nome,
    descricao: g.descricao,
    categoria: g.categoria,
    keywords: g.aiKeywords,
  }));

  const prompt = `Dado um novo email classificado e uma lista de grupos existentes, determine se o email deve ser adicionado a um grupo existente ou se deve criar um novo grupo.

CLASSIFICAÇÃO DO EMAIL:
- Nome do grupo sugerido: ${classification.groupName}
- Descrição: ${classification.groupDescription}
- Categoria: ${classification.category}
- Palavras-chave: ${classification.keywords.join(", ")}

GRUPOS EXISTENTES:
${JSON.stringify(groupsDescription, null, 2)}

Responda APENAS com um JSON válido:
{
  "matchingGroupId": <ID do grupo existente ou null se deve criar novo>,
  "confidence": <número de 0 a 1 indicando confiança na decisão>,
  "reason": "Breve explicação da decisão"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: "Você é um assistente que agrupa emails de suporte similares. Responda apenas com JSON válido.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || "";
    let jsonStr = content.trim();
    
    // Limpar possíveis marcadores
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    
    const result = JSON.parse(jsonStr.trim());

    if (result.matchingGroupId && result.confidence > 0.7) {
      return existingGroups.find((g) => g.id === result.matchingGroupId) || null;
    }

    return null;
  } catch (error) {
    console.error("[Support AI] ❌ Erro ao encontrar grupo correspondente:", error);
    return null;
  }
}

/**
 * Classificar e agrupar todos os emails pendentes
 */
export async function classifyAndGroupEmails(): Promise<{
  processed: number;
  newGroups: number;
  errors: number;
}> {
  console.log("[Support AI] 🔄 Iniciando classificação de emails...");

  const ungroupedEmails = await getUngroupedSupportEmails();
  
  if (ungroupedEmails.length === 0) {
    console.log("[Support AI] ✅ Nenhum email pendente de classificação");
    return { processed: 0, newGroups: 0, errors: 0 };
  }

  console.log(`[Support AI] 📧 ${ungroupedEmails.length} emails para classificar`);

  const existingGroups = await getSupportEmailGroups("active");
  let processed = 0;
  let newGroups = 0;
  let errors = 0;

  for (const email of ungroupedEmails) {
    try {
      console.log(`[Support AI] 📝 Classificando email ${email.id}: ${email.subject}`);

      // Classificar o email
      const classification = await classifyEmail(email);

      // Tentar encontrar grupo existente
      const matchingGroup = await findMatchingGroup(classification, existingGroups);

      let groupId: number;

      if (matchingGroup) {
        // Adicionar ao grupo existente
        groupId = matchingGroup.id;
        console.log(`[Support AI] ➕ Adicionando ao grupo existente: ${matchingGroup.nome}`);
      } else {
        // Criar novo grupo
        const newGroupId = await createSupportEmailGroup({
          nome: classification.groupName,
          descricao: classification.groupDescription,
          categoria: classification.category,
          aiSummary: classification.summary,
          aiKeywords: JSON.stringify(classification.keywords),
          aiSentiment: classification.sentiment,
          aiPriority: classification.priority,
          status: "active",
        });

        if (!newGroupId) {
          throw new Error("Falha ao criar grupo");
        }

        groupId = newGroupId;
        newGroups++;
        
        // Adicionar o novo grupo à lista de grupos existentes para próximas iterações
        const newGroup = await getSupportEmailGroupById(newGroupId);
        if (newGroup) {
          existingGroups.push(newGroup);
        }

        console.log(`[Support AI] ✨ Novo grupo criado: ${classification.groupName}`);
      }

      // Atribuir email ao grupo
      await assignEmailsToGroup([email.id], groupId);
      processed++;

      // Pequeno delay para não sobrecarregar a API
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[Support AI] ❌ Erro ao processar email ${email.id}:`, error);
      errors++;
    }
  }

  console.log("[Support AI] ✅ Classificação concluída");
  console.log(`[Support AI] 📊 Processados: ${processed}, Novos grupos: ${newGroups}, Erros: ${errors}`);

  return { processed, newGroups, errors };
}

/**
 * Gerar resposta automática para um grupo de emails
 */
export async function generateGroupResponse(
  groupId: number,
  customInstructions?: string
): Promise<{ success: boolean; responseId?: number; error?: string }> {
  try {
    console.log(`[Support AI] 📝 Gerando resposta para grupo ${groupId}...`);

    // Buscar informações do grupo
    const group = await getSupportEmailGroupById(groupId);
    if (!group) {
      return { success: false, error: "Grupo não encontrado" };
    }

    // Buscar emails do grupo
    const emails = await getEmailsByGroupId(groupId);
    if (emails.length === 0) {
      return { success: false, error: "Nenhum email no grupo" };
    }

    // Preparar contexto dos emails para a IA
    const emailsContext = emails.slice(0, 5).map((e) => ({
      assunto: e.subject,
      remetente: e.sender,
      conteudo: (e.strippedText || e.bodyPlain || "").slice(0, 500),
    }));

    const prompt = `Você é um agente de suporte da TubeTools, uma plataforma onde usuários assistem vídeos e ganham recompensas.

INFORMAÇÕES DO GRUPO DE EMAILS:
- Nome do grupo: ${group.nome}
- Descrição: ${group.descricao}
- Categoria: ${group.categoria}
- Sentimento geral: ${group.aiSentiment}
- Prioridade: ${group.aiPriority}

EXEMPLOS DE EMAILS DO GRUPO (${emails.length} total):
${JSON.stringify(emailsContext, null, 2)}

${customInstructions ? `INSTRUÇÕES ADICIONAIS DO OPERADOR:\n${customInstructions}\n` : ""}

Crie uma resposta profissional e empática que possa ser enviada para todos os emails deste grupo. A resposta deve:
1. Reconhecer o problema/solicitação do usuário
2. Fornecer uma solução ou explicação clara
3. Ser cordial e profissional
4. Incluir assinatura "Equipe TubeTools"

Responda APENAS com um JSON válido:
{
  "subject": "Assunto da resposta (pode usar Re: se apropriado)",
  "bodyHtml": "Corpo do email em HTML simples",
  "bodyPlain": "Corpo do email em texto plano"
}`;

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: "Você é um agente de suporte profissional e empático. Responda apenas com JSON válido.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content || "";
    let jsonStr = content.trim();
    
    // Limpar possíveis marcadores
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    
    const generatedResponse = JSON.parse(jsonStr.trim());

    // Salvar a resposta no banco
    const responseId = await createSupportResponse({
      subject: generatedResponse.subject,
      bodyHtml: generatedResponse.bodyHtml,
      bodyPlain: generatedResponse.bodyPlain,
      aiGenerated: 1,
      aiPromptUsed: prompt,
      aiInstructions: customInstructions || null,
      groupId,
      status: "draft",
    });

    if (!responseId) {
      return { success: false, error: "Falha ao salvar resposta" };
    }

    // Atualizar grupo com a resposta sugerida
    await updateGroupWithAIData(groupId, { suggestedResponseId: responseId });

    console.log(`[Support AI] ✅ Resposta gerada com ID: ${responseId}`);

    return { success: true, responseId };
  } catch (error) {
    console.error("[Support AI] ❌ Erro ao gerar resposta:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

/**
 * Regenerar resposta com instruções personalizadas
 */
export async function regenerateResponse(
  responseId: number,
  instructions: string
): Promise<{ success: boolean; newResponseId?: number; error?: string }> {
  try {
    // Buscar a resposta original para obter o groupId
    const { getSupportResponseById } = await import("./support-db");
    const originalResponse = await getSupportResponseById(responseId);
    
    if (!originalResponse) {
      return { success: false, error: "Resposta original não encontrada" };
    }

    if (!originalResponse.groupId) {
      return { success: false, error: "Resposta não está associada a um grupo" };
    }

    // Gerar nova resposta com as instruções
    return await generateGroupResponse(originalResponse.groupId, instructions);
  } catch (error) {
    console.error("[Support AI] ❌ Erro ao regenerar resposta:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

/**
 * Gerar resposta para um email individual
 */
export async function generateEmailResponse(
  emailId: number,
  customInstructions?: string
): Promise<{ success: boolean; responseId?: number; error?: string }> {
  try {
    console.log(`[Support AI] 📝 Gerando resposta para email ${emailId}...`);

    const email = await getSupportEmailById(emailId);
    if (!email) {
      return { success: false, error: "Email não encontrado" };
    }

    const prompt = `Você é um agente de suporte da TubeTools, uma plataforma onde usuários assistem vídeos e ganham recompensas.

EMAIL RECEBIDO:
- De: ${email.sender} ${email.senderName ? `(${email.senderName})` : ""}
- Assunto: ${email.subject}
- Conteúdo:
${email.strippedText || email.bodyPlain || ""}

${customInstructions ? `INSTRUÇÕES ADICIONAIS DO OPERADOR:\n${customInstructions}\n` : ""}

Crie uma resposta profissional e empática. A resposta deve:
1. Ser personalizada para este usuário específico
2. Abordar diretamente a questão levantada
3. Ser cordial e profissional
4. Incluir assinatura "Equipe TubeTools"

Responda APENAS com um JSON válido:
{
  "subject": "Re: ${email.subject}",
  "bodyHtml": "Corpo do email em HTML simples",
  "bodyPlain": "Corpo do email em texto plano"
}`;

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: "Você é um agente de suporte profissional e empático. Responda apenas com JSON válido.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content || "";
    let jsonStr = content.trim();
    
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    
    const generatedResponse = JSON.parse(jsonStr.trim());

    const responseId = await createSupportResponse({
      subject: generatedResponse.subject,
      bodyHtml: generatedResponse.bodyHtml,
      bodyPlain: generatedResponse.bodyPlain,
      aiGenerated: 1,
      aiPromptUsed: prompt,
      aiInstructions: customInstructions || null,
      emailId,
      groupId: email.groupId || null,
      status: "draft",
    });

    if (!responseId) {
      return { success: false, error: "Falha ao salvar resposta" };
    }

    console.log(`[Support AI] ✅ Resposta gerada com ID: ${responseId}`);

    return { success: true, responseId };
  } catch (error) {
    console.error("[Support AI] ❌ Erro ao gerar resposta:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

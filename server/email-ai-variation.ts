import OpenAI from "openai";
import { createHash } from "crypto";
import { getEmailAiSettingsRuntime } from "./app-settings";

type VariationInput = {
  subject: string;
  html: string;
  scopeKey: string;
  serviceName: string;
  fromEmail: string;
};

type VariationOutput = {
  subject: string;
  html: string;
  applied: boolean;
  reason?: string;
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const variationCache = new Map<
  string,
  { subject: string; html: string; expiresAt: number }
>();

function getCacheKey(input: VariationInput, provider: string, model: string, rewriteIntensity: number, extraInstructions: string) {
  const hash = createHash("sha1");
  hash.update(provider);
  hash.update("|");
  hash.update(model);
  hash.update("|");
  hash.update(String(rewriteIntensity));
  hash.update("|");
  hash.update(extraInstructions);
  hash.update("|");
  hash.update(input.serviceName);
  hash.update("|");
  hash.update(input.fromEmail);
  hash.update("|");
  hash.update(input.scopeKey);
  hash.update("|");
  hash.update(input.subject);
  hash.update("|");
  hash.update(input.html);
  return hash.digest("hex");
}

function extractJsonText(raw: string) {
  let text = raw.trim();
  if (text.startsWith("```json")) text = text.slice(7);
  if (text.startsWith("```")) text = text.slice(3);
  if (text.endsWith("```")) text = text.slice(0, -3);
  return text.trim();
}

function collectTemplateTokens(text: string) {
  return Array.from(new Set(text.match(/\{\{[^{}]+\}\}|\{[A-Z_]+\}/g) || []));
}

function containsAllTokens(base: string, candidate: string) {
  const tokens = collectTemplateTokens(base);
  return tokens.every(token => candidate.includes(token));
}

function sanitizeVariation(base: VariationInput, candidate: { subject?: string; html?: string }): VariationOutput {
  const nextSubject = typeof candidate.subject === "string" ? candidate.subject.trim() : "";
  const nextHtml = typeof candidate.html === "string" ? candidate.html.trim() : "";

  if (!nextSubject || !nextHtml) {
    return {
      subject: base.subject,
      html: base.html,
      applied: false,
      reason: "AI returned empty content",
    };
  }

  if (!containsAllTokens(base.subject, nextSubject) || !containsAllTokens(base.html, nextHtml)) {
    return {
      subject: base.subject,
      html: base.html,
      applied: false,
      reason: "AI variation removed required placeholders",
    };
  }

  return {
    subject: nextSubject,
    html: nextHtml,
    applied: true,
  };
}

async function generateWithOpenAI(input: VariationInput, apiKey: string, model: string, rewriteIntensity: number, extraInstructions: string) {
  const client = new OpenAI({ apiKey });

  const systemPrompt = [
    "You rewrite email copy with subtle lexical variation.",
    "Return strict JSON with keys: subject, html.",
    "Rules:",
    "- Keep same language, intent and CTA.",
    `- Rewrite only around ${rewriteIntensity}% of wording.`,
    "- Keep all placeholders exactly unchanged ({{...}} and {UPPER_CASE}).",
    "- Keep links, href/src URLs and unsubscribe semantics unchanged.",
    "- Keep valid HTML and similar structure/length.",
    extraInstructions ? `Extra instructions: ${extraInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = JSON.stringify(
    {
      serviceName: input.serviceName,
      fromEmail: input.fromEmail,
      scopeKey: input.scopeKey,
      subject: input.subject,
      html: input.html,
    },
    null,
    2
  );

  const response = await client.chat.completions.create({
    model,
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content || "";
  return JSON.parse(extractJsonText(content));
}

async function generateWithGemini(input: VariationInput, apiKey: string, model: string, rewriteIntensity: number, extraInstructions: string) {
  const systemPrompt = [
    "Rewrite the following email copy with subtle lexical variation.",
    "Return JSON only: {\"subject\":\"...\",\"html\":\"...\"}",
    "Rules:",
    "- Keep same language, intent and CTA.",
    `- Rewrite approximately ${rewriteIntensity}% of wording.`,
    "- Keep all placeholders unchanged ({{...}} and {UPPER_CASE}).",
    "- Keep all links exactly unchanged.",
    "- Preserve valid HTML structure.",
    extraInstructions ? `Extra instructions: ${extraInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\n${JSON.stringify(
              {
                serviceName: input.serviceName,
                fromEmail: input.fromEmail,
                scopeKey: input.scopeKey,
                subject: input.subject,
                html: input.html,
              },
              null,
              2
            )}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 4096,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return JSON.parse(extractJsonText(content));
}

export async function applyAICopyVariation(input: VariationInput): Promise<VariationOutput> {
  try {
    const settings = await getEmailAiSettingsRuntime();
    if (settings.provider === "none") {
      return { subject: input.subject, html: input.html, applied: false, reason: "disabled" };
    }
    if (!settings.apiKey) {
      return { subject: input.subject, html: input.html, applied: false, reason: "missing_api_key" };
    }

    const cacheKey = getCacheKey(
      input,
      settings.provider,
      settings.model,
      settings.rewriteIntensity,
      settings.extraInstructions
    );
    const cached = variationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        subject: cached.subject,
        html: cached.html,
        applied: true,
      };
    }

    let rawCandidate: any;
    if (settings.provider === "openai") {
      rawCandidate = await generateWithOpenAI(
        input,
        settings.apiKey,
        settings.model,
        settings.rewriteIntensity,
        settings.extraInstructions
      );
    } else {
      rawCandidate = await generateWithGemini(
        input,
        settings.apiKey,
        settings.model,
        settings.rewriteIntensity,
        settings.extraInstructions
      );
    }

    const sanitized = sanitizeVariation(input, rawCandidate || {});
    if (sanitized.applied) {
      variationCache.set(cacheKey, {
        subject: sanitized.subject,
        html: sanitized.html,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }
    return sanitized;
  } catch (error) {
    console.error("[EmailAIVariation] Failed to generate variation", error);
    return {
      subject: input.subject,
      html: input.html,
      applied: false,
      reason: "error",
    };
  }
}

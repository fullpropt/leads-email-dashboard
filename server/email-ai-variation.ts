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
const MAX_GENERATION_ATTEMPTS = 3;
const CACHE_VERSION = "v2";
const variationCache = new Map<
  string,
  { subject: string; html: string; expiresAt: number }
>();

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getServiceStyleHint(input: VariationInput) {
  const styles = [
    "direct and concise wording",
    "warm and reassuring wording",
    "professional and objective wording",
    "friendly and conversational wording",
    "confident and benefit-oriented wording",
  ];
  const seed = `${input.serviceName}|${input.fromEmail}`;
  return styles[hashString(seed) % styles.length];
}

function getCacheKey(input: VariationInput, provider: string, model: string, rewriteIntensity: number, extraInstructions: string) {
  const hash = createHash("sha1");
  hash.update(CACHE_VERSION);
  hash.update("|");
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

function normalizeComparableText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeErrorMessage(value: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "unknown_error";
  const withoutKeys = trimmed
    .replace(/sk-[a-zA-Z0-9_\-]{8,}/g, "sk-***")
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, "AIza***");
  return withoutKeys.slice(0, 180);
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

  if (
    normalizeComparableText(nextSubject) === normalizeComparableText(base.subject) &&
    normalizeComparableText(nextHtml) === normalizeComparableText(base.html)
  ) {
    return {
      subject: base.subject,
      html: base.html,
      applied: false,
      reason: "no_change",
    };
  }

  return {
    subject: nextSubject,
    html: nextHtml,
    applied: true,
  };
}

async function generateWithOpenAI(
  input: VariationInput,
  apiKey: string,
  model: string,
  rewriteIntensity: number,
  extraInstructions: string,
  attempt: number
) {
  const client = new OpenAI({ apiKey });
  const styleHint = getServiceStyleHint(input);
  const attemptRule =
    attempt > 1
      ? "Previous attempt was too similar. Make clearer lexical changes in subject and at least one body sentence."
      : "";

  const systemPrompt = [
    "You rewrite email copy with subtle lexical variation.",
    "Return strict JSON with keys: subject, html.",
    "Rules:",
    "- Keep same language, intent and CTA.",
    `- Rewrite only around ${rewriteIntensity}% of wording.`,
    "- You must change at least one sentence in subject or html.",
    `- Use a distinct writing style for this account: ${styleHint}.`,
    "- Keep all placeholders exactly unchanged ({{...}} and {UPPER_CASE}).",
    "- Keep links, href/src URLs and unsubscribe semantics unchanged.",
    "- Keep valid HTML and similar structure/length.",
    attemptRule,
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
    temperature: attempt > 1 ? 0.85 : 0.65,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content || "";
  return JSON.parse(extractJsonText(content));
}

async function generateWithGemini(
  input: VariationInput,
  apiKey: string,
  model: string,
  rewriteIntensity: number,
  extraInstructions: string,
  attempt: number
) {
  const styleHint = getServiceStyleHint(input);
  const attemptRule =
    attempt > 1
      ? "Previous attempt was too similar. Make clearer lexical changes in subject and at least one body sentence."
      : "";
  const systemPrompt = [
    "Rewrite the following email copy with subtle lexical variation.",
    "Return JSON only: {\"subject\":\"...\",\"html\":\"...\"}",
    "Rules:",
    "- Keep same language, intent and CTA.",
    `- Rewrite approximately ${rewriteIntensity}% of wording.`,
    "- You must change at least one sentence in subject or html.",
    `- Use a distinct writing style for this account: ${styleHint}.`,
    "- Keep all placeholders unchanged ({{...}} and {UPPER_CASE}).",
    "- Keep all links exactly unchanged.",
    "- Preserve valid HTML structure.",
    attemptRule,
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
      temperature: attempt > 1 ? 0.85 : 0.65,
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

async function generateRawCandidate(
  input: VariationInput,
  settings: Awaited<ReturnType<typeof getEmailAiSettingsRuntime>>,
  attempt: number
) {
  if (settings.provider === "openai") {
    return generateWithOpenAI(
      input,
      settings.apiKey,
      settings.model,
      settings.rewriteIntensity,
      settings.extraInstructions,
      attempt
    );
  }

  return generateWithGemini(
    input,
    settings.apiKey,
    settings.model,
    settings.rewriteIntensity,
    settings.extraInstructions,
    attempt
  );
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

    let lastResult: VariationOutput = {
      subject: input.subject,
      html: input.html,
      applied: false,
      reason: "no_change",
    };

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const attemptInput: VariationInput =
        attempt === 1
          ? input
          : {
              ...input,
              scopeKey: `${input.scopeKey}:retry:${attempt}`,
            };

      const rawCandidate = await generateRawCandidate(attemptInput, settings, attempt);
      const sanitized = sanitizeVariation(input, rawCandidate || {});

      if (sanitized.applied) {
        variationCache.set(cacheKey, {
          subject: sanitized.subject,
          html: sanitized.html,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return sanitized;
      }

      lastResult = sanitized;
      if (sanitized.reason !== "no_change") {
        break;
      }
    }

    return lastResult;
  } catch (error) {
    console.error("[EmailAIVariation] Failed to generate variation", error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : JSON.stringify(error);
    return {
      subject: input.subject,
      html: input.html,
      applied: false,
      reason: `error:${sanitizeErrorMessage(message)}`,
    };
  }
}

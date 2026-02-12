const INVALID_NAME_PATTERNS = [
  /^sem nome$/i,
  /^unknown$/i,
  /^undefined$/i,
  /^null$/i,
  /^n\/a$/i,
  /^na$/i,
  /^usuario$/i,
  /^user$/i,
];

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase());
}

function isNumericLike(value: string): boolean {
  const compact = value.replace(/[+\-().\s]/g, "");
  return /^\d{7,}$/.test(compact);
}

export function sanitizeName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const normalized = collapseWhitespace(value);
  if (!normalized) return null;
  if (normalized.includes("@")) return null;
  if (isNumericLike(normalized)) return null;
  if (INVALID_NAME_PATTERNS.some((pattern) => pattern.test(normalized))) return null;

  return normalized;
}

export function hasMeaningfulName(value: string | null | undefined): boolean {
  return sanitizeName(value) !== null;
}

export function deriveNameFromEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;

  const normalizedEmail = email.trim().toLowerCase();
  const [localPart] = normalizedEmail.split("@");
  if (!localPart) return null;

  const withoutTag = localPart.split("+")[0];
  const candidate = collapseWhitespace(
    withoutTag.replace(/[._-]+/g, " ").replace(/\d+/g, " ")
  );

  const sanitized = sanitizeName(candidate);
  return sanitized ? toTitleCase(sanitized) : null;
}

export function deriveNameFromIdentifier(
  identifier: string | null | undefined
): string | null {
  if (typeof identifier !== "string") return null;

  const candidate = collapseWhitespace(
    identifier
      .replace(/^(github|oauth|user|manus)_/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\d+/g, " ")
  );

  const sanitized = sanitizeName(candidate);
  return sanitized ? toTitleCase(sanitized) : null;
}

type ResolveAutoNameInput = {
  providedName?: string | null;
  email?: string | null;
  identifier?: string | null;
  fallback: string;
};

export function resolveAutoName({
  providedName,
  email,
  identifier,
  fallback,
}: ResolveAutoNameInput): string {
  const fromPayload = sanitizeName(providedName);
  if (fromPayload) return fromPayload;

  const fromEmail = deriveNameFromEmail(email);
  if (fromEmail) return fromEmail;

  const fromIdentifier = deriveNameFromIdentifier(identifier);
  if (fromIdentifier) return fromIdentifier;

  return fallback;
}

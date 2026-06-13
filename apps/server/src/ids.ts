import { randomBytes, randomUUID } from "node:crypto";

// No I, L, O, 0, 1 — claim codes get read off a screen and typed on a phone.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newDeviceId(): string {
  return randomUUID();
}

export function newDeviceSecret(): string {
  return randomBytes(24).toString("hex");
}

export function newClaimCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function normalizeClaimCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z2-9]/g, "");
  return raw.length === 6 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : input.toUpperCase().trim();
}

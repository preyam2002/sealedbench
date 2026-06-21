export type HashVerification = {
  matched: boolean;
  expected: string;
  actual: string;
};

export function normalizeHash(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, "");
}

export function verifyHash(expected: string, actual: string): HashVerification {
  const normalizedExpected = normalizeHash(expected);
  const normalizedActual = normalizeHash(actual);
  return {
    matched: normalizedExpected === normalizedActual,
    expected: normalizedExpected,
    actual: normalizedActual,
  };
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Client-side encryption utilities
 * Re-exports encryption functions and provides React Native compatible helpers
 */

// Re-export types from the shared encryption module
export type {
  EncryptedEnvelope,
  EncryptedKeyMaterial,
} from "@/convex/lib/encryption";

export {
  ENCRYPTION_VERSION,
  createKeyMaterial,
  unlockDek,
  encryptString,
  decryptString,
  encryptObject,
  decryptObject,
  rekeyWithNewPassword,
  serializeEnvelope,
  parseEnvelope,
  isEncrypted,
  generateSecureToken,
} from "@/convex/lib/encryption";

/**
 * Helper to safely decrypt a potentially encrypted value
 * Returns the plaintext if decryption succeeds, or the original value if not encrypted
 */
export async function safeDecrypt(
  value: string | undefined | null,
  dek: CryptoKey | null
): Promise<string> {
  if (!value) return "";
  
  if (!dek) {
    // No encryption key available, check if value is encrypted
    try {
      const parsed = JSON.parse(value);
      if (parsed.v && parsed.n && parsed.c) {
        // Value is encrypted but we can't decrypt it
        return "[Encrypted - unlock to view]";
      }
    } catch {
      // Not JSON, return as-is
    }
    return value;
  }
  
  try {
    const parsed = JSON.parse(value);
    if (parsed.v && parsed.n && parsed.c) {
      // Value is an encrypted envelope
      const { decryptString } = await import("@/convex/lib/encryption");
      return await decryptString(parsed, dek);
    }
  } catch {
    // Not encrypted or not valid JSON
  }
  
  return value;
}

/**
 * Helper to encrypt a value if encryption is available
 * Returns the encrypted envelope as a string, or the original value if no key
 */
export async function safeEncrypt(
  value: string,
  dek: CryptoKey | null
): Promise<string> {
  if (!dek || !value) return value;
  
  const { encryptString, serializeEnvelope } = await import("@/convex/lib/encryption");
  const envelope = await encryptString(value, dek);
  return JSON.stringify(envelope);
}

/**
 * Hash a string for blind indexing
 * Uses SHA-256 and returns first 16 chars of hex
 */
export async function hashForIndex(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash IP address for privacy-preserving audit logs
 */
export async function hashIpAddress(ip: string): Promise<string> {
  return hashForIndex(ip);
}

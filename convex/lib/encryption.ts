/**
 * Encryption utilities for client-side E2EE.
 * Uses AES-256-GCM for symmetric encryption and PBKDF2 for key derivation.
 * This module works in both browser/React Native and Convex runtime.
 */

// Constants for encryption configuration
export const ENCRYPTION_VERSION = 1;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 100000;
const TAG_LENGTH = 128;

/**
 * Encrypted data envelope containing all info needed for decryption
 */
export interface EncryptedEnvelope {
  /** Encryption version for future algorithm upgrades */
  v: number;
  /** Base64-encoded nonce/IV */
  n: string;
  /** Base64-encoded ciphertext (includes auth tag) */
  c: string;
}

/**
 * User key material stored in database (encrypted with password-derived key)
 */
export interface EncryptedKeyMaterial {
  /** Encryption version */
  version: number;
  /** Base64-encoded salt for PBKDF2 */
  salt: string;
  /** Base64-encoded encrypted Data Encryption Key */
  encryptedDek: string;
  /** Base64-encoded nonce used to encrypt DEK */
  dekNonce: string;
  /** Key derivation iterations (stored for future-proofing) */
  iterations: number;
}

// Utility functions for base64 encoding/decoding
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate cryptographically secure random bytes
 */
export function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Generate a new salt for key derivation
 */
export function generateSalt(): Uint8Array {
  return generateRandomBytes(SALT_LENGTH);
}

/**
 * Generate a new nonce/IV for encryption
 */
export function generateNonce(): Uint8Array {
  return generateRandomBytes(NONCE_LENGTH);
}

/**
 * Generate a new Data Encryption Key (DEK)
 */
export async function generateDek(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: KEY_LENGTH },
    true, // extractable so we can encrypt it
    ["encrypt", "decrypt"]
  );
}

/**
 * Derive a key encryption key (KEK) from password using PBKDF2
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: KEY_LENGTH },
    false, // KEK not extractable
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
  );
}

/**
 * Export a CryptoKey to raw bytes
 */
export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
  return await crypto.subtle.exportKey("raw", key);
}

/**
 * Import raw bytes as a CryptoKey for AES-GCM
 */
export async function importKey(
  keyData: ArrayBuffer,
  extractable: boolean = false
): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: KEY_LENGTH },
    extractable,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a DEK with a KEK (key wrapping)
 */
export async function wrapDek(
  dek: CryptoKey,
  kek: CryptoKey,
  nonce: Uint8Array
): Promise<ArrayBuffer> {
  const rawDek = await exportKey(dek);
  return await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce.buffer as ArrayBuffer, tagLength: TAG_LENGTH },
    kek,
    rawDek
  );
}

/**
 * Decrypt a DEK with a KEK (key unwrapping)
 */
export async function unwrapDek(
  encryptedDek: ArrayBuffer,
  kek: CryptoKey,
  nonce: Uint8Array
): Promise<CryptoKey> {
  const rawDek = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce.buffer as ArrayBuffer, tagLength: TAG_LENGTH },
    kek,
    encryptedDek
  );
  return await importKey(rawDek, false);
}

/**
 * Create encrypted key material for storage
 * Called when user first sets up encryption
 */
export async function createKeyMaterial(
  password: string
): Promise<{ keyMaterial: EncryptedKeyMaterial; dek: CryptoKey }> {
  const salt = generateSalt();
  const nonce = generateNonce();

  const kek = await deriveKeyFromPassword(password, salt);
  const dek = await generateDek();
  const encryptedDek = await wrapDek(dek, kek, nonce);

  return {
    keyMaterial: {
      version: ENCRYPTION_VERSION,
      salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
      encryptedDek: arrayBufferToBase64(encryptedDek),
      dekNonce: arrayBufferToBase64(nonce.buffer as ArrayBuffer),
      iterations: PBKDF2_ITERATIONS,
    },
    dek,
  };
}

/**
 * Unlock the DEK using password and stored key material
 * Called on user login
 */
export async function unlockDek(
  password: string,
  keyMaterial: EncryptedKeyMaterial
): Promise<CryptoKey> {
  const salt = new Uint8Array(base64ToArrayBuffer(keyMaterial.salt));
  const nonce = new Uint8Array(base64ToArrayBuffer(keyMaterial.dekNonce));
  const encryptedDek = base64ToArrayBuffer(keyMaterial.encryptedDek);

  const kek = await deriveKeyFromPassword(
    password,
    salt,
    keyMaterial.iterations
  );

  return await unwrapDek(encryptedDek, kek, nonce);
}

/**
 * Encrypt plaintext string with DEK
 */
export async function encryptString(
  plaintext: string,
  dek: CryptoKey
): Promise<EncryptedEnvelope> {
  const encoder = new TextEncoder();
  const nonce = generateNonce();

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce.buffer as ArrayBuffer, tagLength: TAG_LENGTH },
    dek,
    encoder.encode(plaintext)
  );

  return {
    v: ENCRYPTION_VERSION,
    n: arrayBufferToBase64(nonce.buffer as ArrayBuffer),
    c: arrayBufferToBase64(ciphertext),
  };
}

/**
 * Decrypt encrypted envelope back to plaintext string
 */
export async function decryptString(
  envelope: EncryptedEnvelope,
  dek: CryptoKey
): Promise<string> {
  const nonce = new Uint8Array(base64ToArrayBuffer(envelope.n));
  const ciphertext = base64ToArrayBuffer(envelope.c);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce.buffer as ArrayBuffer, tagLength: TAG_LENGTH },
    dek,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}

/**
 * Encrypt an object by JSON-serializing and encrypting
 */
export async function encryptObject<T>(
  obj: T,
  dek: CryptoKey
): Promise<EncryptedEnvelope> {
  const json = JSON.stringify(obj);
  return encryptString(json, dek);
}

/**
 * Decrypt an envelope back to an object
 */
export async function decryptObject<T>(
  envelope: EncryptedEnvelope,
  dek: CryptoKey
): Promise<T> {
  const json = await decryptString(envelope, dek);
  return JSON.parse(json) as T;
}

/**
 * Serialize an encrypted envelope to a string for storage
 */
export function serializeEnvelope(envelope: EncryptedEnvelope): string {
  return JSON.stringify(envelope);
}

/**
 * Parse a serialized envelope string
 */
export function parseEnvelope(serialized: string): EncryptedEnvelope {
  return JSON.parse(serialized) as EncryptedEnvelope;
}

/**
 * Check if a string looks like an encrypted envelope
 */
export function isEncrypted(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.v === "number" &&
      typeof parsed.n === "string" &&
      typeof parsed.c === "string"
    );
  } catch {
    return false;
  }
}

/**
 * Re-encrypt key material with a new password
 * Used for password changes
 */
export async function rekeyWithNewPassword(
  currentPassword: string,
  newPassword: string,
  currentKeyMaterial: EncryptedKeyMaterial
): Promise<EncryptedKeyMaterial> {
  // Unlock with current password
  const dek = await unlockDek(currentPassword, currentKeyMaterial);

  // Export DEK to re-wrap
  const rawDek = await exportKey(dek);
  const extractableDek = await importKey(rawDek, true);

  // Create new key material with new password
  const newSalt = generateSalt();
  const newNonce = generateNonce();
  const newKek = await deriveKeyFromPassword(newPassword, newSalt);
  const newEncryptedDek = await wrapDek(extractableDek, newKek, newNonce);

  return {
    version: ENCRYPTION_VERSION,
    salt: arrayBufferToBase64(newSalt.buffer as ArrayBuffer),
    encryptedDek: arrayBufferToBase64(newEncryptedDek),
    dekNonce: arrayBufferToBase64(newNonce.buffer as ArrayBuffer),
    iterations: PBKDF2_ITERATIONS,
  };
}

/**
 * Generate a secure random token for sharing, etc.
 */
export function generateSecureToken(length: number = 32): string {
  const bytes = generateRandomBytes(length);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash a value for blind indexing (deterministic, for searching encrypted data)
 * Uses HMAC-SHA256 with a user-specific key
 */
export async function createBlindIndex(
  value: string,
  indexKey: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "HMAC",
    indexKey,
    encoder.encode(value.toLowerCase().trim())
  );
  // Return first 8 bytes as hex (64 bits of entropy)
  return arrayBufferToBase64(signature.slice(0, 8));
}

/**
 * Generate a key for blind indexing
 */
export async function generateIndexKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["sign"]
  );
}

/**
 * Export an HMAC key for storage
 */
export async function exportIndexKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64(raw);
}

/**
 * Import an HMAC key from storage
 */
export async function importIndexKey(keyData: string): Promise<CryptoKey> {
  const raw = base64ToArrayBuffer(keyData);
  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

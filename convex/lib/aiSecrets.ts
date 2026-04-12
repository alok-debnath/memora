"use node";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const MASTER_KEY_ENV = "AI_SECRETS_MASTER_KEY";
const KEY_VERSION = 1;

function getMasterKey() {
  const raw = process.env[MASTER_KEY_ENV];
  if (!raw) {
    throw new Error(`${MASTER_KEY_ENV} is not configured.`);
  }
  return createHash("sha256").update(raw).digest();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: bytesToBase64(ciphertext as Uint8Array),
    iv: bytesToBase64(iv as Uint8Array),
    authTag: bytesToBase64(authTag as Uint8Array),
    keyVersion: KEY_VERSION,
  };
}

export function decryptSecret(args: {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}) {
  if (args.keyVersion !== KEY_VERSION) {
    throw new Error(`Unsupported secret key version: ${args.keyVersion}`);
  }
  const decipher = createDecipheriv("aes-256-gcm", getMasterKey(), base64ToBytes(args.iv));
  decipher.setAuthTag(base64ToBytes(args.authTag));
  const plaintext = Buffer.concat([
    decipher.update(base64ToBytes(args.ciphertext)),
    decipher.final(),
  ]);
  return new TextDecoder().decode(plaintext as Uint8Array);
}

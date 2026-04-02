/**
 * Client-side encryption hook for Memora
 * Handles key management, encryption, and decryption of user data
 * 
 * NOTE: Run `npx convex dev` to regenerate API types after schema changes
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  createKeyMaterial,
  unlockDek,
  encryptString,
  decryptString,
  encryptObject,
  decryptObject,
  rekeyWithNewPassword,
  type EncryptedEnvelope,
  type EncryptedKeyMaterial,
  ENCRYPTION_VERSION,
} from "@/convex/lib/encryption";

// Dynamic import of API to handle case where types aren't generated yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let apiModule: any = null;
try {
  apiModule = require("@/convex/_generated/api").api;
} catch {
  console.warn("Convex API not yet generated. Run 'npx convex dev' to generate.");
}

// Secure storage key for the cached DEK
const DEK_CACHE_KEY = "memora_encryption_dek";

interface EncryptionState {
  isInitialized: boolean;
  isUnlocked: boolean;
  isLoading: boolean;
  error: string | null;
}

interface EncryptionActions {
  /** Initialize encryption with a password (first-time setup) */
  initializeEncryption: (password: string) => Promise<void>;
  /** Unlock encryption with password (on login) */
  unlockEncryption: (password: string) => Promise<void>;
  /** Lock encryption (on logout) */
  lockEncryption: () => Promise<void>;
  /** Change password (re-wraps the DEK) */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Encrypt a string value */
  encrypt: (plaintext: string) => Promise<EncryptedEnvelope>;
  /** Decrypt an encrypted envelope */
  decrypt: (envelope: EncryptedEnvelope) => Promise<string>;
  /** Encrypt an object (JSON serialized) */
  encryptObj: <T>(obj: T) => Promise<EncryptedEnvelope>;
  /** Decrypt to an object */
  decryptObj: <T>(envelope: EncryptedEnvelope) => Promise<T>;
  /** Check if a value is encrypted */
  isEncryptedValue: (value: string) => boolean;
}

export type EncryptionContextValue = EncryptionState & EncryptionActions;

// In-memory DEK storage (never persisted unencrypted)
let cachedDek: CryptoKey | null = null;

/**
 * Store DEK in secure storage (mobile only)
 * On web, we only keep it in memory
 */
async function cacheDekSecurely(dek: CryptoKey): Promise<void> {
  cachedDek = dek;
  
  // On mobile, we can optionally cache in secure store for session persistence
  // Note: This is optional and depends on security requirements
  // For maximum security, don't persist the DEK at all
  if (Platform.OS !== "web") {
    try {
      const rawDek = await crypto.subtle.exportKey("raw", dek);
      const base64Dek = btoa(String.fromCharCode(...new Uint8Array(rawDek)));
      await SecureStore.setItemAsync(DEK_CACHE_KEY, base64Dek);
    } catch (e) {
      // Secure store not available, keep in memory only
      console.warn("Could not cache DEK in secure storage");
    }
  }
}

/**
 * Try to restore DEK from secure storage
 */
async function tryRestoreCachedDek(): Promise<CryptoKey | null> {
  if (cachedDek) {
    return cachedDek;
  }
  
  if (Platform.OS !== "web") {
    try {
      const base64Dek = await SecureStore.getItemAsync(DEK_CACHE_KEY);
      if (base64Dek) {
        const binary = atob(base64Dek);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const dek = await crypto.subtle.importKey(
          "raw",
          bytes.buffer,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
        cachedDek = dek;
        return dek;
      }
    } catch (e) {
      // Could not restore from secure storage
    }
  }
  
  return null;
}

/**
 * Clear cached DEK
 */
async function clearCachedDek(): Promise<void> {
  cachedDek = null;
  
  if (Platform.OS !== "web") {
    try {
      await SecureStore.deleteItemAsync(DEK_CACHE_KEY);
    } catch (e) {
      // Ignore
    }
  }
}

/**
 * Hook for managing client-side encryption
 */
export function useEncryption(): EncryptionContextValue {
  const [state, setState] = useState<EncryptionState>({
    isInitialized: false,
    isUnlocked: false,
    isLoading: true,
    error: null,
  });
  
  const hasEncryptionQuery = useQuery(
    apiModule?.encryption?.hasEncryption ?? "skip"
  );
  const getKeyMaterialQuery = useQuery(
    apiModule?.encryption?.getKeyMaterial ?? "skip"
  );
  const initializeEncryptionMutation = useMutation(
    apiModule?.encryption?.initializeEncryption
  );
  const updateKeyMaterialMutation = useMutation(
    apiModule?.encryption?.updateKeyMaterial
  );
  
  // Check if encryption is initialized for this user
  useEffect(() => {
    if (hasEncryptionQuery === undefined) {
      return; // Still loading
    }
    
    setState((prev) => ({
      ...prev,
      isInitialized: hasEncryptionQuery,
      isLoading: false,
    }));
    
    // Try to restore cached DEK
    if (hasEncryptionQuery) {
      tryRestoreCachedDek().then((dek) => {
        if (dek) {
          setState((prev) => ({ ...prev, isUnlocked: true }));
        }
      });
    }
  }, [hasEncryptionQuery]);
  
  /**
   * Initialize encryption with password
   */
  const initializeEncryption = useCallback(async (password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const { keyMaterial, dek } = await createKeyMaterial(password);
      
      await initializeEncryptionMutation({
        keyMaterial,
      });
      
      await cacheDekSecurely(dek);
      
      setState({
        isInitialized: true,
        isUnlocked: true,
        isLoading: false,
        error: null,
      });
    } catch (e) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: e instanceof Error ? e.message : "Failed to initialize encryption",
      }));
      throw e;
    }
  }, [initializeEncryptionMutation]);
  
  /**
   * Unlock encryption with password
   */
  const unlockEncryption = useCallback(async (password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    
    try {
      if (!getKeyMaterialQuery) {
        throw new Error("No encryption key material found");
      }
      
      const dek = await unlockDek(password, getKeyMaterialQuery.keyMaterial);
      await cacheDekSecurely(dek);
      
      setState((prev) => ({
        ...prev,
        isUnlocked: true,
        isLoading: false,
        error: null,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Invalid password",
      }));
      throw e;
    }
  }, [getKeyMaterialQuery]);
  
  /**
   * Lock encryption (clear DEK from memory)
   */
  const lockEncryption = useCallback(async () => {
    await clearCachedDek();
    setState((prev) => ({
      ...prev,
      isUnlocked: false,
    }));
  }, []);
  
  /**
   * Change password (re-wrap DEK with new password)
   */
  const changePassword = useCallback(async (
    currentPassword: string,
    newPassword: string
  ) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    
    try {
      if (!getKeyMaterialQuery) {
        throw new Error("No encryption key material found");
      }
      
      const newKeyMaterial = await rekeyWithNewPassword(
        currentPassword,
        newPassword,
        getKeyMaterialQuery.keyMaterial
      );
      
      await updateKeyMaterialMutation({
        keyMaterial: newKeyMaterial,
      });
      
      // Unlock with new password to get fresh DEK
      const dek = await unlockDek(newPassword, newKeyMaterial);
      await cacheDekSecurely(dek);
      
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: null,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: e instanceof Error ? e.message : "Failed to change password",
      }));
      throw e;
    }
  }, [getKeyMaterialQuery, updateKeyMaterialMutation]);
  
  /**
   * Encrypt a string
   */
  const encrypt = useCallback(async (plaintext: string): Promise<EncryptedEnvelope> => {
    if (!cachedDek) {
      throw new Error("Encryption not unlocked");
    }
    return encryptString(plaintext, cachedDek);
  }, []);
  
  /**
   * Decrypt an envelope
   */
  const decrypt = useCallback(async (envelope: EncryptedEnvelope): Promise<string> => {
    if (!cachedDek) {
      throw new Error("Encryption not unlocked");
    }
    return decryptString(envelope, cachedDek);
  }, []);
  
  /**
   * Encrypt an object
   */
  const encryptObj = useCallback(async <T>(obj: T): Promise<EncryptedEnvelope> => {
    if (!cachedDek) {
      throw new Error("Encryption not unlocked");
    }
    return encryptObject(obj, cachedDek);
  }, []);
  
  /**
   * Decrypt to an object
   */
  const decryptObj = useCallback(async <T>(envelope: EncryptedEnvelope): Promise<T> => {
    if (!cachedDek) {
      throw new Error("Encryption not unlocked");
    }
    return decryptObject<T>(envelope, cachedDek);
  }, []);
  
  /**
   * Check if a value looks like an encrypted envelope
   */
  const isEncryptedValue = useCallback((value: string): boolean => {
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
  }, []);
  
  return {
    ...state,
    initializeEncryption,
    unlockEncryption,
    lockEncryption,
    changePassword,
    encrypt,
    decrypt,
    encryptObj,
    decryptObj,
    isEncryptedValue,
  };
}

/**
 * Helper to check if encryption is required
 */
export function useRequiresEncryption(): boolean {
  const { isInitialized, isUnlocked } = useEncryption();
  return isInitialized && !isUnlocked;
}

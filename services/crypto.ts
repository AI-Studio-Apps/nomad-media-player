import { EncryptedData } from '../types';

// Utilities for ArrayBuffer <-> Base64
const buf2hex = (buffer: ArrayBuffer) => { 
  return Array.prototype.map.call(new Uint8Array(buffer), (x: number) => ('00' + x.toString(16)).slice(-2)).join(''); 
};

const str2buf = (str: string) => { 
  return new TextEncoder().encode(str); 
};

const buf2str = (buffer: ArrayBuffer) => { 
  return new TextDecoder().decode(buffer); 
};

const base64ToArrayBuffer = (base64: string) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const cryptoService = {
  /**
   * Generates a random salt.
   */
  generateSalt(): string {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    return arrayBufferToBase64(salt.buffer);
  },

  /**
   * Derives a CryptoKey from a password string and a salt.
   * Uses PBKDF2 with 100,000 iterations.
   */
  async deriveKey(password: string, saltBase64: string): Promise<CryptoKey> {
    const salt = base64ToArrayBuffer(saltBase64);
    const enc = new TextEncoder();
    
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true, // Exportable mainly to create the verifier, but typically we keep it internal
      ["encrypt", "decrypt"]
    );
  },

  /**
   * Creates a 'verifier' hash of the key. 
   * We export the key raw bytes and hash them. 
   * This allows us to check if the password is correct without storing the password.
   */
  async createVerifier(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    const hash = await window.crypto.subtle.digest("SHA-256", exported);
    return arrayBufferToBase64(hash);
  },

  /**
   * Encrypts a string (e.g., API Key) using the derived session key.
   */
  async encryptData(text: string, key: CryptoKey): Promise<EncryptedData> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = str2buf(text);

    const ciphertext = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      encoded
    );

    return {
      iv: arrayBufferToBase64(iv.buffer),
      ciphertext: arrayBufferToBase64(ciphertext)
    };
  },

  /**
   * Decrypts data using the derived session key.
   */
  async decryptData(data: EncryptedData, key: CryptoKey): Promise<string> {
    const iv = base64ToArrayBuffer(data.iv);
    const ciphertext = base64ToArrayBuffer(data.ciphertext);

    try {
      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv
        },
        key,
        ciphertext
      );
      return buf2str(decrypted);
    } catch (e) {
      throw new Error("Failed to decrypt. Key may be incorrect.");
    }
  }
};
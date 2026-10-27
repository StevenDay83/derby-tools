import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';

export function hashData(data: Uint8Array): string {
  return bytesToHex(sha256(data));
}

export function hashDataBytes(data: Uint8Array): Uint8Array {
  return sha256(data);
}

export function toBase64(data: Uint8Array): string {
  return base64.encode(data);
}

export function fromBase64(encoded: string): Uint8Array {
  return base64.decode(encoded);
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export { bytesToHex, hexToBytes };

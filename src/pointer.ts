import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes, randomBytes } from './util.js';
import { hashData } from './util.js';

export interface Pointer {
  pubkey: string;
  timestamp: number;
  pointerhash: string;
  size: number;
  nonce: number;
  id?: string;
  signature?: string;
}

const ORDERED_KEYS = ['id', 'pubkey', 'timestamp', 'pointerhash', 'size', 'nonce', 'signature'];

export function getPointerString(pointerObject: Partial<Pointer>): string {
  return JSON.stringify(pointerObject, ORDERED_KEYS);
}

export function generatePointerId(pointerObject: Pointer): string {
  if (!hasUnsignedAttributes(pointerObject)) {
    throw new Error('Invalid pointer object: missing required attributes or already has id/signature');
  }
  return hashData(new TextEncoder().encode(getPointerString(pointerObject)));
}

function hasUnsignedAttributes(pointerObject: Pointer): boolean {
  return !pointerObject.id && !pointerObject.signature &&
    pointerObject.nonce != undefined && !!pointerObject.pubkey &&
    !!pointerObject.pointerhash && !!pointerObject.timestamp && !!pointerObject.size;
}

export function generateSignature(privateKey: string, pointerObject: Pointer): string {
  if (!pointerObject.id) {
    throw new Error('Pointer object has no id');
  }
  if (getPublicKey(privateKey) !== pointerObject.pubkey) {
    throw new Error('Private key does not match pointer pubkey');
  }
  const signature = schnorr.sign(hexToBytes(pointerObject.id), privateKey);
  return bytesToHex(signature);
}

export function verifySignature(pointerObject: Pointer): boolean {
  if (!pointerObject.id || !pointerObject.signature || !pointerObject.pubkey) {
    return false;
  }
  if (!verifyId(pointerObject)) {
    return false;
  }
  try {
    return schnorr.verify(
      hexToBytes(pointerObject.signature),
      hexToBytes(pointerObject.id),
      hexToBytes(pointerObject.pubkey),
    );
  } catch {
    return false;
  }
}

export function verifyId(pointerObject: Pointer): boolean {
  const testObject: Pointer = {
    pubkey: pointerObject.pubkey,
    timestamp: pointerObject.timestamp,
    size: pointerObject.size,
    pointerhash: pointerObject.pointerhash,
    nonce: pointerObject.nonce,
  };
  try {
    return generatePointerId(testObject) === pointerObject.id;
  } catch {
    return false;
  }
}

export function generatePrivateKey(): string {
  return bytesToHex(randomBytes(32));
}

export function getPublicKey(secretKey: string): string {
  return bytesToHex(schnorr.getPublicKey(secretKey));
}

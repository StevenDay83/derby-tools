import { describe, it, expect } from 'vitest';
import {
  generatePointerId,
  generateSignature,
  verifySignature,
  verifyId,
  getPointerString,
  getPublicKey,
  generatePrivateKey,
} from '../src/pointer.js';
import { LEGACY_VECTORS } from './fixtures.js';

describe('pointer (legacy wire compat)', () => {
  it('getPublicKey matches legacy x-only nostr pubkey', () => {
    expect(getPublicKey(LEGACY_VECTORS.privateKey)).toBe(LEGACY_VECTORS.publicKey);
  });

  it('generatePointerId matches legacy vector', () => {
    const unsigned = { ...LEGACY_VECTORS.pointer };
    delete (unsigned as any).id;
    delete (unsigned as any).signature;
    expect(generatePointerId(unsigned as any)).toBe(LEGACY_VECTORS.pointer.id);
  });

  it('verifies a signature produced by the legacy library', () => {
    expect(verifySignature(LEGACY_VECTORS.pointer)).toBe(true);
    expect(verifyId(LEGACY_VECTORS.pointer)).toBe(true);
  });

  it('legacy library semantics: sign/verify round-trip with new keys', () => {
    const priv = generatePrivateKey();
    const pointer = {
      pubkey: getPublicKey(priv),
      timestamp: 1700000001,
      pointerhash: 'b'.repeat(64),
      size: 100,
      nonce: 7,
    };
    (pointer as any).id = generatePointerId(pointer);
    (pointer as any).signature = generateSignature(priv, pointer as any);
    expect(verifySignature(pointer as any)).toBe(true);
  });

  it('rejects tampered signatures', () => {
    const tampered = { ...LEGACY_VECTORS.pointer, nonce: 43 };
    expect(verifyId(tampered)).toBe(false);
    expect(verifySignature(tampered)).toBe(false);
  });

  it('generateSignature throws when pubkey mismatches private key', () => {
    const otherPriv = '01'.repeat(32);
    expect(() => generateSignature(otherPriv, LEGACY_VECTORS.pointer as any)).toThrow();
  });

  it('generatePointerId throws on already-signed object', () => {
    expect(() => generatePointerId(LEGACY_VECTORS.pointer as any)).toThrow();
  });

  it('getPointerString produces ordered JSON', () => {
    expect(getPointerString({ pubkey: 'p', timestamp: 1, size: 2, pointerhash: 'h', nonce: 3 } as any)).toBe(
      '{"pubkey":"p","timestamp":1,"pointerhash":"h","size":2,"nonce":3}',
    );
  });
});

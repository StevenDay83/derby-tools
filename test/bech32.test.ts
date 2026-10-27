import { describe, it, expect } from 'vitest';
import {
  encodeNetworkPublicKey,
  encodeNetworkPrivateKey,
  decodeNetworkPublicKey,
  decodeNetworkPrivateKey,
  isEncodedPublicKey,
  isEncodedPrivateKey,
} from '../src/bech32.js';
import { LEGACY_VECTORS } from './fixtures.js';

describe('bech32 keys (legacy wire compat)', () => {
  it('encodes public key identically to legacy', () => {
    expect(encodeNetworkPublicKey(LEGACY_VECTORS.publicKey)).toBe(LEGACY_VECTORS.bech32Public);
  });

  it('encodes private key identically to legacy', () => {
    expect(encodeNetworkPrivateKey(LEGACY_VECTORS.privateKey)).toBe(LEGACY_VECTORS.bech32Private);
  });

  it('round-trips', () => {
    expect(decodeNetworkPublicKey(LEGACY_VECTORS.bech32Public)).toBe(LEGACY_VECTORS.publicKey);
    expect(decodeNetworkPrivateKey(LEGACY_VECTORS.bech32Private)).toBe(LEGACY_VECTORS.privateKey);
  });

  it('throws on wrong prefix', () => {
    expect(() => decodeNetworkPublicKey(LEGACY_VECTORS.bech32Private)).toThrow();
    expect(() => decodeNetworkPrivateKey(LEGACY_VECTORS.bech32Public)).toThrow();
  });

  it('throws on corrupt encoding', () => {
    expect(() => decodeNetworkPublicKey(LEGACY_VECTORS.bech32Public.slice(0, -2) + 'xx')).toThrow();
  });

  it('prefix detectors', () => {
    expect(isEncodedPublicKey(LEGACY_VECTORS.bech32Public)).toBe(true);
    expect(isEncodedPrivateKey(LEGACY_VECTORS.bech32Private)).toBe(true);
    expect(isEncodedPublicKey(LEGACY_VECTORS.bech32Private)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { chunkData, combineData, getBase64, getBufferData, getDataHash } from '../src/blob.js';
import { LEGACY_VECTORS } from './fixtures.js';

const enc = new TextEncoder();

describe('blob', () => {
  it('hash matches legacy vector', () => {
    expect(getDataHash(enc.encode(LEGACY_VECTORS.dataUtf8))).toBe(LEGACY_VECTORS.dataSha256);
  });

  it('base64 round-trip matches legacy vector', () => {
    const data = enc.encode(LEGACY_VECTORS.dataUtf8);
    expect(getBase64(data)).toBe(LEGACY_VECTORS.dataBase64);
    expect(getBufferData(LEGACY_VECTORS.dataBase64)).toEqual(data);
  });

  it('chunkData exact multiple produces no phantom empty chunk', () => {
    const data = new Uint8Array(64).fill(1);
    const chunks = chunkData(data, 32);
    expect(chunks.length).toBe(2);
    expect(chunks.every(c => c.length === 32)).toBe(true);
  });

  it('chunkData with remainder', () => {
    const data = new Uint8Array(50).fill(2);
    const chunks = chunkData(data, 32);
    expect(chunks.length).toBe(2);
    expect(chunks[1]!.length).toBe(18);
  });

  it('chunkData of empty data returns no chunks', () => {
    expect(chunkData(new Uint8Array(0), 32)).toEqual([]);
  });

  it('chunk/combine round-trip', () => {
    const data = new Uint8Array(1000).map((_, i) => i % 256);
    const chunks = chunkData(data, 128);
    expect(combineData(chunks, data.length)).toEqual(data);
  });
});

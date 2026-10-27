import { describe, it, expect } from 'vitest';
import { DataDescriptor, getMerkleRoot } from '../src/data-descriptor.js';
import { LEGACY_VECTORS } from './fixtures.js';

describe('descriptor merkle root (legacy wire compat)', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    it(`matches legacy vector with ${n} hashes`, () => {
      expect(getMerkleRoot(LEGACY_VECTORS.hashes.slice(0, n))).toBe(LEGACY_VECTORS.merkleRoots[n]);
    });
  }
});

describe('DataDescriptor', () => {
  function sampleDescriptor(): DataDescriptor {
    const dd = new DataDescriptor();
    dd.setDataMimeType('text/plain');
    dd.setFilename('test.txt');
    for (const hash of LEGACY_VECTORS.hashes.slice(0, 3)) {
      dd.addBlobBlock([hash.slice(0, 64), hash, ['wss://relay.example'], 100]);
    }
    return dd;
  }

  it('computes merkleRoot and size from blocks', () => {
    const dd = sampleDescriptor();
    expect(dd.merkleRoot).toBe(LEGACY_VECTORS.merkleRoots[3]);
    expect(dd.metadata.size).toBe(300);
  });

  it('new output uses merkleRoot spelling', () => {
    const json = sampleDescriptor().generateDataDescriptorJSON();
    expect(json.merkleRoot).toBe(LEGACY_VECTORS.merkleRoots[3]);
    expect(json).not.toHaveProperty('merkelroot');
  });

  it('imports legacy merkelroot spelling', () => {
    const json = sampleDescriptor().generateDataDescriptorJSON() as any;
    json.merkelroot = json.merkleRoot;
    delete json.merkleRoot;
    const dd = new DataDescriptor().importDescriptor(json);
    expect(dd.merkleRoot).toBe(LEGACY_VECTORS.merkleRoots[3]);
  });

  it('imports legacy merkelRoot spelling', () => {
    const json = sampleDescriptor().generateDataDescriptorJSON() as any;
    json.merkelRoot = json.merkleRoot;
    delete json.merkleRoot;
    expect(new DataDescriptor().importDescriptor(json).merkleRoot).toBe(LEGACY_VECTORS.merkleRoots[3]);
  });

  it('rejects tampered size', () => {
    const json = sampleDescriptor().generateDataDescriptorJSON();
    json.metadata.size = 999;
    expect(() => new DataDescriptor().importDescriptor(json)).toThrow(/size/i);
  });

  it('rejects tampered merkle root', () => {
    const json = sampleDescriptor().generateDataDescriptorJSON();
    json.merkleRoot = 'ff'.repeat(32);
    expect(() => new DataDescriptor().importDescriptor(json)).toThrow(/merkle/i);
  });

  it('rejects empty datamap', () => {
    const json = sampleDescriptor().generateDataDescriptorJSON();
    json.datamap = [];
    expect(() => new DataDescriptor().importDescriptor(json)).toThrow(/datamap/i);
  });

  it('updateBlobBlock(0, ...) works and recomputes the root', () => {
    const dd = sampleDescriptor();
    const block = dd.blobMap[0]!;
    expect(dd.updateBlobBlock(0, ['x'.repeat(64), '66'.repeat(32), ['wss://r'], 50])).toBe(true);
    expect(dd.merkleRoot).not.toBe(LEGACY_VECTORS.merkleRoots[3]);
    expect(dd.updateBlobBlock(99, block)).toBe(false);
  });
});

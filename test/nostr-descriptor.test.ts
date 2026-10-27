import { describe, it, expect } from 'vitest';
import { DataDescriptor } from '../src/data-descriptor.js';
import {
  createEventFromDataDescriptor,
  importDescriptorFromEvent,
  getNAddrFromEvent,
  getMerkleRootTag,
  DERBY_DESCRIPTOR_KIND,
} from '../src/nostr-descriptor.js';
import { generatePrivateKey, getPublicKey } from '../src/pointer.js';
import { LEGACY_VECTORS } from './fixtures.js';

function sampleDescriptor(): DataDescriptor {
  const dd = new DataDescriptor();
  dd.setDataMimeType('text/plain');
  dd.setFilename('test.txt');
  dd.setStreamableData(true);
  for (const hash of LEGACY_VECTORS.hashes.slice(0, 3)) {
    dd.addBlobBlock([hash.slice(0, 64), hash, ['wss://relay.example'], 100]);
  }
  return dd;
}

describe('nostr descriptor', () => {
  it('creates a signed kind-37337 event and re-imports it', () => {
    const secretKey = generatePrivateKey();
    const dd = sampleDescriptor();
    const event = createEventFromDataDescriptor(dd, secretKey);

    expect(event.kind).toBe(DERBY_DESCRIPTOR_KIND);
    expect(event.pubkey).toBe(getPublicKey(secretKey));
    expect(getMerkleRootTag(event.tags as string[][])).toBe(dd.merkleRoot);
    expect(event.tags.find(t => t[0] === 'size')?.[1]).toBe('300');
    expect(event.tags.find(t => t[0] === 'streamable')?.[1]).toBe('true');

    const imported = importDescriptorFromEvent(event);
    expect(imported.merkleRoot).toBe(dd.merkleRoot);
    expect(imported.metadata.filename).toBe('test.txt');
    expect(imported.metadata.streamable).toBe(true);
    expect(imported.blobMap).toEqual(dd.blobMap);
  });

  it('rejects an event with a bad signature', () => {
    const event = createEventFromDataDescriptor(sampleDescriptor(), generatePrivateKey());
    event.content = '[]';
    expect(() => importDescriptorFromEvent(event)).toThrow(/signature/i);
  });

  it('produces an naddr with relay hints', () => {
    const event = createEventFromDataDescriptor(sampleDescriptor(), generatePrivateKey());
    const naddr = getNAddrFromEvent(event, ['wss://relay.example']);
    expect(naddr.startsWith('naddr1')).toBe(true);
  });

  it('throws without relay hints', () => {
    const event = createEventFromDataDescriptor(sampleDescriptor(), generatePrivateKey());
    expect(() => getNAddrFromEvent(event, [])).toThrow(/relay/i);
  });
});

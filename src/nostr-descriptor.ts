import { finalizeEvent, verifyEvent, getEventHash, nip19, getPublicKey, type EventTemplate, type NostrEvent } from 'nostr-tools';
import { DataDescriptor, BlobBlock } from './data-descriptor.js';
import { hexToBytes } from './util.js';

export const DERBY_DESCRIPTOR_KIND = 37337;

export function createEventFromDataDescriptor(
  dataDescriptor: DataDescriptor,
  secretKey: string,
  kind: number = DERBY_DESCRIPTOR_KIND,
): NostrEvent {
  if (!secretKey) {
    throw new Error('No secret key found');
  }
  if (!dataDescriptor?.metadata?.size || !dataDescriptor.blobMap?.length || !dataDescriptor.merkleRoot) {
    throw new Error('Invalid data descriptor');
  }

  const merkleRoot = dataDescriptor.merkleRoot;
  const template: EventTemplate = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    content: JSON.stringify(dataDescriptor.blobMap),
    tags: [
      ['d', merkleRoot],
      ['m', dataDescriptor.metadata.mimetype],
      ['streamable', dataDescriptor.metadata.streamable ? 'true' : 'false'],
      ['l', dataDescriptor.metadata.filename ? dataDescriptor.metadata.filename : merkleRoot + '.file'],
      ['size', dataDescriptor.metadata.size.toString()],
    ],
  };

  const event = finalizeEvent(template, hexToBytes(secretKey));
  if (event.pubkey !== getPublicKey(hexToBytes(secretKey))) {
    throw new Error('Signing failed');
  }
  return event as NostrEvent;
}

export function importDescriptorFromEvent(nostrEvent: NostrEvent): DataDescriptor {
  if (!nostrEvent) {
    throw new Error('Invalid Nostr Event');
  }
  if (getEventHash(nostrEvent) !== nostrEvent.id || !verifyEvent(nostrEvent)) {
    throw new Error('Invalid event signature');
  }

  const totalSize = Number.parseInt(getFirstValueFromTag(nostrEvent.tags, 'size') ?? '');
  const merkleRoot = getMerkleRootTag(nostrEvent.tags);
  const mimetype = getFirstValueFromTag(nostrEvent.tags, 'm');
  const filelabel = getFirstValueFromTag(nostrEvent.tags, 'l');
  const dataMap = JSON.parse(nostrEvent.content);
  const streamable = getFirstValueFromTag(nostrEvent.tags, 'streamable');

  const dataDescriptor = new DataDescriptor();
  dataDescriptor.setDataMimeType(mimetype ?? '');
  dataDescriptor.setFilename(filelabel ?? '');
  dataDescriptor.setStreamableData((streamable ?? '').toLowerCase() === 'true');

  if (!dataMap || !Array.isArray(dataMap) || dataMap.length === 0) {
    throw new Error('Invalid data map');
  }
  for (const block of dataMap) {
    if (block && Array.isArray(block) && block.length > 0) {
      dataDescriptor.addBlobBlock(block as BlobBlock);
    }
  }

  if (totalSize !== dataDescriptor.metadata.size) {
    throw new Error('Size mismatch');
  }
  if (merkleRoot !== dataDescriptor.merkleRoot) {
    throw new Error('Merkle root mismatch');
  }
  return dataDescriptor;
}

export function getNAddrFromEvent(nostrEvent: NostrEvent, relayHints: string[]): string {
  if (!nostrEvent?.pubkey || !nostrEvent.kind || !nostrEvent.tags) {
    throw new Error('Invalid event');
  }
  if (!relayHints || relayHints.length === 0) {
    throw new Error('Relay list empty');
  }
  return nip19.naddrEncode({
    pubkey: nostrEvent.pubkey,
    relays: relayHints,
    kind: nostrEvent.kind,
    identifier: getMerkleRootTag(nostrEvent.tags) ?? '',
  });
}

export function getMerkleRootTag(tags: string[][]): string | undefined {
  return getFirstValueFromTag(tags, 'd');
}

function getFirstValueFromTag(tags: string[][], key: string): string | undefined {
  if (!tags || !Array.isArray(tags)) {
    return undefined;
  }
  for (const tag of tags) {
    if (tag && Array.isArray(tag) && tag.length >= 2 && tag[0] === key) {
      return tag[1];
    }
  }
  return undefined;
}

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from './util.js';

export type BlobBlock = [pointerId: string, pointerHash: string, relayList: string[], size: number];

export interface DescriptorMetadata {
  mimetype: string;
  filename: string;
  size: number;
  streamable: boolean;
}

export interface DescriptorJSON {
  merkleRoot?: string;
  merkelroot?: string;
  merkelRoot?: string;
  metadata: {
    size: number;
    streamable?: boolean;
    filename?: string;
    mimetype?: string;
  };
  datamap: BlobBlock[];
}

// Wire-compatible with the legacy JS: it ran sha256(sha256(hexA + hexB))
// where the `sha256` package hashes the UTF-8 *hex strings*, so both rounds
// hash ASCII hex text rather than decoded bytes.
function legacyDoubleSha256HexPair(hexA: string, hexB: string): string {
  const encoder = new TextEncoder();
  const innerHex = bytesToHex(sha256(encoder.encode(hexA + hexB)));
  return bytesToHex(sha256(encoder.encode(innerHex)));
}

export function getMerkleRoot(hashArray: string[]): string {
  if (!hashArray || hashArray.length === 0) {
    throw new Error('Cannot compute merkle root of empty hash list');
  }
  // Match legacy recursion semantics: on the first level, a single hash is
  // duplicated and hashed; on later levels a lone hash is the root.
  let level = hashArray.slice();
  let firstRun = true;
  while (level.length > 1 || firstRun) {
    firstRun = false;
    const work = level.slice();
    if (work.length % 2 === 1) {
      work.push(work[work.length - 1]!);
    }
    const next: string[] = [];
    for (let i = 0; i < work.length; i += 2) {
      next.push(legacyDoubleSha256HexPair(work[i]!, work[i + 1]!));
    }
    level = next;
  }
  return level[0]!;
}

export class DataDescriptor {
  metadata: DescriptorMetadata = {
    mimetype: '',
    filename: '',
    size: 0,
    streamable: false,
  };
  blobMap: BlobBlock[] = [];
  merkleRoot?: string;

  setDataMimeType(mimetype: string): void {
    this.metadata.mimetype = mimetype;
  }

  setFilename(filename: string): void {
    this.metadata.filename = filename;
  }

  setStreamableData(streamable: boolean): void {
    this.metadata.streamable = streamable;
  }

  addPointerAsBlobBlock(pointerObject: { id?: string; pointerhash?: string; size?: number }, relayList: string[]): boolean {
    if (!pointerObject || !pointerObject.id || !pointerObject.pointerhash || !pointerObject.size) {
      return false;
    }
    if (!relayList || relayList.length === 0) {
      return false;
    }
    return this.addBlobBlock([pointerObject.id, pointerObject.pointerhash, relayList, pointerObject.size]);
  }

  addBlobBlock(blobBlock: BlobBlock): boolean {
    if (!blobBlock || !Array.isArray(blobBlock) || blobBlock.length < 2) {
      return false;
    }
    this.blobMap.push(blobBlock);
    this.calculateMerkleRoot();
    this.calculateSize();
    return true;
  }

  updateBlobBlock(index: number, blobBlock: BlobBlock): boolean {
    if (index == undefined || !blobBlock || index >= this.blobMap.length) {
      return false;
    }
    this.blobMap[index] = blobBlock;
    this.calculateMerkleRoot();
    return true;
  }

  private calculateMerkleRoot(): void {
    const pointerHashList = this.blobMap
      .filter(block => block.length > 1)
      .map(block => block[1]);
    this.merkleRoot = getMerkleRoot(pointerHashList);
  }

  private calculateSize(): void {
    this.metadata.size = this.blobMap
      .filter(block => block.length >= 4)
      .reduce((sum, block) => sum + block[3], 0);
  }

  generateDataDescriptorJSON(): DescriptorJSON {
    if (!this.blobMap.length || !this.metadata.size || !this.merkleRoot) {
      throw new Error('Descriptor is incomplete');
    }
    const json: DescriptorJSON = {
      merkleRoot: this.merkleRoot,
      metadata: {
        size: this.metadata.size,
        streamable: this.metadata.streamable ?? false,
      },
      datamap: this.blobMap,
    };
    if (this.metadata.filename != undefined) {
      json.metadata.filename = this.metadata.filename.toString();
    }
    if (this.metadata.mimetype != undefined) {
      json.metadata.mimetype = this.metadata.mimetype.toString();
    }
    return json;
  }

  importDescriptor(descriptorJSON: DescriptorJSON): this {
    if (!descriptorJSON || !descriptorJSON.metadata) {
      throw new Error('Invalid data descriptor');
    }
    if (!descriptorJSON.metadata.size) {
      throw new Error('Invalid reported size');
    }
    if (!descriptorJSON.datamap || !Array.isArray(descriptorJSON.datamap) || descriptorJSON.datamap.length === 0) {
      throw new Error('Invalid datamap');
    }
    // Lenient: accept the legacy misspellings as well as the fixed key.
    const reportedRoot = descriptorJSON.merkleRoot ?? descriptorJSON.merkelroot ?? descriptorJSON.merkelRoot;
    if (!reportedRoot) {
      throw new Error('No merkle root present');
    }

    this.blobMap = descriptorJSON.datamap;
    this.calculateMerkleRoot();
    this.calculateSize();

    if (this.metadata.size !== descriptorJSON.metadata.size) {
      throw new Error('Invalid reported size');
    }
    if (this.merkleRoot !== reportedRoot) {
      throw new Error('Invalid merkle root');
    }
    this.setDataMimeType(descriptorJSON.metadata.mimetype ?? '');
    this.setStreamableData(descriptorJSON.metadata.streamable ?? false);
    this.setFilename(descriptorJSON.metadata.filename ?? '');
    return this;
  }
}

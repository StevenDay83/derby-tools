import { DerbyClient, PublishResult } from './derby-client.js';
import { DataDescriptor } from './data-descriptor.js';
import { Pointer, generatePointerId, generateSignature, getPublicKey } from './pointer.js';
import { hashData } from './util.js';

export interface UploadProgress {
  relayURL: string;
  pointerId: string;
  pointerHash: string;
  blockIndex: number;
  completedBlocks: number;
  totalBlocks: number;
  error?: Error;
}

export interface UploadResult {
  pointerIds: string[];
  results: PublishResult[][];
}

const UPLOAD_CONCURRENCY = 4;

export class UploadTransferManager {
  private clients: DerbyClient[];
  readonly dataDescriptor: DataDescriptor;
  private secretKey: string;
  private dataTable = new Map<string, Uint8Array>();
  private pointerTable = new Map<string, Pointer>();

  constructor(clients: DerbyClient[], dataDescriptor: DataDescriptor, secretKey: string) {
    this.clients = clients;
    this.dataDescriptor = dataDescriptor;
    this.secretKey = secretKey;
  }

  importDataChunksList(chunkArray: Uint8Array[]): boolean {
    this.dataTable.clear();
    this.pointerTable.clear();
    this.dataDescriptor.blobMap = [];

    if (!chunkArray?.length || !this.secretKey) {
      return false;
    }
    for (const chunk of chunkArray) {
      const dataHash = hashData(chunk);
      this.dataTable.set(dataHash, chunk);
      const pointer: Pointer = {
        pubkey: getPublicKey(this.secretKey),
        timestamp: Math.floor(Date.now() / 1000),
        nonce: Math.floor(Math.random() * (1000000 - 10) + 10),
        size: chunk.length,
        pointerhash: dataHash,
      };
      pointer.id = generatePointerId(pointer);
      pointer.signature = generateSignature(this.secretKey, pointer);

      this.dataDescriptor.addPointerAsBlobBlock(pointer, this.getRelayList());
      this.pointerTable.set(pointer.id, pointer);
    }
    return true;
  }

  // Publishes every block to every relay, with bounded concurrency. Resolves
  // when all uploads finish; rejects if any block failed on all relays.
  async upload(onProgress?: (progress: UploadProgress) => void): Promise<UploadResult> {
    const blocks = this.dataDescriptor.blobMap;
    if (!blocks?.length) {
      throw new Error('Data descriptor has no blob map');
    }

    const results: PublishResult[][] = new Array(blocks.length);
    const blockErrors: Error[] = [];
    let completedBlocks = 0;

    const tasks: Array<() => Promise<void>> = [];
    blocks.forEach((block, blockIndex) => {
      const pointerId = block[0];
      const pointerHash = block[1];
      const pointer = this.pointerTable.get(pointerId);
      const rawData = this.dataTable.get(pointerHash);
      if (!pointer || !rawData) {
        throw new Error('Missing data for block ' + blockIndex);
      }
      results[blockIndex] = [];
      for (const client of this.clients) {
        tasks.push(async () => {
          try {
            const result = await client.publishPointer(pointer, rawData);
            results[blockIndex]!.push(result);
            completedBlocks++;
            onProgress?.({
              relayURL: client.relayURL,
              pointerId,
              pointerHash: result.pointerHash,
              blockIndex,
              completedBlocks,
              totalBlocks: blocks.length * this.clients.length,
            });
          } catch (e) {
            blockErrors.push(e as Error);
            onProgress?.({
              relayURL: client.relayURL,
              pointerId,
              pointerHash,
              blockIndex,
              completedBlocks,
              totalBlocks: blocks.length * this.clients.length,
              error: e as Error,
            });
          }
        });
      }
    });

    await runWithConcurrency(tasks, UPLOAD_CONCURRENCY);

    const failedBlocks = results.filter(r => r.length === 0).length;
    if (failedBlocks > 0) {
      throw new Error(
        `Upload failed for ${failedBlocks} block(s) on all relays: ${blockErrors.map(e => e.message).join('; ')}`,
      );
    }

    return { pointerIds: blocks.map(b => b[0]), results };
  }

  getRelayList(): string[] {
    return this.clients.map(client => client.relayURL);
  }
}

async function runWithConcurrency(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const task of tasks) {
    const p = task().finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

export interface DownloadProgress {
  completedBlocks: number;
  blockIndex: number;
  blockSize: number;
  totalBlocks: number;
}

export class DownloadTransferManager {
  private dataDescriptor?: DataDescriptor;
  private relayPool = new Map<string, DerbyClient>();
  private badRelays: string[] = [];
  private connectFactory: (relayURL: string) => Promise<DerbyClient>;

  constructor(connectFactory?: (relayURL: string) => Promise<DerbyClient>) {
    this.connectFactory = connectFactory ?? (async (relayURL: string) => {
      const client = new DerbyClient(relayURL);
      await client.connect();
      return client;
    });
  }

  setDataDescriptor(dataDescriptor: DataDescriptor): void {
    if (!dataDescriptor) {
      throw new Error('Invalid data descriptor');
    }
    if (!dataDescriptor.metadata?.size) {
      throw new Error('Data descriptor metadata missing');
    }
    if (!dataDescriptor.merkleRoot) {
      throw new Error('Merkle root missing');
    }
    if (!dataDescriptor.blobMap?.length) {
      throw new Error('Data map empty');
    }
    this.dataDescriptor = dataDescriptor;
  }

  getListOfRelays(): string[] {
    const listOfRelays: string[] = [];
    for (const block of this.dataDescriptor?.blobMap ?? []) {
      for (const relayEntry of block[2] ?? []) {
        const lowered = relayEntry.toLowerCase();
        if (!listOfRelays.includes(lowered)) {
          listOfRelays.push(lowered);
        }
      }
    }
    return listOfRelays;
  }

  private async connectToRelays(): Promise<void> {
    const relayURLList = this.getListOfRelays();
    await Promise.all(relayURLList.map(async relayURL => {
      try {
        const client = await this.connectFactory(relayURL);
        this.relayPool.set(relayURL, client);
      } catch {
        this.badRelays.push(relayURL);
      }
    }));
  }

  // Downloads all blocks with per-block relay failover. Resolves exactly once
  // with the reassembled data; rejects if any block could not be retrieved.
  async download(onProgress?: (progress: DownloadProgress) => void): Promise<Uint8Array> {
    if (!this.dataDescriptor) {
      throw new Error('No data descriptor set');
    }
    await this.connectToRelays();

    const dataMap = this.dataDescriptor.blobMap;
    const chunks: Uint8Array[] = new Array(dataMap.length);
    let completedBlocks = 0;

    await Promise.all(dataMap.map(async (block, blockIndex) => {
      const data = await this.downloadDataFromBlock(block, 0);
      if (data.length !== block[3] || hashData(data) !== block[1]) {
        throw new Error('Size or hash mismatch for block ' + blockIndex);
      }
      chunks[blockIndex] = data;
      completedBlocks++;
      onProgress?.({ completedBlocks, blockIndex, blockSize: data.length, totalBlocks: dataMap.length });
    }));

    const totalSize = this.dataDescriptor.metadata.size;
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  }

  private async downloadDataFromBlock(block: [string, string, string[], number], index: number): Promise<Uint8Array> {
    const pointerId = block[0];
    const relayList = block[2];

    if (index >= relayList.length) {
      throw new Error('Could not retrieve block ' + pointerId);
    }
    const relayURL = relayList[index]!.toLowerCase();

    if (this.badRelays.includes(relayURL)) {
      return this.downloadDataFromBlock(block, index + 1);
    }

    const client = this.relayPool.get(relayURL);
    if (!client) {
      return this.downloadDataFromBlock(block, index + 1);
    }

    try {
      const result = await client.requestData(pointerId);
      return result.data;
    } catch {
      return this.downloadDataFromBlock(block, index + 1);
    }
  }
}

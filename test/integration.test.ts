import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import {
  DerbyClient,
  generatePrivateKey,
  getPublicKey,
  generatePointerId,
  generateSignature,
  hashData,
  chunkData,
  DataDescriptor,
  UploadTransferManager,
  DownloadTransferManager,
  Pointer,
} from '../src/index.js';

const RELAY_DIR = path.resolve(__dirname, '../../derby-storage-relay');
const RELAY_PORT = 18458;
const RELAY_URL = `ws://127.0.0.1:${RELAY_PORT}`;

const relayExists = fs.existsSync(path.join(RELAY_DIR, 'index.js'));

function makePointer(privKey: string, data: Uint8Array, nonce: number, timestamp: number): Pointer {
  const pointer: Pointer = {
    pubkey: getPublicKey(privKey),
    timestamp,
    pointerhash: hashData(data),
    size: data.length,
    nonce,
  };
  pointer.id = generatePointerId(pointer);
  pointer.signature = generateSignature(privKey, pointer);
  return pointer;
}

describe.skipIf(!relayExists)('integration with derby-storage-relay', () => {
  let tempDir: string;
  let serverProcess: ChildProcess;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'derby-it-'));
    const blobDir = path.join(tempDir, 'BlobData');
    fs.mkdirSync(blobDir);

    const filterGroupFile = path.join(tempDir, 'filter.json');
    fs.writeFileSync(filterGroupFile, JSON.stringify({
      default: {
        settings: {
          canpublish: true,
          canreplace: true,
          candelete: true,
          pointerexpiration: 0,
          maximumpointers: 1000,
          maximumpointerhashsize: 50000000,
        },
      },
    }));
    const filterKeysFile = path.join(tempDir, 'filterkeys.json');
    fs.writeFileSync(filterKeysFile, JSON.stringify({}));
    const ipFilterFile = path.join(tempDir, 'ipfilter.json');
    fs.writeFileSync(ipFilterFile, JSON.stringify({ block: [], safe: ['0.0.0.0/0'] }));
    const settingsFile = path.join(tempDir, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({
      server: { host: '127.0.0.1', port: RELAY_PORT, sessionTimeout: 30000, filteripfile: ipFilterFile },
      storage: { directory: blobDir, fileSuffix: 'blob', dataBlockLimit: 512000 },
      pointer: { timestampDelta: 300 },
      database: { type: 'sqlite', file: path.join(tempDir, 'pointers.db') },
      filter: { filtergroupfile: filterGroupFile, filterkeysfile: filterKeysFile },
      cache: { pointerCache: { pointerCacheTTL: 300, maxPointers: 10000 } },
    }));

    serverProcess = spawn('node', ['index.js'], {
      cwd: RELAY_DIR,
      env: { ...process.env, DERBY_SETTINGS: settingsFile },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stderr?.on('data', d => process.stderr.write('[relay] ' + d));

    // Wait for the relay to accept connections.
    let client: DerbyClient | undefined;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        client = new DerbyClient(RELAY_URL);
        await client.connect();
        client.close();
        return;
      } catch {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    throw new Error('Relay did not start');
  }, 30000);

  afterAll(() => {
    try { serverProcess?.kill(); } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it('publish -> request -> requestData -> replace -> delete', async () => {
    const client = new DerbyClient(RELAY_URL);
    await client.connect();

    const privKey = generatePrivateKey();
    const pubKey = getPublicKey(privKey);
    const testData = crypto.getRandomValues(new Uint8Array(4096));
    const baseNow = Math.floor(Date.now() / 1000);

    // 1. Publish with data
    const pointer = makePointer(privKey, testData, 1, baseNow);
    const publish = await client.publishPointer(pointer, testData);
    expect(publish.id).toBe(pointer.id);
    expect(publish.pointerHash).toBe(pointer.pointerhash);

    // 2. Request it back
    const found = await client.requestPointers({ ids: [pointer.id!] });
    expect(found.length).toBe(1);
    expect(found[0]!.id).toBe(pointer.id);

    // 3. Request data (client-side hash verify happens inside requestData)
    const data = await client.requestData(pointer.id!);
    expect(data.pointerHash).toBe(pointer.pointerhash);
    expect(data.data).toEqual(testData);

    // 4. Replace
    const replacement = makePointer(privKey, testData, 2, baseNow + 10);
    await client.publishPointer(replacement);
    const gone = await client.requestPointers({ ids: [pointer.id!] });
    expect(gone.length).toBe(0);

    // 5. Delete
    const deletion: Pointer = {
      pubkey: pubKey,
      timestamp: baseNow + 20,
      pointerhash: replacement.pointerhash,
      size: replacement.size,
      nonce: 3,
    };
    deletion.id = generatePointerId(deletion);
    deletion.signature = generateSignature(privKey, deletion);
    const del = await client.deletePointer(deletion);
    expect(del.deletedId).toBe(replacement.id);

    // 6. Nothing remains
    const empty = await client.requestPointers({ owners: [pubKey] });
    expect(empty.length).toBe(0);

    client.close();
  }, 30000);

  it('multi-block upload + download round-trip via transfer managers', async () => {
    const client = new DerbyClient(RELAY_URL);
    await client.connect();

    const privKey = generatePrivateKey();
    const data = new Uint8Array(100000);
    for (let offset = 0; offset < data.length; offset += 65536) {
      crypto.getRandomValues(data.subarray(offset, offset + 65536));
    }
    const chunks = chunkData(data, 10000);
    expect(chunks.length).toBe(10);

    const descriptor = new DataDescriptor();
    descriptor.setDataMimeType('application/octet-stream');
    descriptor.setFilename('roundtrip.bin');

    const uploader = new UploadTransferManager([client], descriptor, privKey);
    expect(uploader.importDataChunksList(chunks)).toBe(true);
    expect(descriptor.blobMap.length).toBe(10);

    const uploadResult = await uploader.upload();
    expect(uploadResult.pointerIds.length).toBe(10);

    const downloader = new DownloadTransferManager();
    downloader.setDataDescriptor(descriptor);
    const downloaded = await downloader.download();
    expect(downloaded).toEqual(data);

    client.close();
  }, 60000);
});

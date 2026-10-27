# derby-tools

TypeScript client library for the Derby storage-relay network: pointer
creation and BIP-340 signing, the relay wire protocol, chunked uploads and
downloads with relay failover, data descriptors (merkle roots), and nostr
descriptor events.

## Install

```sh
npm install derby-tools
```

Requires Node.js >= 18 (WebSocket fallback via `ws`; on Node >= 22 and in
browsers the native `WebSocket` is used). Works in Node and browsers.

## Quickstart

```ts
import {
  DerbyClient,
  generatePrivateKey,
  getPublicKey,
  generatePointerId,
  generateSignature,
  hashData,
} from 'derby-tools';

const client = new DerbyClient('ws://127.0.0.1:8080');
await client.connect();

const secretKey = generatePrivateKey();
const data = new TextEncoder().encode('hello derby');

const pointer = {
  pubkey: getPublicKey(secretKey),
  timestamp: Math.floor(Date.now() / 1000),
  pointerhash: hashData(data),
  size: data.length,
  nonce: 1,
};
pointer.id = generatePointerId(pointer);
pointer.signature = generateSignature(secretKey, pointer);

// Publish (data optional), request, download (hash verified client-side)
await client.publishPointer(pointer, data);
const found = await client.requestPointers({ ids: [pointer.id] });
const { data: downloaded } = await client.requestData(pointer.id);

client.close();
```

All request methods accept `{ timeout }` in ms and default to 30 s. Protocol
failures reject with `ProtocolError` (`code`, `contextId`).

## Chunked transfers

```ts
import { DataDescriptor, UploadTransferManager, DownloadTransferManager, chunkData } from 'derby-tools';

const descriptor = new DataDescriptor();
descriptor.setFilename('file.bin');

const uploader = new UploadTransferManager([client], descriptor, secretKey);
uploader.importDataChunksList(chunkData(fileBytes, 512_000));
await uploader.upload(p => console.log(p.completedBlocks, '/', p.totalBlocks));

const downloader = new DownloadTransferManager();
downloader.setDataDescriptor(descriptor); // connects to the relays in the descriptor
const bytes = await downloader.download(); // per-block failover, hash verified
```

## Nostr descriptors

```ts
import { createEventFromDataDescriptor, importDescriptorFromEvent, getNAddrFromEvent } from 'derby-tools';

const event = createEventFromDataDescriptor(descriptor, secretKey); // kind 37337
const naddr = getNAddrFromEvent(event, ['wss://relay.example']);
const descriptor2 = importDescriptorFromEvent(event); // verifies signature, size, merkle root
```

## Migrating from 1.x

2.0.0 is a breaking rewrite.

- **Callbacks → promises.** `MessageManager` callback APIs are replaced by
  `DerbyClient` (`connect`, `publishPointer`, `deletePointer`,
  `requestPointers`, `requestData`), all async with 30 s default timeouts.
  `RelayClient` is now an `EventEmitter` (`on('connect' | 'OK' | 'ERROR' |
  'DATAOK' | 'POINTER' | 'REQEND' | 'close')`) — registering a handler no
  longer clobbers other listeners.
- **`requestData` verifies the data hash** client-side and returns decoded
  bytes (`Uint8Array`), not base64.
- **`merkleRoot` spelling fixed.** `DataDescriptor.generateDataDescriptorJSON()`
  now emits `merkleRoot` (was `merkelroot`); `importDescriptor` still accepts
  the legacy `merkelroot`/`merkelRoot` spellings.
- **Errors are typed**: `ProtocolError extends Error { code, contextId }`
  instead of `Error` with a JSON-stringified message.
- **Binary data is `Uint8Array`**, not Node `Buffer` (works in browsers).
- Transfer managers are async:
  `UploadTransferManager(clients, descriptor, secretKey).upload(onProgress?)`
  and `new DownloadTransferManager().download(onProgress?)` (call
  `setDataDescriptor` first). Download failover now actually skips bad relays
  and resolves exactly once.
- **Legacy code** is archived under `archive/legacy-js/` (git tag
  `legacy-js`). The old `index.js` contained hardcoded private keys —
  consider those keys burned and do not reuse them.
- Legacy dependencies (`bigi`, `bip-schnorr`, `sha256`, `bech32`,
  `webpack` polyfills) were replaced by `@noble/curves`, `@noble/hashes`,
  `@scure/base`, `nostr-tools` and `ws`.

## Development

```sh
npm install
npm run typecheck   # tsc --noEmit (strict)
npm test            # vitest (unit + integration; spawns ../derby-storage-relay if present)
npm run build       # tsup -> dist/node + dist/browser (ESM + CJS + d.ts)
```

## License

BSD-2-Clause (no LICENSE file is currently included in the repository).

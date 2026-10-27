import { hashData, toBase64, fromBase64 } from './util.js';

export { hashData as getDataHash };

export function chunkData(data: Uint8Array, blockSize: number): Uint8Array[] {
  if (!(data instanceof Uint8Array) || blockSize <= 0) {
    return [];
  }
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += blockSize) {
    chunks.push(data.slice(offset, offset + blockSize));
  }
  return chunks;
}

export function combineData(dataArray: Uint8Array[], size: number): Uint8Array {
  if (!size || !dataArray || dataArray.length === 0) {
    return new Uint8Array(size || 0);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of dataArray) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

export function getBase64(data: Uint8Array): string {
  return toBase64(data);
}

export function getBufferData(base64Data: string): Uint8Array {
  return fromBase64(base64Data);
}

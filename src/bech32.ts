import { bech32m } from '@scure/base';
import { bytesToHex, hexToBytes } from './util.js';

export const PUBLIC_KEY_PREFIX = 'derby';
export const PRIVATE_KEY_PREFIX = 'dsec';

function encodeNetworkKey(hexKeyString: string, isPublic: boolean): string {
  const bytes = hexToBytes(hexKeyString);
  if (bytes.length === 0) {
    throw new Error('Invalid key: empty');
  }
  return bech32m.encode(isPublic ? PUBLIC_KEY_PREFIX : PRIVATE_KEY_PREFIX, bech32m.toWords(bytes));
}

function decodeNetworkKey(bechString: string, isPublic: boolean): string {
  const expectedPrefix = isPublic ? PUBLIC_KEY_PREFIX : PRIVATE_KEY_PREFIX;
  if (!bechString || !bechString.startsWith(expectedPrefix + '1')) {
    throw new Error(`Invalid key: expected prefix "${expectedPrefix}"`);
  }
  let decoded: { prefix: string; words: number[] };
  try {
    decoded = bech32m.decode(bechString as `${string}1${string}`);
  } catch (e) {
    throw new Error('Invalid bech32m encoding: ' + (e as Error).message);
  }
  if (decoded.prefix !== expectedPrefix) {
    throw new Error(`Invalid key prefix "${decoded.prefix}", expected "${expectedPrefix}"`);
  }
  return bytesToHex(new Uint8Array(bech32m.fromWords(decoded.words)));
}

export function encodeNetworkPublicKey(hexKeyString: string): string {
  return encodeNetworkKey(hexKeyString, true);
}

export function encodeNetworkPrivateKey(hexKeyString: string): string {
  return encodeNetworkKey(hexKeyString, false);
}

export function decodeNetworkPublicKey(bechString: string): string {
  return decodeNetworkKey(bechString, true);
}

export function decodeNetworkPrivateKey(bechString: string): string {
  return decodeNetworkKey(bechString, false);
}

export function isEncodedPublicKey(value: string): boolean {
  return !!value && value.startsWith(PUBLIC_KEY_PREFIX + '1');
}

export function isEncodedPrivateKey(value: string): boolean {
  return !!value && value.startsWith(PRIVATE_KEY_PREFIX + '1');
}

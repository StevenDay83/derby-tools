import { RelayClient, RelayClientOptions } from './relay-client.js';
import { ProtocolError } from './errors.js';
import { Commands, Responses } from './protocol.js';
import { Pointer } from './pointer.js';
import { bytesToHex, randomBytes, fromBase64, toBase64, hashData } from './util.js';

export interface RequestOptions {
  timeout?: number; // ms, defaults to DEFAULT_TIMEOUT
}

export const DEFAULT_TIMEOUT = 30000;

export interface PublishResult {
  id: string;
  pointerHash: string;
}

export interface DeleteResult {
  deletionId: string;
  deletedId: string;
}

export interface DataResult {
  pointerId: string;
  pointerHash: string;
  data: Uint8Array;
}

type OkListener = (referenceId: string, extra: string) => void;
type PointerListener = (referenceId: string, pointerResults: unknown[]) => void;
type ReqEndListener = (referenceId: string) => void;
type DataOkListener = (referenceId: string, pointerHash: string, base64Data: string) => void;
type ErrorListener = (referenceId: string, errorCode: number, errorMessage: string) => void;

// Correlates relay responses with outstanding requests. Subscribes to the
// RelayClient as one listener among many, so user handlers are never clobbered.
class MessageManager {
  readonly relayClient: RelayClient;
  private defaultTimeout: number;
  private responseListeners: Record<string, Map<string, (...args: any[]) => void>> = {
    OK: new Map(),
    DATAOK: new Map(),
    POINTER: new Map(),
    REQEND: new Map(),
    ERROR: new Map(),
  };
  private catchAllErrorListener: (errorCode: number, errorMessage: string) => void = (code, msg) => {
    console.error(new ProtocolError(code, '', msg));
  };

  constructor(relayClient: RelayClient, defaultTimeout: number = DEFAULT_TIMEOUT) {
    this.relayClient = relayClient;
    this.defaultTimeout = defaultTimeout;

    relayClient.on('OK', (message: unknown[]) => this.handleMessages('OK', message));
    relayClient.on('ERROR', (message: unknown[]) => this.handleMessages('ERROR', message));
    relayClient.on('DATAOK', (message: unknown[]) => this.handleMessages('DATAOK', message));
    relayClient.on('POINTER', (message: unknown[]) => this.handleMessages('POINTER', message));
    relayClient.on('REQEND', (message: unknown[]) => this.handleMessages('REQEND', message));
  }

  private addResponseListener(id: string, messageType: string, callback: (...args: any[]) => void): void {
    const bucket = this.responseListeners[messageType];
    if (!bucket) {
      throw new Error('Unknown message type: ' + messageType);
    }
    bucket.set(id, callback);
  }

  private removeResponseListener(id: string, messageType: string): void {
    this.responseListeners[messageType]?.delete(id);
  }

  private removeAllFor(id: string): void {
    for (const bucket of Object.values(this.responseListeners)) {
      bucket.delete(id);
    }
  }

  setCatchAllErrorListener(callback: (errorCode: number, errorMessage: string) => void): void {
    this.catchAllErrorListener = callback;
  }

  private withTimeout<T>(id: string, timeout: number | undefined, executor: (timeoutMs: number) => Promise<T>): Promise<T> {
    const timeoutMs = timeout ?? this.defaultTimeout;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeAllFor(id);
        reject(new Error(`Request timed out after ${timeoutMs}ms (id ${id})`));
      }, timeoutMs);
      executor(timeoutMs).then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        err => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  publishPointer(pointer: Pointer, base64Data?: string, opts: RequestOptions = {}): Promise<PublishResult> {
    if (!pointer || pointer.id == undefined) {
      return Promise.reject(new Error('Invalid Pointer Object'));
    }
    const id = pointer.id;
    return this.withTimeout(id, opts.timeout, async () => new Promise<PublishResult>((resolve, reject) => {
      this.addResponseListener(id, Responses.OK, (refId: string, pointerHash: string) => {
        this.removeAllFor(id);
        resolve({ id: refId, pointerHash });
      });
      this.addResponseListener(id, Responses.ERROR, (refId: string, errorCode: number, errorMessage: string) => {
        this.removeAllFor(id);
        reject(new ProtocolError(errorCode, refId, errorMessage));
      });

      const message: unknown[] = [Commands.POINTER, pointer, Commands.POINTER_PUBLISH];
      if (base64Data) {
        message.push(base64Data);
      }
      if (!this.relayClient.send(message)) {
        this.removeAllFor(id);
        reject(new Error('Failed to send PUBLISH message'));
      }
    }));
  }

  deletePointer(deletionPointer: Pointer, opts: RequestOptions = {}): Promise<DeleteResult> {
    if (!deletionPointer || deletionPointer.id == undefined) {
      return Promise.reject(new Error('Invalid Deletion Pointer'));
    }
    const id = deletionPointer.id;
    return this.withTimeout(id, opts.timeout, async () => new Promise<DeleteResult>((resolve, reject) => {
      this.addResponseListener(id, Responses.OK, (refId: string, deletedPointerId: string) => {
        this.removeAllFor(id);
        resolve({ deletionId: refId, deletedId: deletedPointerId });
      });
      this.addResponseListener(id, Responses.ERROR, (refId: string, errorCode: number, errorMessage: string) => {
        this.removeAllFor(id);
        reject(new ProtocolError(errorCode, refId, errorMessage));
      });

      if (!this.relayClient.send([Commands.POINTER, deletionPointer, Commands.POINTER_DELETE])) {
        this.removeAllFor(id);
        reject(new Error('Failed to send DELETE message'));
      }
    }));
  }

  requestPointers(pointerQuery: Record<string, unknown>, opts: RequestOptions = {}): Promise<Pointer[]> {
    if (!pointerQuery) {
      return Promise.reject(new Error('Invalid query object'));
    }
    const id = bytesToHex(randomBytes(32));
    return this.withTimeout(id, opts.timeout, async () => new Promise<Pointer[]>((resolve, reject) => {
      const pointerResults: Pointer[] = [];
      this.addResponseListener(id, Responses.POINTER_RESPONSE, (refId: string, list: unknown[]) => {
        if (Array.isArray(list)) {
          pointerResults.push(...(list as Pointer[]));
        }
      });
      this.addResponseListener(id, Responses.REQUEST_POINTER_END, () => {
        this.removeAllFor(id);
        resolve(pointerResults);
      });
      this.addResponseListener(id, Responses.ERROR, (refId: string, errorCode: number, errorMessage: string) => {
        this.removeAllFor(id);
        reject(new ProtocolError(errorCode, refId, errorMessage));
      });

      if (!this.relayClient.send([Commands.REQUEST_POINTER, id, pointerQuery])) {
        this.removeAllFor(id);
        reject(new Error('Failed to send REQUEST message'));
      }
    }));
  }

  requestData(pointerId: string, opts: RequestOptions = {}): Promise<DataResult> {
    if (!pointerId) {
      return Promise.reject(new Error('Invalid Pointer ID'));
    }
    return this.withTimeout(pointerId, opts.timeout, async () => new Promise<DataResult>((resolve, reject) => {
      this.addResponseListener(pointerId, Responses.DATA_OK, (refId: string, pointerHash: string, base64Data: string) => {
        this.removeAllFor(pointerId);
        let data: Uint8Array;
        try {
          data = fromBase64(base64Data);
        } catch {
          reject(new ProtocolError(0x05, refId, 'Invalid base64 data in DATAOK response'));
          return;
        }
        if (hashData(data) !== pointerHash) {
          reject(new ProtocolError(0x05, refId, 'Data hash mismatch'));
          return;
        }
        resolve({ pointerId: refId, pointerHash, data });
      });
      this.addResponseListener(pointerId, Responses.ERROR, (refId: string, errorCode: number, errorMessage: string) => {
        this.removeAllFor(pointerId);
        reject(new ProtocolError(errorCode, refId, errorMessage));
      });

      if (!this.relayClient.send([Commands.REQUEST_DATA, pointerId])) {
        this.removeAllFor(pointerId);
        reject(new Error('Failed to send REQDATA message'));
      }
    }));
  }

  private handleMessages(messageType: string, message: unknown[]): void {
    if (!messageType || !message) {
      return;
    }
    switch (messageType) {
      case 'OK': {
        if (message.length === 3) {
          const referenceId = message[1] as string;
          const extra = message[2] as string;
          const listener = this.responseListeners.OK?.get(referenceId) as OkListener | undefined;
          listener?.(referenceId, extra);
        }
        break;
      }
      case 'ERROR': {
        if (message.length > 3) {
          const errorCode = message[1] as number;
          const referenceId = message[2] as string;
          const errorMessage = message[3] as string;
          if (referenceId && referenceId.length > 0) {
            const listener = this.responseListeners.ERROR?.get(referenceId) as ErrorListener | undefined;
            if (listener) {
              listener(referenceId, errorCode, errorMessage);
              return;
            }
          }
          this.catchAllErrorListener(errorCode, errorMessage);
        }
        break;
      }
      case 'POINTER': {
        if (message.length === 3) {
          const referenceId = message[1] as string;
          const pointerResults = message[2] as unknown[];
          const listener = this.responseListeners.POINTER?.get(referenceId) as PointerListener | undefined;
          listener?.(referenceId, pointerResults);
        }
        break;
      }
      case 'REQEND': {
        if (message.length === 2) {
          const referenceId = message[1] as string;
          const listener = this.responseListeners.REQEND?.get(referenceId) as ReqEndListener | undefined;
          listener?.(referenceId);
        }
        break;
      }
      case 'DATAOK': {
        if (message.length === 4) {
          const referenceId = message[1] as string;
          const pointerHash = message[2] as string;
          const base64Data = message[3] as string;
          const listener = this.responseListeners.DATAOK?.get(referenceId) as DataOkListener | undefined;
          listener?.(referenceId, pointerHash, base64Data);
        }
        break;
      }
    }
  }
}

export interface DerbyClientOptions extends RelayClientOptions {
  defaultTimeout?: number;
}

export class DerbyClient {
  readonly relayClient: RelayClient;
  private messageManager: MessageManager;

  constructor(relayURL: string, options: DerbyClientOptions = {}) {
    this.relayClient = new RelayClient(relayURL, options);
    this.messageManager = new MessageManager(this.relayClient, options.defaultTimeout);
  }

  get relayURL(): string {
    return this.relayClient.relayURL;
  }

  connect(): Promise<void> {
    return this.relayClient.connect();
  }

  close(): void {
    this.relayClient.close();
  }

  publishPointer(pointer: Pointer, data?: Uint8Array, opts: RequestOptions = {}): Promise<PublishResult> {
    return this.messageManager.publishPointer(pointer, data ? toBase64(data) : undefined, opts);
  }

  deletePointer(deletionPointer: Pointer, opts: RequestOptions = {}): Promise<DeleteResult> {
    return this.messageManager.deletePointer(deletionPointer, opts);
  }

  requestPointers(criteria: Record<string, unknown>, opts: RequestOptions = {}): Promise<Pointer[]> {
    return this.messageManager.requestPointers(criteria, opts);
  }

  requestData(pointerId: string, opts: RequestOptions = {}): Promise<DataResult> {
    return this.messageManager.requestData(pointerId, opts);
  }
}

export { MessageManager };

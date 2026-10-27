import { EventEmitter } from './event-emitter.js';
import { Responses } from './protocol.js';

// Isomorphic WebSocket: prefer globalThis.WebSocket (browser, Node >= 22),
// fall back to the `ws` package. A custom constructor can be injected.
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'error' | 'message' | 'close', listener: (event: any) => void): void;
}

export type WebSocketConstructor = new (url: string) => WebSocketLike;

async function defaultWebSocketConstructor(): Promise<WebSocketConstructor> {
  if (typeof globalThis.WebSocket === 'function') {
    return globalThis.WebSocket as unknown as WebSocketConstructor;
  }
  const wsModule = await import('ws');
  return wsModule.WebSocket as unknown as WebSocketConstructor;
}

export interface RelayClientOptions {
  WebSocketImpl?: WebSocketConstructor;
}

export class RelayClient extends EventEmitter {
  readonly relayURL: string;
  private wsClient?: WebSocketLike;
  private webSocketImpl?: WebSocketConstructor;

  constructor(url: string, options: RelayClientOptions = {}) {
    super();
    this.relayURL = url;
    this.webSocketImpl = options.WebSocketImpl;
  }

  async connect(): Promise<void> {
    if (!this.webSocketImpl) {
      this.webSocketImpl = await defaultWebSocketConstructor();
    }
    return new Promise<void>((resolve, reject) => {
      const ws = new this.webSocketImpl!(this.relayURL);
      this.wsClient = ws;

      let settled = false;
      ws.addEventListener('open', () => {
        settled = true;
        this.emit('connect');
        resolve();
      });
      ws.addEventListener('error', (event: any) => {
        const error = event instanceof Error ? event : new Error('WebSocket error on ' + this.relayURL);
        this.emit('error', error);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      ws.addEventListener('message', (event: any) => {
        this.handleMessages(event.data);
      });
      ws.addEventListener('close', () => {
        this.emit('close');
      });
    });
  }

  send(message: unknown[]): boolean {
    try {
      if (!this.wsClient) {
        throw new Error('Not connected');
      }
      this.wsClient.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.wsClient?.close();
  }

  private handleMessages(data: unknown): void {
    try {
      const messageJSON = JSON.parse(String(data));
      if (!Array.isArray(messageJSON) || messageJSON.length <= 1) {
        return;
      }
      switch (messageJSON[0]) {
        case Responses.OK:
          this.emit('OK', messageJSON);
          break;
        case Responses.DATA_OK:
          this.emit('DATAOK', messageJSON);
          break;
        case Responses.ERROR:
          this.emit('ERROR', messageJSON);
          break;
        case Responses.POINTER_RESPONSE:
          this.emit('POINTER', messageJSON);
          break;
        case Responses.REQUEST_POINTER_END:
          this.emit('REQEND', messageJSON);
          break;
        case Responses.NOTICE:
          this.emit('NOTICE', messageJSON);
          break;
      }
    } catch {
      // Ignore malformed frames; the protocol never uses non-JSON messages.
    }
  }
}

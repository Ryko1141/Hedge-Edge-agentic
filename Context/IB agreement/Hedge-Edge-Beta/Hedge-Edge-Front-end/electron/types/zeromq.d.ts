/**
 * Type declarations for zeromq
 * zeromq is an optional peer dependency that may not be installed
 */

declare module 'zeromq' {
  export class Subscriber {
    receiveTimeout: number;
    linger: number;
    connect(endpoint: string): void;
    subscribe(filter: string): void;
    close(): void;
    [Symbol.asyncIterator](): AsyncIterableIterator<[Buffer]>;
  }
  
  export class Request {
    sendTimeout: number;
    receiveTimeout: number;
    linger: number;
    connect(endpoint: string): void;
    send(message: string): Promise<void>;
    receive(): Promise<[Buffer]>;
    close(): void;
  }
  
  export class Publisher {
    linger: number;
    bind(endpoint: string): Promise<void>;
    send(message: string | Buffer): Promise<void>;
    close(): void;
  }
  
  export class Reply {
    linger: number;
    receiveTimeout: number;
    sendTimeout: number;
    bind(endpoint: string): Promise<void>;
    receive(): Promise<[Buffer]>;
    send(message: string | Buffer): Promise<void>;
    close(): void;
  }
}

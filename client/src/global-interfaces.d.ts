import * as monaco from 'monaco-editor';


declare global {
  interface Array<T> {
    at(index: number): T;
  }

  interface Crypto {
    randomUUID(): string;
  }

  interface Window {
    MonacoEnvironment?: monaco.Environment | undefined;
  }
}

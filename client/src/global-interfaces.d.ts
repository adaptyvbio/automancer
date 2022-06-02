import * as monaco from 'monaco-editor';


declare global {
  interface Crypto {
    randomUUID(): string;
  }

  interface Window {
    MonacoEnvironment?: monaco.Environment | undefined;
  }
}

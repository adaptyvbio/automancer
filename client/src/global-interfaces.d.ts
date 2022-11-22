import * as monaco from 'monaco-editor';


declare global {
  interface Array<T> {
    at(index: number): T;
  }

  interface Crypto {
    randomUUID(): string;
  }

  interface Document {
    adoptedStyleSheets: CSSStyleSheet[];
  }

  interface Element {
    computedStyleMap(): StylePropertyMapReadOnly;
  }

  interface Window {
    MonacoEnvironment?: monaco.Environment | undefined;
  }

  const CSSNumericValue: any;
}

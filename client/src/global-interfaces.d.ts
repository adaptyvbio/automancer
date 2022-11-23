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
    computedStyleMap(): {
      get(property: string): { toString(): string; };
    };
  }

  interface Window {
    MonacoEnvironment?: monaco.Environment | undefined;
  }

  class CSSNumericValue {
    unit: string;
    value: number;

    static parse(cssText: string): CSSNumericValue;
  }
}

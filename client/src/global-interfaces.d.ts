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
      get(property: string): CSSUnparsedValue;
    };
  }

  interface Window {
    readonly api: any;
    MonacoEnvironment?: monaco.Environment | undefined;
  }

  class CSSNumericValue {
    unit: string;
    value: number;

    static parse(cssText: CSSUnparsedValue | string): CSSNumericValue;
  }

  class CSSUnparsedValue {
    toString(): string;
  }
}

import * as monaco from 'monaco-editor';


declare global {
  const navigation: any;

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

  interface Keyboard {
    getLayoutMap(): Promise<KeyboardLayoutMap>;
  }

  interface KeyboardLayoutMap {
    get(code: string): string | undefined;
  }

  interface Navigator {
    keyboard: Keyboard;
  }

  interface Window {
    MonacoEnvironment?: monaco.Environment | undefined;
  }

  namespace CSS {
    function number(value: number): any;
  }

  class CSSNumericValue {
    unit: string;
    value: number;

    static parse(cssText: CSSUnparsedValue | string): CSSNumericValue;
  }

  class CSSUnparsedValue {
    toString(): string;
  }

  class URLPattern {
    constructor(options: any): URLPattern;
    exec(input: any): any;
  }
}

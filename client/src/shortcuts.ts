import { OrderedSet } from 'immutable';


// @ts-expect-error
export const IS_MAC = (navigator.userAgentData.platform === 'macOS');

export const KEY_CODE_MAP: Record<string, string> = {
  'Digit0': '0',
  'Digit1': '1',
  'Digit2': '2',
  'Digit3': '3',
  'Digit4': '4',
  'Digit5': '5',
  'Digit6': '6',
  'Digit7': '7',
  'Digit8': '8',
  'Digit9': '9',
};


export interface ShortcutProperties {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface ShortcutItem extends ShortcutProperties {
  listener(event: KeyboardEvent, properties: ShortcutProperties): boolean | void;
}


export type ShortcutCodeKeyDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type ShortcutCodeKeyLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';
export type ShortcutCodeKeySpecial = 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'Backspace' | 'Delete' | 'Enter' | 'Escape' | 'Home' | 'PageDown' | 'PageUp' | 'Tab';
export type ShortcutCodeKey = ShortcutCodeKeyDigit | ShortcutCodeKeyLetter | ShortcutCodeKeySpecial;

export type ShortcutCode = `${'Alt+' | ''}${'Meta+' | ''}${'Shift+' | ''}${ShortcutCodeKey}`;


export class ShortcutManager {
  private shortcutItems = OrderedSet<ShortcutItem>();

  async listen(target: HTMLElement = document.body, options: { signal: AbortSignal; }) {
    let layoutMap = await navigator.keyboard.getLayoutMap();

    target.addEventListener('keydown', (event) => {
      if (event.composedPath().some((element) => (element instanceof HTMLDialogElement))) {
        return;
      }

      let key: string;
      let keySymbol = layoutMap.get(event.code);

      if (keySymbol && /^[a-z]$/.test(keySymbol)) {
        key = keySymbol.toUpperCase();
      } else {
        key = KEY_CODE_MAP[event.code] ?? event.code;
      }

      let properties: ShortcutProperties = {
        altKey: event.altKey,
        ctrlKey: (IS_MAC && event.ctrlKey),
        key,
        metaKey: (IS_MAC ? event.metaKey : event.ctrlKey),
        shiftKey: event.shiftKey
      };

      for (let item of this.shortcutItems.reverse()) {
        if (
          (item.altKey === properties.altKey) &&
          (item.ctrlKey === properties.ctrlKey) &&
          (item.key === properties.key) &&
          (item.metaKey === properties.metaKey) &&
          (item.shiftKey === properties.shiftKey)
        ) {
          let result = item.listener(event, properties);

          if (result || (result === undefined)) {
            event.preventDefault();
            event.stopImmediatePropagation();

            break;
          }
        }
      }
    }, { signal: options.signal });
  }

  attach(codes: ShortcutCode[] | ShortcutCode, listener: ShortcutItem['listener'], options: { signal: AbortSignal; }) {
    let items = (Array.isArray(codes) ? codes : [codes]).map((code) => {
      let segments = code.split('+');

      return {
        altKey: segments.includes('Alt'),
        ctrlKey: segments.includes('Ctrl'),
        key: segments.at(-1)!,
        metaKey: segments.includes('Meta'),
        shiftKey: segments.includes('Shift'),

        listener
      };
    });

    this.shortcutItems = this.shortcutItems.union(items);

    options.signal.addEventListener('abort', () => {
      this.shortcutItems = this.shortcutItems.subtract(items);
    });
  }
}

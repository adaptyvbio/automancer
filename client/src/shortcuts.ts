import { OrderedSet } from 'immutable';


// @ts-expect-error
export const IS_MAC = (navigator.userAgentData.platform === 'macOS');

export const KEY_CODE_MAP: Record<string, string> = {
  ' ': 'Space'
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


export class ShortcutManager {
  private shortcutItems = OrderedSet<ShortcutItem>();

  listen(target: HTMLElement = document.body, options: { signal: AbortSignal; }) {
    target.addEventListener('keydown', (event) => {
      if (event.composedPath().some((element) => (element instanceof HTMLDialogElement))) {
        return;
      }

      let key = KEY_CODE_MAP[event.key] ?? event.key;
      key = (key.length === 1) ? key.toUpperCase() : key;

      let properties: ShortcutProperties = {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
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

  attach(codes: string[] | string, listener: ShortcutItem['listener'], options: { signal: AbortSignal; }) {
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

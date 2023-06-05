import { Fragment, PropsWithChildren, useContext, useEffect } from 'react';

import styles from '../../styles/components/shortcut-guide.module.scss';

import { ApplicationStoreContext } from '../contexts';
import { ShortcutDisplayMode } from '../store/application';
import { IS_MAC } from '../shortcuts';


// const IS_MAC = navigator.platform.startsWith('Mac');

const KEY_DISPLAY_MAP: Record<string, string> = {
  'Alt': (IS_MAC ? '⌥' : 'Alt'),
  'ArrowDown': '↓',
  'ArrowLeft': '←',
  'ArrowRight': '→',
  'ArrowUp': '↑',
  'Backspace': '⌫',
  'Enter': '↵',
  'Escape': 'Esc',
  'Meta': (IS_MAC ? '⌘' : 'Ctrl'),
  'Shift': '⇧',
  'Space': '␣',
  'Tab': '↹'
};

const KEY_DISPLAY_MAP_ADVANCED: Record<string, string> = {
  ...KEY_DISPLAY_MAP,
  'Alt': '⌥',
  'Ctrl': '⎈',
  'Escape': '⎋',
  'Meta': (IS_MAC ? '⌘' : '⎈')
}

const KEY_CODE_MAP: Record<string, string> = {
  'Space': ' '
};


export function ShortcutGuide(props: PropsWithChildren<{
  onTrigger?(): void; // @deprecated
  shortcut: string | null;
}>) {
  let store = useContext(ApplicationStoreContext);
  let [shortcutDisplayMode, _setShortcutDisplayMode] = store.usePersistent('general.shortcutDisplayMode');

  let displayShortcuts = true;
  let shortcutSegments = props.shortcut?.split('+');

  useEffect(() => {
    if (props.shortcut && props.onTrigger) {
      let controller = new AbortController();
      let segments = shortcutSegments!;

      let rawTargetKey = segments.at(-1)!.toLowerCase();
      let targetKey = KEY_CODE_MAP[rawTargetKey] ?? rawTargetKey;

      document.body.addEventListener('keydown', (event) => {
        if (
          (
            (event.target === event.currentTarget) ||
            (
              (event.target instanceof HTMLElement) &&
              (event.target.getAttribute('tabIndex') === '-1')
            )
          ) &&
          (segments.includes('Alt') === event.altKey) &&
          (segments.includes('Meta') === (IS_MAC ? event.metaKey : event.ctrlKey)) &&
          (segments.includes('Shift') === event.shiftKey) &&
          (event.key.toLowerCase() === targetKey)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();

          props.onTrigger!();
        }
      }, { signal: controller.signal });

      return () => void controller.abort();
    }

    return undefined;
  }, [props.onTrigger, props.shortcut]);

  return (
    <div className={styles.root}>
      {props.children}
      {displayShortcuts && shortcutSegments && (shortcutDisplayMode !== ShortcutDisplayMode.Disabled) && (() => {
        let keyDisplayMap = (shortcutDisplayMode === ShortcutDisplayMode.Symbols)
          ? KEY_DISPLAY_MAP_ADVANCED
          : KEY_DISPLAY_MAP;

        let rawKeySegment = shortcutSegments.at(-1)!;
        let keySegment = keyDisplayMap[rawKeySegment] ?? rawKeySegment;

        let displayedSegments = [
          ...['Alt', 'Meta', 'Shift']
            .filter((modifier) => shortcutSegments!.includes(modifier))
            .map((modifier) => keyDisplayMap[modifier]),
          keySegment
        ];

        return (
          <div className={styles.shortcut}>
            {displayedSegments.map((segment, index) => {
              let last = index === (displayedSegments.length - 1);
              return (
                <Fragment key={index}>
                  <kbd>{segment}</kbd>
                  {!last && <>&thinsp;+&thinsp;</>}
                </Fragment>
              );
            })}
          </div>
        );
      })()}
    </div>
  )
}

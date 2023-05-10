import * as React from 'react';
import { Fragment, useEffect } from 'react';

import formStyles from '../../styles/components/form.module.scss';

import * as util from '../util';


// @ts-expect-error
const IS_MAC = (navigator.userAgentData.platform === 'macOS');


const KEY_DISPLAY_MAP: Record<string, string> = {
  'Alt': '⌥',
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
  'Ctrl': '⎈',
  'Escape': '⎋',
  'Meta': (IS_MAC ? '⌘' : '⎈')
}

const KEY_CODE_MAP: Record<string, string> = {
  'Space': ' '
};


// const isMac = navigator.platform.startsWith('Mac');

export function Button(props: React.PropsWithChildren<{
  className?: string;
  onClick?(): void;
  shortcut?: string;
}>) {
  let displayShortcuts = true;
  let shortcutSegments = props.shortcut?.split('+');

  useEffect(() => {
    if (props.shortcut) {
      let controller = new AbortController();
      let segments = shortcutSegments!;

      let rawTargetKey = segments.at(-1).toLowerCase();
      let targetKey = KEY_CODE_MAP[rawTargetKey] ?? rawTargetKey;

      document.body.addEventListener('keydown', (event) => {
        if (
          (!segments.includes('Alt') || event.altKey) &&
          (!segments.includes('Meta') || !IS_MAC || event.metaKey) &&
          (!segments.includes('Meta') || IS_MAC || event.ctrlKey) &&
          (!segments.includes('Shift') || event.shiftKey) &&
          (event.key.toLowerCase() === targetKey)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();

          props.onClick?.();
        }
      }, { signal: controller.signal });

      return () => void controller.abort();
    }
  }, [props.onClick, props.shortcut]);

  return (
    <button
      type="button"
      className={util.formatClass(formStyles.btn, props.className)}
      onClick={props.onClick}>
      <div>{props.children}</div>
      {displayShortcuts && shortcutSegments && (() => {
        let rawKeySegment = shortcutSegments.at(-1);
        let keySegment = KEY_DISPLAY_MAP[rawKeySegment] ?? rawKeySegment;

        let displayedSegments = [
          ...['Alt', 'Meta', 'Shift']
            .filter((modifier) => shortcutSegments!.includes(modifier))
            .map((modifier) => KEY_DISPLAY_MAP[modifier]),
          keySegment
        ];

        return (
          <div>
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
    </button>
  )
}

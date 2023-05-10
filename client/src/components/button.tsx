import * as React from 'react';
import { Fragment, useEffect } from 'react';

import formStyles from '../../styles/components/form.module.scss';

import * as util from '../util';


// const isMac = navigator.platform.startsWith('Mac');

// @ts-expect-error
const isMac = (navigator.userAgentData.platform === 'macOS');

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

      document.body.addEventListener('keydown', (event) => {
        event.stopImmediatePropagation();

        if (
          (!segments.includes('Meta') || !isMac || event.metaKey) &&
          (!segments.includes('Meta') || isMac || event.ctrlKey) &&
          (!segments.includes('Shift') || event.shiftKey) &&
          (event.key.toLowerCase() === segments.at(-1).toLowerCase())
        ) {
          event.preventDefault();
          props.onClick?.();
        }
      }, { signal: controller.signal });

      return () => void controller.abort();
    }
  }, [props.shortcut]);

  return (
    <button
      type="button"
      className={util.formatClass(formStyles.btn, props.className)}
      onClick={props.onClick}>
      <div>{props.children}</div>
      {displayShortcuts && shortcutSegments && (() => {
        let displayedSegments = [
          ...(shortcutSegments.includes('Meta')
            ? [isMac ? '⌘' : 'Ctrl']
            : []),
          ...(shortcutSegments.includes('Shift')
            ? ['⇧']
            : []),
          shortcutSegments.at(-1)
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

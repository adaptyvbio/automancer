import * as React from 'react';

import formStyles from '../../styles/components/form.module.scss';

import * as util from '../util';
import { ShortcutGuide } from './shortcut-guide';


export function Button(props: React.PropsWithChildren<{
  className?: string;
  onClick(): void;
  shortcut?: string | null;
}>) {
  return (
    <button
      type="button"
      className={util.formatClass(formStyles.btn, props.className)}
      onClick={props.onClick}>
      <ShortcutGuide
        onTrigger={props.onClick}
        shortcut={props.shortcut ?? null}>
        {props.children}
      </ShortcutGuide>
    </button>
  )
}

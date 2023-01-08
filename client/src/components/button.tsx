import * as React from 'react';

import * as util from '../util';

import formStyles from '../../styles/components/form.module.scss';


export function Button(props: React.PropsWithChildren<{
  className?: string;
  onClick?(): void;
}>) {
  return (
    <button
      type="button"
      className={util.formatClass(formStyles.btn, props.className)}
      onClick={props.onClick}>{props.children}</button>
  )
}

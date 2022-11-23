import * as React from 'react';

import formStyles from '../../styles/components/form.module.scss';


export function Button(props: React.PropsWithChildren<{
  onClick?(): void;
}>) {
  return (
    <button
      type="button"
      className={formStyles.btn}
      onClick={props.onClick}>{props.children}</button>
  )
}

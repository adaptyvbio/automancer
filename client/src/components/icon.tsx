import * as React from 'react';

import * as util from '../util';


export const Icon = React.memo(function Icon(props: { name: string; style?: string; }) {
  let disabled = props.name[0] === '-';
  let name = disabled
    ? props.name.substring(1)
    : props.name;

  return (
    <span className={util.formatClass(
      `material-symbols-${props.style ?? 'rounded'} icon`,
      { '_disabled': disabled }
    )}>{name}</span>
  );
});

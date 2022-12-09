import * as React from 'react';

import * as util from '../util';


export const Icon = React.memo(function Icon(props: {
  className?: string;
  name: string;
  style?: string;
  title?: string;
}) {
  let disabled = props.name[0] === '-';
  let name = disabled
    ? props.name.substring(1)
    : props.name;

  return (
    <span
      className={util.formatClass(
        `material-symbols-${props.style ?? 'rounded'}`,
        props.className ?? 'icon',
        { '_disabled': disabled }
      )}
      style={{ userSelect: 'none' }}
      title={props.title}>
      {name}
    </span>
  );
});

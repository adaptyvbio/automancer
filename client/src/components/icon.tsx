import * as React from 'react';


export const Icon = React.memo(function Icon(props: { name: string; style?: string; }) {
  return (
    <span className={`material-symbols-${props.style ?? 'rounded'} icon`}>{props.name}</span>
  );
});

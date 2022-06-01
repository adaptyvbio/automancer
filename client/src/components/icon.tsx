import * as React from 'react';


export const Icon = React.memo(function Icon(props: { name: string; }) {
  return (
    <span className="material-symbols-rounded">{props.name}</span>
  );
});

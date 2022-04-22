import * as React from 'react';


export function BlankState(props: {
  action?: {
    label: string;
    onTrigger(): void;
  };
  message: string;
}) {
  return (
    <div className="view-blank-root">
      <div className="view-blank-container">
        <div className="view-blank-title">{props.message}</div>
        {props.action && (
          <button type="button" className="view-blank-action" onClick={() => {
            props.action!.onTrigger();
          }}>{props.action.label}</button>
        )}
      </div>
    </div>
  );
}

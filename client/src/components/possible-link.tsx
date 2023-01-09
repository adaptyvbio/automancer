import React from 'react';


export function PossibleLink(props: React.PropsWithChildren<
  ({ kind: 'anchor'; } & React.AnchorHTMLAttributes<HTMLAnchorElement>) |
  ({ kind: 'button'; } & React.ButtonHTMLAttributes<HTMLButtonElement>) |
  ({ kind: 'div'; } & React.HTMLAttributes<HTMLDivElement>)
>) {
  switch (props.kind) {
    case 'anchor': {
      let { children, kind, ...other } = props;
      return <a {...other}>{children}</a>;
    }

    case 'button': {
      let { children, kind, ...other } = props;
      return <button type="button" {...other}>{children}</button>;
    }

    case 'div': {
      let { children, kind, ...other } = props;
      return <div {...other}>{children}</div>;
    }
  }
}

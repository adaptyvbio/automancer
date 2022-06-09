import * as React from 'react';
import { Application } from '../application';

import { ContextMenu, MenuDef, MenuEntryPath } from './context-menu';


export type ContextMenuAreaProps = React.PropsWithChildren<{
  createMenu(event: React.MouseEvent): MenuDef;
  onSelect(path: MenuEntryPath): void;
}>;

export function ContextMenuArea(props: ContextMenuAreaProps) {
  let childRef = React.useRef<HTMLElement>(null);
  let formerFocusRef = React.useRef<Element | null>(null);
  let triggerRef = React.useRef<any>(null);

  React.useEffect(() => {
    childRef.current!.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      (event.currentTarget as HTMLElement).classList.add('_context');

      formerFocusRef.current = document.activeElement;
      triggerRef.current(event);
    });
  }, []);

  let child = props.children as any;

  return (
    <>
      {React.cloneElement(child, {
        ref: (ref: HTMLElement) => {
          (childRef as any).current = ref;

          if (typeof child.ref === 'function') {
            child.ref(ref);
          }
        }
      })}
      <ContextMenu
        createMenu={props.createMenu}
        onClose={(selected) => {
          childRef.current!.classList.remove('_context');

          if (formerFocusRef.current instanceof HTMLElement) {
            formerFocusRef.current.focus();
          }
        }}
        onSelect={props.onSelect}
        triggerRef={triggerRef} />
    </>
  )
}

/* export function _ContextMenuArea(props: ContextMenuAreaProps) {
  return (
    <ApplicationContext.Consumer>
      {(app) => (
        <ContextMenuAreaRaw
          children={props.children}
          onContextMenu={async (event) => {
            await app.showContextMenu(event, props.createMenu(), props.onSelect);
          }} />
      )}
    </ApplicationContext.Consumer>
  );
}


export type ContextMenuAreaRawProps = React.PropsWithChildren<{
  onContextMenu(event: MouseEvent): Promise<void>;
}>;

export class ContextMenuAreaRaw extends React.Component<ContextMenuAreaRawProps> { // (props: React.PropsWithChildren<{}>) {
  childRef = React.createRef<HTMLElement>();

  componentDidMount() {
    let el = this.childRef.current!;

    el.addEventListener('contextmenu', (event) => {
      event.preventDefault();

      el.classList.add('_context');

      this.props.onContextMenu(event).finally(() => {
        el.classList.remove('_context');
      });
    });
  }

  render() {
    return React.cloneElement(this.props.children as React.ReactElement, {
      ref: (ref: HTMLElement) => ((this.childRef as any).current = ref)
    });
  }
} */

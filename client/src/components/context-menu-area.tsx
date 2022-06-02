import * as React from 'react';
import { Application } from '../application';

import { ApplicationContext } from '../contexts';
import { ContextMenu, MenuDef, MenuEntryPath } from './context-menu';


export type ContextMenuAreaProps = React.PropsWithChildren<{
  createMenu(): MenuDef;
  onSelect(path: MenuEntryPath): void;
}>;

export function ContextMenuArea(props: ContextMenuAreaProps) {
  let childRef = React.useRef<HTMLElement>(null);
  let triggerRef = React.useRef<any>(null);

  React.useEffect(() => {
    childRef.current!.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      (event.currentTarget as HTMLElement).classList.add('_context');

      triggerRef.current(event);
    });
  }, []);

  return (
    <>
      {React.cloneElement(props.children as React.ReactElement, {
        ref: (ref: HTMLElement) => ((childRef as any).current = ref)
      })}
      <ContextMenu
        createMenu={props.createMenu}
        onClose={(selected) => {
          childRef.current!.classList.remove('_context');
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

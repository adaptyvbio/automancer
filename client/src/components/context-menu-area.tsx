import { List } from 'immutable';
import * as React from 'react';
import { Application } from '../application';

import { ContextMenu as DefaultContextMenu, ContextMenuProps, MenuDef, MenuEntryPath } from './context-menu';
import { ContextMenuContext } from '../contexts';


export type ContextMenuComponent = React.ComponentType<ContextMenuProps>;


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
      <ContextMenuContext.Consumer>
        {(ReplacedContextMenu) => {
          let ContextMenu = ReplacedContextMenu ?? DefaultContextMenu;

          return (
            <ContextMenu
              createMenu={props.createMenu}
              onClose={(_selected) => {
                childRef.current!.classList.remove('_context');

                if (formerFocusRef.current instanceof HTMLElement) {
                  formerFocusRef.current.focus();
                }
              }}
              onSelect={(path) => props.onSelect(List(path))}
              triggerRef={triggerRef} />
          );
        }}
      </ContextMenuContext.Consumer>

      {React.cloneElement(child, {
        ref: (ref: HTMLElement) => {
          (childRef as any).current = ref;

          if (typeof child.ref === 'function') {
            child.ref(ref);
          }
        }
      })}
    </>
  )
}

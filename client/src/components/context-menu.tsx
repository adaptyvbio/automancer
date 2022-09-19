import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions
} from '@floating-ui/react-dom-interactions';
import { List } from 'immutable';
import * as React from 'react';
import mergeRefs from 'react-merge-refs';

import { Icon } from './icon';
import * as util from '../util';


export interface MenuOption {
  id: MenuEntryId;
  type?: 'option';

  children?: MenuList;
  disabled?: unknown;
  icon?: string;
  name: string;
  selected?: unknown;
  shortcut?: string;
  modifiers?: MenuModifiers;

  // TODO: Add title
  // title?: string;
}

export type MenuEntry =
    MenuOption
  | { id: MenuEntryId; type: 'divider'; }
  | { id: MenuEntryId; type: 'header'; name: string; };

export type MenuEntryId = number | string;
export type MenuEntryPath = List<MenuEntryId>;
export type MenuEntryPathLike = Iterable<MenuEntryId>;

export type MenuList = MenuEntry[];
export type MenuDef = MenuList;

export type MenuModifiers = Record<string, boolean>;


export const ContextMenu = React.forwardRef(function ContextMenu(props: {
  createMenu(event: React.MouseEvent): MenuDef;
  onClose(selected: boolean): void;
  onSelect(path: MenuEntryPath): void;
  triggerRef: React.MutableRefObject<(event: React.MouseEvent) => void>;
}, ref) {
  let [menu, setMenu] = React.useState<MenuDef | null>(null);
  let open = (menu !== null);

  let {
    x,
    y,
    reference,
    floating,
    strategy,
    refs,
    update,
    context
  } = useFloating({
    open,
    onOpenChange: (newOpen) => {
      if (!newOpen) {
        props.onClose(false);
        setMenu(null);
      }
    },
    middleware: [
      offset({ mainAxis: 5, alignmentAxis: 4 }),
      flip(),
      shift()
    ],
    placement: 'right-start'
  });

  let { getFloatingProps, getItemProps } = useInteractions([
    // useRole(context, { role: "menu" }),
    useDismiss(context),
    // useListNavigation(context, {
    //   listRef: listItemsRef,
    //   activeIndex,
    //   onNavigate: setActiveIndex,
    //   focusItemOnOpen: false
    // }),
    // useTypeahead(context, {
    //   enabled: open,
    //   listRef: listContentRef,
    //   onMatch: setActiveIndex,
    //   activeIndex
    // })
  ]);

  React.useEffect(() => {
    if (open && refs.reference.current && refs.floating.current) {
      return autoUpdate(
        refs.reference.current,
        refs.floating.current,
        update
      );
    }
  }, [open, update, refs.reference, refs.floating]);


  let mergedReferenceRef = React.useMemo(() => mergeRefs([ref, reference]), [reference, ref]);

  // if (props.context) {
  //   let { x, y } = props.context.origin;

  //   mergedReferenceRef({
  //     getBoundingClientRect() {
  //       return {
  //         x,
  //         y,
  //         width: 0,
  //         height: 0,
  //         top: y,
  //         right: x,
  //         bottom: y,
  //         left: x
  //       };
  //     }
  //   });

  //   setOpen(true);
  // }

  props.triggerRef.current = (event) => {
    event.preventDefault();

    mergedReferenceRef({
      getBoundingClientRect() {
        return {
          x: event.clientX,
          y: event.clientY,
          width: 0,
          height: 0,
          top: event.clientY,
          right: event.clientX,
          bottom: event.clientY,
          left: event.clientX
        };
      }
    });

    // setOpen(true);
    setMenu(props.createMenu(event));
  };

  // React.useEffect(() => {
  //   let controller = new AbortController();

  //   return () => {
  //     controller.abort();
  //   };
  // }, [mergedReferenceRef]);

  React.useLayoutEffect(() => {
    if (open) {
      refs.floating.current?.focus();
    }
  }, [open, refs.floating]);

  // let entries: MenuList = [
  //   { id: '_header',
  //     name: 'Clipboard',
  //     type: 'header' },
  //   { id: 'copy',
  //     name: 'Copy',
  //     icon: 'content_copy' },
  //   { id: 'paste',
  //     name: 'Paste',
  //     icon: 'content_paste' }
  // ];

  return (
    <FloatingPortal>
      {open && (
        <FloatingOverlay lockScroll>
          <FloatingFocusManager context={context} preventTabbing>
            <ul
              {...getFloatingProps({
                className: 'cmenu-root',
                ref: floating,
                style: {
                  position: strategy,
                  top: y ?? '',
                  left: x ?? ''
                }
              })}>
              {menu!.map((entry) => {
                switch (entry.type) {
                  case 'divider': {
                    return (
                      <li className="cmenu-divider" key={entry.id} />
                    );
                  }

                  case 'header': {
                    return (
                      <li className="cmenu-header" key={entry.id}>{entry.name}</li>
                    );
                  }

                  case undefined:
                  case 'option': {
                    return (
                      <li className="cmenu-x" key={entry.id}>
                        <button type="button"
                          disabled={!!entry.disabled}
                          className={util.formatClass('cmenu-item', {
                            '_open': false
                          })}
                          onClick={(!entry.children || undefined) && (() => {
                            props.onSelect(List([entry.id]));
                            props.onClose(true);
                            setMenu(null);
                          })}>

                          {entry.icon && <div className="cmenu-icon"><Icon name={entry.icon} style="sharp" /></div>}
                          <div className="cmenu-name">{entry.name}</div>
                          {entry.shortcut && <div className="cmenu-shortcut">{entry.shortcut}</div>}
                          {entry.children && <div className="cmenu-chevron"><Icon name="chevron_right" /></div>}
                          {entry.selected && <div className="cmenu-chevron"><Icon name="check" /></div>}
                        </button>
                      </li>
                    );
                  }
                }
              })}
            </ul>
          </FloatingFocusManager>
        </FloatingOverlay>
      )}
    </FloatingPortal>
  );
});

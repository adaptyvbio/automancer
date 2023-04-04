import { ContextMenuContext, ContextMenuProps, React } from 'pr1';


export class NativeContextMenu extends React.Component<ContextMenuProps> {
  constructor(props: ContextMenuProps) {
    super(props);

    this.props.triggerRef.current = (event) => {
      let menu = this.props.createMenu(event);
      let position = {
        x: event.clientX,
        y: event.clientY
      };

      window.api.main.triggerContextMenu(menu, position).then((selectedPath) => {
        if (selectedPath !== null) {
          this.props.onSelect(selectedPath);
        }

        this.props.onClose(selectedPath !== null);
      });
    };
  }

  override render() {
    return null;
  }
}

export function NativeContextMenuProvider(props: React.PropsWithChildren<{}>) {
  return (
    <ContextMenuContext.Provider value={NativeContextMenu}>
      {props.children}
    </ContextMenuContext.Provider>
  );
}

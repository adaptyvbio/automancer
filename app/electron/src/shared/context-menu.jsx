import { ContextMenuContext, React } from 'pr1';


export class NativeContextMenu extends React.Component {
  constructor(props) {
    super(props);

    this.props.triggerRef.current = (event) => {
      let menu = this.props.createMenu(event);
      let position = {
        x: event.clientX,
        y: event.clientY
      };

      window.api.main.triggerContextMenu(menu, position).then((selectedPath) => {
        this.props.onSelect(selectedPath);
        this.props.onClose(selectedPath !== null);
      });
    };
  }

  render() {
    return null;
  }
}

export function NativeContextMenuProvider(props) {
  return (
    <ContextMenuContext.Provider value={NativeContextMenu}>
      {props.children}
    </ContextMenuContext.Provider>
  );
}

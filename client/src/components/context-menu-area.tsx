import * as React from 'react';


type ContextMenuAreaProps = React.PropsWithChildren<{
  onContextMenu(event: MouseEvent): Promise<void>;
}>;

export class ContextMenuArea extends React.Component<ContextMenuAreaProps> { // (props: React.PropsWithChildren<{}>) {
  childRef = React.createRef<HTMLElement>();

  componentDidMount() {
    let el = this.childRef.current!;

    el.addEventListener('contextmenu', (event) => {
      el.classList.add('_context');

      event.preventDefault();
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
}

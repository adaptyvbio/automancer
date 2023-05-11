import * as React from 'react';
import * as ReactDOM from 'react-dom';

import styles from '../../styles/components/modal.module.scss';


export type ModalProps = React.PropsWithChildren<{
  onCancel(): void;
}>;

export interface ModalState {

}

export class Modal extends React.Component<ModalProps, ModalState> {
  refDialog = React.createRef<HTMLDialogElement>();

  constructor(props: ModalProps) {
    super(props);

    this.state = {};
  }

  componentDidMount() {
    this.refDialog.current!.showModal();
  }

  render() {
    return (
      ReactDOM.createPortal((
        <dialog
          className={styles.root}
          ref={this.refDialog}
          onCancel={this.props.onCancel}
          onClick={(event) => {
            if (event.currentTarget === event.target) {
              this.props.onCancel();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
            }
          }}>
          <div className={styles.container}>
            {this.props.children}
          </div>
        </dialog>
      ), document.body)
    );
  }
}

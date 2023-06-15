import { createPortal } from 'react-dom';

import styles from '../../styles/components/modal.module.scss';

import { Component, createRef } from 'react';


export type ModalProps = React.PropsWithChildren<{
  onCancel(): void;
}>;

export interface ModalState {

}

export class Modal extends Component<ModalProps, ModalState> {
  private refDialog = createRef<HTMLDialogElement>();

  constructor(props: ModalProps) {
    super(props);

    this.state = {};
  }

  override componentDidMount() {
    this.refDialog.current!.showModal();
  }

  override render() {
    return (
      createPortal((
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

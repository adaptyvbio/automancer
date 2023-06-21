import { useEffect } from 'react';
import descriptionStyles from '../../../styles/components/description.module.scss';

import { Modal } from '../modal';
import * as Form from '../standard-form';


export function EditProtocolModal(props: {
  onCancel(): void;
  onSubmit(mode: 'copy' | 'original'): void;
  originalAvailable: unknown;
}) {
  return (
    <Modal onCancel={props.onCancel}>
      <form className={descriptionStyles.root} onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit('original');
      }}>
        <h2>Edit protocol</h2>

        <p>Do you wish to edit the original files used in this protocol or to edit a copy?</p>

        <Form.Actions mode="both">
          <div>
            <Form.Action label="Cancel" shortcut="Escape" onClick={props.onCancel} />
          </div>
          <div>
            <Form.Action label="Edit copy" disabled={true} onClick={() => void props.onSubmit('copy')} />
            {!!props.originalAvailable && (
              <Form.Action label="Edit original files" type="submit" autoFocus={true} />
            )}
          </div>
        </Form.Actions>
      </form>
    </Modal>
  )
}

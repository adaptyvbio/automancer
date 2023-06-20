import { FormEvent, useCallback } from 'react';

import descriptionStyles from '../../../styles/components/description.module.scss';

import { Modal } from '../modal';
import * as Form from '../standard-form';


export function UnsavedDocumentModal(props: {
  onFinish(result: 'cancel' | 'ignore' | 'save'): void;
}) {
  let onCancel = useCallback(() => void props.onFinish('cancel'), [props.onFinish]);

  return (
    <Modal onCancel={onCancel}>
      <form className={descriptionStyles.root} onSubmit={(event) => {
        event.preventDefault();
        props.onFinish('save');
      }}>
        <h2>Unsaved changes</h2>

        <p>Some files have unsaved changes.</p>

        <Form.Actions mode="modal">
          <Form.Action label="Cancel" shortcut="Escape" onClick={onCancel} />
          <Form.Action label="Ignore changes" onClick={() => void props.onFinish('ignore')} />
          <Form.Action label="Save changes" type="submit" />
        </Form.Actions>
      </form>
    </Modal>
  )
}

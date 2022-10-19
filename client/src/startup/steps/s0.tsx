import * as React from 'react';

import * as Form from '../../components/standard-form';
import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


export interface Data extends HostCreatorStepData {
  address: string;
  port: string;

  stepIndex: 0;
}

export function Component(props: HostCreatorStepProps<Data>) {
  let firstInputRef = React.createRef<HTMLSelectElement>();

  React.useEffect(() => {
    firstInputRef.current!.focus();
  }, []);

  return (
    <form className="startup-editor-contents" onSubmit={(event) => {
      event.preventDefault();

      props.setData({
        stepIndex: 1,
        options: {
          type: 'remote',
          auth: null,
          address: props.data.address,
          port: parseInt(props.data.port),
          secure: false
        },
        rawOptions: {
          address: props.data.address,
          port: props.data.port
        },
        rawPassword: null
      });
    }}>
      <div className="startup-editor-inner">
        <header className="startup-editor-header">
          <div className="startup-editor-subtitle">New setup</div>
          <h2>Set connection parameters</h2>
        </header>
        <Form.Form>
          <Form.Select
            label="Protocol"
            onInput={(_id) => { }}
            options={[
              { id: 'websocket', label: 'Insecure WebSocket' }
            ]}
            value="websocket"
            targetRef={firstInputRef} />
          <Form.TextField
            label="Address"
            onInput={(address) => void props.setData({ ...props.data, address })}
            placeholder="e.g. 192.168.1.143"
            value={props.data.address} />
          <Form.TextField
            label="Port"
            onInput={(port) => void props.setData({ ...props.data, port })}
            placeholder="e.g. 4567"
            value={props.data.port} />
        </Form.Form>
      </div>

      <div className="startup-editor-action-root">
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={
            () => void props.setData({ stepIndex: 4, mode: 'remote' })
          }>Back</button>
        </div>
        <div className="startup-editor-action-list">
          <button type="submit" className="startup-editor-action-item">Next</button>
        </div>
      </div>
    </form>
  );
}

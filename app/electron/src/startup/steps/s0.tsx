//* Enter remote host settings

import { Form, React } from 'pr1';
import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


export interface Data extends HostCreatorStepData {
  stepIndex: 0;

  hostname: string;
  port: string;
  secure: boolean;
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
          fingerprint: null,
          hostname: props.data.hostname,
          identifier: null,
          password: null,
          port: parseInt(props.data.port),
          secure: props.data.secure,
          trusted: false
        },
        previousStepData: props.data
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
            onInput={(protocol) => void props.setData({ ...props.data, secure: (protocol === 'secure-tcp') })}
            options={[
              { id: 'secure-tcp', label: 'TCP with TLS' },
              { id: 'unsecure-tcp', label: 'TCP' }
            ]}
            value={props.data.secure ? 'secure-tcp' : 'unsecure-tcp'}
            targetRef={firstInputRef} />
          <Form.TextField
            label="Address"
            onInput={(address) => void props.setData({ ...props.data, hostname: address })}
            placeholder="e.g. 192.168.1.143"
            value={props.data.hostname} />
          <Form.TextField
            label="Port"
            onInput={(port) => void props.setData({ ...props.data, port })}
            placeholder="e.g. 4567"
            value={props.data.port} />
        </Form.Form>
      </div>

      <div className="startup-editor-action-root">
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={() => {
            props.setData({ stepIndex: 4, mode: 'remote' });
          }}>Back</button>
        </div>
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={() => {
            props.setData({
              stepIndex: 7,

              previousStepData: props.data,
              selectedHostIdentifier: null
            });
          }}>Search for setups on this network</button>
          <button type="submit" className="startup-editor-action-item">Next</button>
        </div>
      </div>
    </form>
  );
}

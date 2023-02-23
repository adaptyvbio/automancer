import { Form, React } from 'pr1';

import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


export interface Data extends HostCreatorStepData {
  stepIndex: 3;

  options: HostBackendOptions;
  rawOptions: { address: string; port: string; };
  rawPassword: string;
}

export function Component(props: HostCreatorStepProps<Data>) {
  let firstInputRef = React.createRef<HTMLInputElement>();

  React.useEffect(() => {
    firstInputRef.current!.select();
  }, []);

  return (
    <form className="startup-editor-contents" onSubmit={(event) => {
      event.preventDefault();

      props.setData({
        stepIndex: 1,
        options: {
          ...(props.data.options as HostRemoteBackendOptions),
          auth: {
            methodIndex: 0,

            type: 'password',
            password: props.data.rawPassword
          }
        },
        rawOptions: props.data.rawOptions,
        rawPassword: props.data.rawPassword
      })
    }}>
      <div className="startup-editor-inner">
        <h2>New setup</h2>
        <div>
          <Form.TextField
            label="Password"
            onInput={(password) => void props.setData({ ...props.data, rawPassword: password })}
            value={props.data.rawPassword}
            targetRef={firstInputRef} />
        </div>
      </div>
      <div className="startup-editor-action-root">
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={() => {
            props.setData({
              stepIndex: 0,
              ...props.data.rawOptions
            });
          }}>Previous</button>
        </div>
        <div className="startup-editor-action-list">
          <button type="submit" className="startup-editor-action-item">Next</button>
        </div>
      </div>
    </form>
  );
}

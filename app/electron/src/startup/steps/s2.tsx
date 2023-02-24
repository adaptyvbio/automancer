import { LargeIcon, React } from 'pr1';

import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';
import { HostSettingsId } from '../../interfaces';


export interface Data extends HostCreatorStepData {
  stepIndex: 2;

  hostSettingsId: HostSettingsId;
  label: string;
}

export function Component(props: HostCreatorStepProps<Data>) {
  return (
    <div className="startup-editor-contents">
      <div className="startup-editor-inner">
        <header className="startup-editor-header">
          <div className="startup-editor-subtitle">New setup</div>
          <h2>Set connection parameters</h2>
        </header>
        <div className="startup-editor-status">
          <LargeIcon name="success" />
          <p>Succesfully added "{props.data.label}"</p>
        </div>
      </div>
      <div className="startup-editor-action-root">
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={() => {
            props.cancel();
          }}>Close</button>
        </div>
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={() => {
            props.launchHost(props.data.hostSettingsId);
          }}>Launch</button>
        </div>
      </div>
    </div>
  );
}

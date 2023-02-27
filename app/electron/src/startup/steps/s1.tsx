import { LargeIcon, React, util } from 'pr1';
import type { CertificateFingerprint } from 'pr1-library';

import { Depromisify } from '../../interfaces';
import { HostCreatorData, HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


export interface Data extends HostCreatorStepData {
  stepIndex: 1;

  options: {
    fingerprint: CertificateFingerprint | null;
    hostname: string;
    password: string | null;
    port: number;
    secure: boolean;
    trusted: boolean;
  };
  previousData: HostCreatorData;
}

export function Component(props: HostCreatorStepProps<Data>) {
  let pool = util.usePool();

  let [attempt, setAttempt] = React.useState(0);
  let [result, setResult] = React.useState<Depromisify<ReturnType<typeof window.api.hostSettings.testRemoteHost>> & { ok: false; } | null>(null);

  React.useEffect(() => {
    pool.add(async () => {
      let result = await window.api.hostSettings.testRemoteHost({
        fingerprint: null,
        hostname: props.data.options.hostname,
        password: props.data.options.password,
        port: props.data.options.port,
        secure: props.data.options.secure,
        trusted: props.data.options.trusted
      });

      console.log(result);

      if (result.ok) {

      } else {
        setResult(result);

        if ('fingerprint' in result) {
          props.setData({
            options: {
              ...props.data.options,
              fingerprint: result.fingerprint
            }
          });
        }
      }

      // if (result.ok) {
      //   props.setData({
      //     stepIndex: 2,

      //     hostSettingsId: result.hostSettingsId,
      //     label: result.label
      //   });
      // } else if (result.reason === 'unauthorized') {
      //   props.setData({
      //     stepIndex: 3,
      //     options: props.data.options,
      //     rawOptions: props.data.rawOptions,
      //     rawPassword: ''
      //   });
      // } else if (result.reason === 'invalid') {
      //   setError({ message: 'Invalid parameters' });
      // } else if (result.reason === 'refused') {
      //   setError({ message: 'Connection refused' });
      // } else {
      //   setError({ message: 'Unknown error' });
      // }
    });
  }, [
    attempt,
    props.data.options.trusted
  ]);

  return (
    <form className="startup-editor-contents" onSubmit={(event) => {
      event.preventDefault();

      switch (result!.reason) {
        case 'untrusted_server': {
          setResult(null);
          props.setData({
            options: {
              ...props.data.options,
              trusted: true
            }
          });
        }
      }
    }}>
      <div className="startup-editor-inner">
        <header className="startup-editor-header">
          <div className="startup-editor-subtitle">New setup</div>
          <h2>Set connection parameters</h2>
        </header>
        {result
          ? (() => {
            switch (result.reason) {
              case 'invalid_parameters':
                return (
                  <div className="startup-editor-status">
                    <LargeIcon name="error" />
                    <p>Invalid parameters</p>
                  </div>
                );
              case 'refused':
                return (
                  <div className="startup-editor-status">
                    <LargeIcon name="error" />
                    <p>Connection refused</p>
                  </div>
                );
              case 'untrusted_server':
                return (
                  <div className="startup-editor-status">
                    <LargeIcon name="question" />
                    <p>Trust certificate with serial number {formatHex(result.serialNumber)}?</p>
                  </div>
                );
            }
          })()
          : (
            <div className="startup-editor-status">
              {/* <LargeIcon name="pending" /> */}
              <p>Loading</p>
            </div>
          )}
      </div>
      <div className="startup-editor-action-root">
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={() => {
            props.setData(props.data.previousData);
          }}>Back</button>
        </div>
        <div className="startup-editor-action-list">
          {result && (() => {
            switch (result.reason) {
              case 'refused':
                return (
                  <button type="button" className="startup-editor-action-item" onClick={() => {
                    setResult(null);
                    setAttempt(attempt + 1);
                  }}>Retry</button>
                );
              case 'untrusted_server':
                return (
                  <>
                    <button type="button" className="startup-editor-action-item" onClick={() => {
                      pool.add(async () => {
                        let options = props.data.options;

                        await window.api.hostSettings.displayCertificateOfRemoteHost({
                          fingerprint: options.fingerprint!,
                          hostname: options.hostname,
                          port: options.port
                        });
                      });
                    }}>Show certificate</button>
                    <button type="submit" className="startup-editor-action-item">Trust</button>
                  </>
                );
              default:
                return null;
            }
          })()}
        </div>
      </div>
    </form>
  );
}


function formatHex(input: string) {
  let chars = input.toUpperCase().split('');

  return new Array(chars.length / 2)
    .fill(0)
    .map((_, index) => chars[index * 2] + chars[(index * 2) + 1])
    .join(':');
}

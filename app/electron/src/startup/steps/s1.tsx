//* Connect to remote host

import { Form, LargeIcon, React, util } from 'pr1';
import type { CertificateFingerprint, HostIdentifier, TcpHostOptions } from 'pr1-library';

import { Depromisify } from '../../interfaces';
import { HostCreatorData, HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


export interface Data extends HostCreatorStepData {
  stepIndex: 1;

  options: {
    fingerprint: CertificateFingerprint | null;
    hostname: string;
    identifier: HostIdentifier | null;
    password: string | null;
    port: number;
    secure: boolean;
    trusted: boolean;
  };
  previousStepData: HostCreatorData;
}

export function Component(props: HostCreatorStepProps<Data>) {
  let pool = util.usePool();

  let [attempt, setAttempt] = React.useState(0);
  let [result, setResult] = React.useState<Depromisify<ReturnType<typeof window.api.hostSettings.testRemoteHost>> | null>(null);

  let [label, setLabel] = React.useState<string>('');
  let [password, setPassword] = React.useState<string>('');

  let targetRef = React.useCallback((el: unknown) => {
    if (el instanceof HTMLInputElement) {
      el.select();
    } else if (el instanceof HTMLElement) {
      el.focus();
    }
  }, []);


  React.useEffect(() => {
    pool.add(async () => {
      let result = await window.api.hostSettings.testRemoteHost({
        fingerprint: null,
        hostname: props.data.options.hostname,
        identifier: props.data.options.identifier,
        password: props.data.options.password,
        port: props.data.options.port,
        secure: props.data.options.secure,
        trusted: props.data.options.trusted
      });

      setResult(result);

      if ('fingerprint' in result) {
        let fingerprint = result.fingerprint;

        props.setData((data) => ({
          options: {
            ...data.options,
            fingerprint
          }
        }));
      }

      if ('identifier' in result) {
        let identifier = result.identifier;

        props.setData((data) => ({
          options: {
            ...data.options,
            identifier
          }
        }));
      }

      if (result.ok) {
        setLabel(result.name);
      } else if (result.reason === 'missing_password') {
        setPassword('');
      }
    });
  }, [
    attempt,
    props.data.options.trusted
  ]);

  return (
    <form className="startup-editor-contents" onSubmit={(event) => {
      event.preventDefault();

      if (result?.ok) {
        setResult(null);

        pool.add(async () => {
          let result = await window.api.hostSettings.addRemoteHost({
            options: (props.data.options as TcpHostOptions),
            label
          });

          await props.queryHostSettings();

          props.setData({
            stepIndex: 2,

            hostSettingsId: result.hostSettingsId,
            label
          });
        });

        return;
      }

      switch (result!.reason) {
        case 'missing_password': {
          setResult(null);

          props.setData((data) => ({
            options: {
              ...data.options,
              password
            }
          }));

          break;
        }

        case 'untrusted_server': {
          setResult(null);

          props.setData((data) => ({
            options: {
              ...data.options,
              trusted: true
            }
          }));

          break;
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
            if (result.ok) {
              return (
                <div>
                  <Form.TextField
                    label="Setup name"
                    onInput={(value) => void setLabel(value)}
                    value={label}
                    targetRef={targetRef} />
                </div>
              )
            }

            switch (result.reason) {
              case 'invalid_parameters':
                return (
                  <div className="startup-editor-status">
                    <LargeIcon name="error" />
                    <p>Invalid parameters</p>
                  </div>
                );
              case 'missing_password':
                return (
                  <div>
                    <Form.TextField
                      label="Password"
                      onInput={(value) => void setPassword(value)}
                      value={password}
                      targetRef={targetRef} />
                  </div>
                );
              case 'refused':
                return (
                  <div className="startup-editor-status">
                    <LargeIcon name="error" />
                    <p>Connection refused</p>
                  </div>
                );
              case 'unauthorized':
                return (
                  <div className="startup-editor-status">
                    <LargeIcon name="error" />
                    <p>Unauthorized: {result.message}</p>
                  </div>
                );
              case 'untrusted_server':
                return (
                  <div className="startup-editor-status">
                    <LargeIcon name="question" />
                    <p>Trust certificate with fingerprint {formatHex(result.fingerprint.slice(0, 20))}...?</p>
                  </div>
                );
              default:
                return (
                  <div className="startup-editor-status">
                    <LargeIcon name="error" />
                    <p>Internal error</p>
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
            props.setData(props.data.previousStepData);
          }}>Back</button>
        </div>
        <div className="startup-editor-action-list">
          {result && (() => {
            if (result.ok) {
              return (
                <button type="submit" className="startup-editor-action-item">Finish</button>
              );
            }

            switch (result.reason) {
              case 'missing_password':
                return (
                  <button type="submit" className="startup-editor-action-item">Next</button>
                );
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
                    <button type="submit" className="startup-editor-action-item" ref={targetRef}>Trust</button>
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

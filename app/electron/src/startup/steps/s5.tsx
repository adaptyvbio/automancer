import { Form, React } from 'pr1';
import type { LocalHostOptions, PythonInstallation, PythonInstallationId } from '../../interfaces';

import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


export interface Data extends HostCreatorStepData {
  stepIndex: 5;

  customPythonInstallation: PythonInstallation | null;
  label: string;
  pythonInstallationSettings: {
    architecture: string;
    id: PythonInstallationId;
    virtualEnv: boolean;
  } | null;
}

export function Component(props: HostCreatorStepProps<Data>) {
  let firstInputRef = React.createRef<HTMLInputElement>();

  React.useEffect(() => {
    firstInputRef.current!.select();
  }, []);

  let createSelectOptionFromPythonInstallation = (pythonInstallation: PythonInstallation) => ({
    id: pythonInstallation.path,
    label: `${pythonInstallation.path} (${[
      pythonInstallation.info.version.join('.'),
      ...(pythonInstallation.info.isVirtualEnv ? ['virtual environment'] : [])
    ].join(', ')})`
  });

  let pythonInstallation = props.data.customPythonInstallation ?? (
    props.data.pythonInstallationSettings
      ? props.context.pythonInstallations[props.data.pythonInstallationSettings.id]
      : null
  );

  return (
    <form className="startup-editor-contents" onSubmit={(event) => {
      event.preventDefault();

      let installationSettings = props.data.pythonInstallationSettings!;

      let options = {
        customPythonInstallation: props.data.customPythonInstallation,
        label: props.data.label.trim(),
        pythonInstallationSettings: {
          architecture: installationSettings.architecture !== '_auto'
            ? installationSettings.architecture
            : null,
          id: installationSettings.id,
          virtualEnv: installationSettings.virtualEnv
        }
      } satisfies LocalHostOptions;

      props.setData({
        stepIndex: 6,
        options
      });
    }}>
      <div className="startup-editor-inner">
        <header className="startup-editor-header">
          <div className="startup-editor-subtitle">New setup</div>
          <h2>Set parameters</h2>
        </header>
        <div>
          <Form.TextField
            label="Setup name"
            onInput={(label) => void props.setData({ ...props.data, label })}
            value={props.data.label}
            targetRef={firstInputRef} />
          <Form.Select
            label="Python location"
            onInput={(optionId) => {
              if (optionId === '_custom') {
                (async () => {
                  let customPythonInstallation = await window.api.hostSettings.selectPythonInstallation();

                  if (customPythonInstallation) {
                    props.setData({
                      ...props.data,
                      customPythonInstallation: !(customPythonInstallation.id in props.context.pythonInstallations)
                        ? customPythonInstallation
                        : null,
                      pythonInstallationSettings: {
                        architecture: '_auto',
                        id: customPythonInstallation.id,
                        virtualEnv: false
                      }
                    });
                  }
                })();
              } else {
                props.setData({
                  ...props.data,
                  customPythonInstallation: null,
                  pythonInstallationSettings: {
                    architecture: '_auto',
                    id: optionId!,
                    virtualEnv: false
                  }
                });
              }
            }}
            options={[
              { id: '_header.main', label: 'Main locations', disabled: true },
              ...Object.values(props.context.pythonInstallations)
                .filter((pythonInstallation) => pythonInstallation.leaf)
                .map(createSelectOptionFromPythonInstallation),
              { id: '_header.others', label: 'Other locations', disabled: true },
              ...Object.values(props.context.pythonInstallations)
                .filter((pythonInstallation) => !pythonInstallation.leaf)
                .map(createSelectOptionFromPythonInstallation),
              { id: '_header.custom', label: 'Custom locations', disabled: true },
              ...(props.data.customPythonInstallation
                ? [createSelectOptionFromPythonInstallation(props.data.customPythonInstallation)]
                : []),
              { id: '_custom', label: 'Custom location' }
            ]}
            value={props.data.pythonInstallationSettings?.id ?? null} />
          <Form.Select
            label="Architecture"
            onInput={(architecture) => void props.setData({
              ...props.data,
              pythonInstallationSettings: {
                ...props.data.pythonInstallationSettings!,
                architecture
              }
            })}
            options={[
              { id: '_auto', label: 'Automatic' },
              ...(pythonInstallation?.info.architectures?.map((architecture) => ({
                id: architecture,
                label: architecture
              })) ?? [])
            ]}
            disabled={!pythonInstallation}
            value={props.data.pythonInstallationSettings?.architecture ?? '_'} />
          <Form.CheckboxList label="Virtual environment">
            {/* <pre>{JSON.stringify(pythonInstallation?.info, null, 2)}</pre>
            <pre>{JSON.stringify(props.data, null, 2)}</pre> */}
            <Form.Checkbox
              checked={pythonInstallation?.info.supportsVirtualEnv && (props.data.pythonInstallationSettings?.virtualEnv || pythonInstallation.info.isVirtualEnv)}
              disabled={!pythonInstallation || pythonInstallation.info.isVirtualEnv || !pythonInstallation.info.supportsVirtualEnv}
              label="Create a virtual environment"
              onInput={(value) => void props.setData({
                ...props.data,
                pythonInstallationSettings: {
                  ...props.data.pythonInstallationSettings!,
                  virtualEnv: value
                }
              })}>
              {!pythonInstallation?.info.supportsVirtualEnv && (
                <p>Virtual environments are not supported in this Python installation. Install venv to add their support.</p>
              )}
              {pythonInstallation?.info.isVirtualEnv && (
                <p>This installation is already a virtual environment.</p>
              )}
            </Form.Checkbox>
          </Form.CheckboxList>
          {/* <Form.Select
            label="Data location"
            onInput={() => {}}
            options={[]}
            value={null} /> */}
        </div>
      </div>
      <div className="startup-editor-action-root">
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={() => {
            props.setData({
              stepIndex: 4,
              mode: 'advanced'
            });
          }}>Back</button>
        </div>
        <div className="startup-editor-action-list">
          <button type="submit" className="startup-editor-action-item" disabled={!pythonInstallation || !props.data.label.trim()}>Next</button>
        </div>
      </div>
    </form>
  );
}

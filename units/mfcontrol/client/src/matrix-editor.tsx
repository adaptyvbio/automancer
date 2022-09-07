import { setIn } from 'immutable';
import { Form, MatrixEditorInstance, MatrixEditorProps, Pool, React } from 'pr1';

import { Executor, Runner, namespace, Command } from '.';


export class MatrixEditor extends React.Component<MatrixEditorProps> implements MatrixEditorInstance {
  pool = new Pool();

  render() {
    let executor = this.props.host.state.executors[namespace] as Executor;
    let runner = this.props.chip.runners[namespace] as Runner;

    let currentModel = runner.settings.model;
    let similarModel = currentModel && (Object.values(executor.models).find((model) => model.id === currentModel!.id) ?? null);
    let isSimilarModelCurrent = similarModel && (similarModel.hash === currentModel!.hash);
    let model = isSimilarModelCurrent ? similarModel : currentModel;

    return (
      <>
        <div className="header header--2">
          <h2>Valve control</h2>
        </div>

        <Form.Header>Chip</Form.Header>
        <Form.Form>
          <Form.Select
            label="Chip model"
            onInput={(modelId) => {
              if (modelId !== '_current') {
                this.pool.add(async () => {
                  await this.props.host.backend.command({
                    chipId: this.props.chip.id,
                    namespace,
                    command: {
                      type: 'setModel',
                      modelId
                    }
                  });
                });
              }
            }}
            options={[
              { id: null, label: 'None' },
              ...(model && !isSimilarModelCurrent ? [{ id: '_current', label: `${model.name} (current)` }] : []),
              ...Object.values(executor.models).map((model) => ({
                id: model.id,
                label: model.name
              }))
            ]}
            value={model && (isSimilarModelCurrent ? model.id : '_current')} />
        </Form.Form>

        {model?.groups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            <Form.Header>{group.label}</Form.Header>
            <Form.Form>
              {group.channelIndices.map((channelIndex) => {
                let channel = model!.channels[channelIndex];

                return (
                  <React.Fragment key={channelIndex}>
                    <Form.Select
                      label={channel.label ?? `Channel ${channelIndex}`}
                      onInput={(value) => {
                        this.pool.add(async () => {
                          await this.props.host.backend.command<Command>({
                            chipId: this.props.chip.id,
                            namespace,
                            command: {
                              type: 'setValveMap',
                              valveMap: setIn(runner.settings.valveMap!, [channelIndex], value)
                            }
                          });
                        });
                      }}
                      options={[
                        { id: null, label: 'None' },
                        ...Array.from(executor.valves.entries()).map(([hostValveIndex, valve]) => ({ id: hostValveIndex, label: valve.label }))
                      ]}
                      value={runner.settings.valveMap![channelIndex]} />
                  </React.Fragment>
                );
              })}
            </Form.Form>
          </React.Fragment>
        ))}
      </>
    );
  }
}

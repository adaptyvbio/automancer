import { setIn } from 'immutable';
import { Form, MatrixEditorInstance, MatrixEditorProps, React } from 'pr1';

import { ExecutorState, Matrix, namespace } from '.';


export class MatrixEditor extends React.Component<MatrixEditorProps<Matrix>> implements MatrixEditorInstance<Matrix> {
  render() {
    let executor = this.props.host.state.executors[namespace] as ExecutorState;

    let hostValves = executor.valves;
    let valves = this.props.matrix.valves;

    let currentModel = this.props.matrix.model;
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
                this.props.setMatrix({ modelId });
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

        {valves && model!.groups.map((group, groupIndex) => (
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
                        this.props.setMatrix({
                          valves: setIn(this.props.matrix.valves, [channelIndex, 'hostValveIndex'], value)
                      });
                      }}
                      options={[
                        { id: null, label: 'None' },
                        ...Object.entries(hostValves).map(([valveName, hostValveIndex]) => ({ id: hostValveIndex, label: valveName }))
                      ]}
                      value={valves![channelIndex].hostValveIndex} />
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

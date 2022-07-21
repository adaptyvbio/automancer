import { setIn } from 'immutable';
import * as React from 'react';

import { Matrix, namespace } from '.';
import { MatrixEditorInstance, MatrixEditorProps } from '..';
import * as Form from '../../components/standard-form';


export class MatrixEditor extends React.Component<MatrixEditorProps<Matrix>> implements MatrixEditorInstance<Matrix> {
  render() {
    let models = this.props.host.state.executors[namespace].models;

    let hostValves = this.props.host.state.executors[namespace].valves;
    let valves = this.props.chip.matrices[namespace].valves;

    let model = (this.props.matrix.modelId !== null)
      ? models[this.props.matrix.modelId]
      : null;

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
              this.props.setMatrix({ ...this.props.matrix, modelId });
            }}
            options={[
              { id: null, label: 'None' },
              ...Object.values(models).map((model) => ({
                id: model.id,
                label: model.name
              })),
            ]}
            value={this.props.matrix.modelId} />
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
                        this.props.setMatrix(
                          setIn(this.props.matrix, ['valves', channelIndex, 'hostValveIndex'], value)
                        );
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

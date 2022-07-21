import { setIn } from 'immutable';
import * as React from 'react';

import { Matrix, namespace } from '.';
import { MatrixEditorInstance, MatrixEditorProps } from '..';
import * as Form from '../../components/standard-form';
import { namespace as mfNamespace } from '../../units/microfluidics';


export class MatrixEditor extends React.Component<MatrixEditorProps<Matrix>> implements MatrixEditorInstance<Matrix> {
  render() {
    let hostValves = this.props.host.state.executors[namespace].valves;
    let valves = this.props.chip.matrices[namespace].valves;

    let mfMatrix = this.props.chip.matrices[mfNamespace];
    let model = (mfMatrix.modelId !== null)
      ? this.props.host.state.executors[mfNamespace].models[mfMatrix.modelId]
      : null;

    return valves
      ? (
        <>
          <div className="header header--2">
            <h2>Valve control</h2>
          </div>

          {model!.groups.map((group, groupIndex) => (
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
      )
      : <></>;
  }
}

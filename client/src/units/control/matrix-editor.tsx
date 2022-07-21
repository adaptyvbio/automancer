import { setIn } from 'immutable';
import * as React from 'react';

import { Matrix, namespace } from '.';
import { MatrixEditorInstance, MatrixEditorProps } from '..';
import * as Form from '../../components/standard-form';
import { namespace as mfNamespace } from '../../units/microfluidics';


export class MatrixEditor extends React.Component<MatrixEditorProps<Matrix>> implements MatrixEditorInstance<Matrix> {
  render() {
    // let valves = this.props.host.state.executors[namespace].valves;
    let mfMatrix = this.props.chip.matrices[mfNamespace];
    let model = (mfMatrix.modelId !== null)
      ?  this.props.host.state.executors[mfNamespace].models[mfMatrix.modelId]
      : null;

    return (
      <>
        <div className="header header--2">
          <h2>Valve control</h2>
        </div>

        {0 && model.groups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            <div className="veditor-inspector-section">{group.label}</div>
            <div className="veditor-inspector-form">
              {/* {model!.channels.map((valve, valveIndex) => {
                if (valve.group !== groupIndex) {
                  return null;
                } */}

              {group.channelIndices.map((channelIndex) => {
                let channel = model!.channels[channelIndex];

                // let currentValue = this.props.matrix.valves[valveIndex].hostValveIndex;
                // let rawCurrentValue = currentValue !== null
                //   ? currentValue.toString()
                //   : '';

                return (
                  <React.Fragment key={valveIndex}>
                    <Form.Select
                      label={valve.name}
                      value={rawCurrentValue}
                      onInput={(event) => {
                        let rawValue = event.currentTarget.value;
                        let value = (rawValue.length > 0)
                          ? parseInt(rawValue)
                          : null;

                        this.props.setMatrix(
                          setIn(this.props.matrix, ['valves', valveIndex, 'hostValveIndex'], value)
                        );
                      }}>
                      <option value="">None</option>
                      {Object.entries(valves).map(([label, hostValveIndex]) => (
                        <option key={hostValveIndex} value={hostValveIndex}>{label}</option>
                      ))}
                    </Form.Select>
                  </React.Fragment>
                );
              })}
            </div>
          </React.Fragment>
        ))}
      </>
    );
  }
}

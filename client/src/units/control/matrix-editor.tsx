import { setIn } from 'immutable';
import * as React from 'react';

import { Matrix, namespace } from '.';
import { MatrixEditorInstance, MatrixEditorProps } from '..';
import * as Inspector from '../../components/inspector';


export class MatrixEditor extends React.Component<MatrixEditorProps<Matrix>> implements MatrixEditorInstance<Matrix> {
  get sheet() {
    return this.props.model.sheets[namespace];
  }

  render() {
    let valves = this.props.host.state.executors[namespace].valves;

    return (
      <>
        <div className="header header--2">
          <h2>Control</h2>
        </div>

        {this.sheet.groups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            <div className="veditor-inspector-section">{group.name}</div>
            <div className="veditor-inspector-form">
              {this.sheet.valves.map((valve, valveIndex) => {
                if (valve.group !== groupIndex) {
                  return null;
                }

                let currentValue = this.props.matrix.valves[valveIndex].hostValveIndex;
                let rawCurrentValue = currentValue !== null
                  ? currentValue.toString()
                  : '';

                return (
                  <React.Fragment key={valveIndex}>
                    <Inspector.Select
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
                    </Inspector.Select>
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

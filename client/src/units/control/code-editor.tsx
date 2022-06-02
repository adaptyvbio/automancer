import { List } from 'immutable';
import * as React from 'react';

import type { Draft } from '../../application';
import type { Chip, ChipId, ChipModel, ControlNamespace, HostId, Protocol } from '../../backends/common';
import { Icon } from '../../components/icon';


interface CodeEditorProps {
  chip: Chip;
  draft: Draft;
  model: ChipModel;

  code: ControlNamespace.Code;
  setCode(code: ControlNamespace.Code): void;
}

export class CodeEditor extends React.Component<CodeEditorProps> {
  render() {
    let protocol = this.props.draft.compiled!.protocol!;
    let sheet = this.props.model.sheets.control;

    let args = this.props.code.arguments;

    return (
      <>
        <h4 className="pconfig-section">Control settings</h4>
        <div className="pconfig-form">
          {protocol.data.control?.parameters.map((param, paramIndex) => {
            let argValveIndex = args[paramIndex];
            let argValve = sheet.valves[argValveIndex!];

            return (
              <label className="pconfig-entry" key={paramIndex}>
                <div className="pconfig-entry-label">{param.label}</div>
                <div className="pconfig-entry-input superimposed-root">
                  <select className="superimposed-target" value={argValveIndex?.toString() ?? ''} onInput={(event) => {
                    let value = event.currentTarget.value.length > 0
                      ? parseInt(event.currentTarget.value)
                      : null;

                    this.props.setCode({
                      arguments: List(args).set(paramIndex, value).toArray()
                    });
                  }}>
                    <option value="">–</option>
                    {sheet.groups.map((group, groupIndex) => (
                      <React.Fragment key={groupIndex}>
                        <option disabled>{group.name}</option>
                        {Array.from(sheet.valves.entries())
                          .filter(([_valveIndex, valve]) => groupIndex === valve.group)
                          .map(([valveIndex, valve]) => (
                            <option value={valveIndex} key={valveIndex}>{valve.names[0]}</option>
                          ))}
                      </React.Fragment>
                    ))}
                    {/* onSelect={(selection) => {
                    // this.setState((state) => ({ arguments: state.arguments.set(paramIndex, selection.get(1) as number) }));
                    this.props.setCode({
                      arguments: [
                        ...args.slice(0, paramIndex),
                        selection.get(1) as number,
                        ...args.slice(paramIndex + 1)
                      ]
                    });
                  }} */}
                    {/* selectedOptionPath={argValveIndex !== null ? [argValve.group, argValveIndex] : null} /> */}
                  </select>
                  <div className="btn illustrated-root superimposed-visible">
                    {argValve && (
                      <div className="btn-icon">
                        <Icon name="air" />
                      </div>
                    )}
                    <div>{argValve ? argValve.names[0] : 'Select valve'}</div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </>
    );
  }
}

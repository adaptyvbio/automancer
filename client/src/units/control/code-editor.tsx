import * as React from 'react';
import * as Rf from 'retroflex';

import type { Chip, ChipId, ChipModel, ControlNamespace, Draft, DraftId, HostId, Protocol } from '../../backends/common';


interface CodeEditorProps {
  chip: Chip;
  draft: Draft;
  model: ChipModel;

  code: ControlNamespace.Code;
  setCode(code: ControlNamespace.Code): void;
}

export class CodeEditor extends React.Component<CodeEditorProps> {
  render() {
    let protocol = this.props.draft.protocol!;
    let sheet = this.props.model.sheets.control;

    let args = this.props.code.arguments;

    return (
      <>
        <h4>Control settings</h4>
        <div className="protocol-config-form">
          {protocol.data.control?.parameters.map((param, paramIndex) => {
            let argValveIndex = args[paramIndex];
            let argValve = sheet.valves[argValveIndex!];

            return (
              <label className="protocol-config-entry" key={paramIndex}>
                <div>{param.label}</div>
                <Rf.MenuSelect
                  menu={sheet.groups.map((group, groupIndex) => ({
                    id: groupIndex,
                    name: group.name,
                    children: Array.from(sheet.valves.entries())
                      .filter(([_valveIndex, valve]) => groupIndex === valve.group)
                      .map(([valveIndex, valve]) => ({
                        id: valveIndex,
                        name: valve.names[0]
                      }))
                  }))}
                  onSelect={(selection) => {
                    // this.setState((state) => ({ arguments: state.arguments.set(paramIndex, selection.get(1) as number) }));
                    this.props.setCode({
                      arguments: [
                        ...args.slice(0, paramIndex),
                        selection.get(1) as number,
                        ...args.slice(paramIndex + 1)
                      ]
                    });
                  }}
                  selectedOptionPath={argValveIndex !== null ? [argValve.group, argValveIndex] : null} />
              </label>
            );
          })}
        </div>
      </>
    );
  }
}

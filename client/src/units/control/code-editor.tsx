import { List } from 'immutable';
import * as React from 'react';

import { Code, namespace, ReprIcon } from '.';
import type { CodeEditorInstance, CodeEditorProps } from '..';
import type { Draft } from '../../draft';
import type { Chip, ChipId, ControlNamespace, HostId, Protocol } from '../../backends/common';
import { Icon } from '../../components/icon';


export class CodeEditor extends React.Component<CodeEditorProps<Code>> implements CodeEditorInstance<Code> {
  render() {
    let matrix = this.props.chip.matrices[namespace];
    let model = this.props.host.state.executors[namespace].models[matrix.modelId!];

    let protocol = this.props.draft.compiled!.protocol!;
    let protocolData = protocol.data[namespace];

    let args = this.props.code.arguments;

    return (
      <>
        <h4 className="pconfig-section">Control settings</h4>
        <div className="pconfig-form">
          {protocolData.parameters.map((param, paramIndex) => {
            let argValveIndex = args[paramIndex];
            let argValve = model.channels[argValveIndex!];
            let entity = protocolData.entities[param.paramIndicesEncoded];

            if (param.channelIndex !== null) {
              return null;
            }

            return (
              <label className="pconfig-entry" key={paramIndex}>
                <div className="pconfig-entry-label">{entity.label}</div>
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
                    {model.groups.map((group, groupIndex) => (
                      <React.Fragment key={groupIndex}>
                        <option disabled>{group.label}</option>
                        {group.channelIndices.map((channelIndex) => {
                          let channel = model.channels[channelIndex];

                          return (
                            <option value={channelIndex} key={channelIndex}>{channel.label}</option>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </select>
                  <div className="btn superimposed-visible">
                    {argValve && (
                      <div className="btn-icon">
                        <Icon name={ReprIcon[argValve.repr].forwards} />
                      </div>
                    )}
                    <div>{argValve ? argValve.label : 'Select valve'}</div>
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

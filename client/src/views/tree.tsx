import { List, OrderedMap } from 'immutable';
import * as React from 'react';
import { Tree, TreeEntryDef, TreeEntryRecord, TreePath, ViewBody, ViewHeader, ViewProps } from 'retroflex';

import type { Model } from '..';
import type { ChipId, HostId } from '../backends/common';
import type ViewChipSettings from './chip-settings';
import type ViewControl from './control';


export default class ViewTree extends React.Component<ViewProps<Model>> {
  // constructor(props) {
  //   super(props);
  // }

  render() {
    let tree = OrderedMap(
      Object.values(this.props.model.hosts).flatMap((host) => [
        [List([host.id]), TreeEntryRecord({ name: host.state.info.name, selectable: false })],
        [List([host.id, 'chips']), TreeEntryRecord({ name: 'Chips', selectable: false })],
        ...Object.values(host.state.chips).map((chip): [TreePath, TreeEntryDef] => {
          let model = host.state.models[chip.modelId];
          return [List([host.id, 'chips', chip.id]), TreeEntryRecord({ name: `${chip.name} (${model.name})` })]
        }),
        [List([host.id, 'devices']), TreeEntryRecord({ name: 'Devices', selectable: false })],
        ...host.state.devices.map((device): [TreePath, TreeEntryDef] =>
          [List([host.id, 'devices', device.id]), TreeEntryRecord({ name: device.name })]
        )
      ])
    );

    return (
      <>
        <ViewHeader />
        <ViewBody>
          {/* <Properties /> */}
          <Tree
            modifiers={[]}
            tree={tree}
            onContextMenu={(event, paths, sourcePath) => {
              event.preventDefault();

              if (paths.size > 1) {
                return;
              }

              if ((sourcePath.size >= 2) && (sourcePath.get(1) === 'chips')) {
                let host = this.props.model.hosts[sourcePath.first()!];

                if (sourcePath.size === 2) {
                  return this.props.app.showContextMenu(event, [
                    { id: 'add', name: 'Add chip', children: [
                      ...Object.values(host.state.models).map((model) => (
                        { id: model.id, name: model.name }
                      )),
                      { id: 'div', type: 'divider' },
                      { id: 'manage', name: 'Manage chip models', disabled: true }
                    ] }
                  ], (menuPath) => {
                    if (menuPath.first() === 'add') {
                      let modelId = menuPath.get(1)!;
                      host.backend.createChip({ modelId: modelId as string });
                    }
                  });
                } else {
                  let chip = host.state.chips[sourcePath.get(2)!];

                  return this.props.app.showContextMenu(event, [
                    { id: 'remove', name: 'Remove chip' }
                  ], (menuPath) => {
                    if (menuPath.first() === 'remove') {
                      host.backend.deleteChip(chip.id);
                    }
                  });
                }
              }
            }}
            onDoubleClick={(_event, path) => {
              if ((path.size === 3) && (path.get(1) === 'chips')) {
                let hostId = path.get(0) as HostId;
                let chipId = path.get(2) as ChipId;

                let selectedHostChipId: [HostId, ChipId] = [hostId, chipId];

                this.props.app.layoutManager.findView<ViewChipSettings>('chip-settings')?.setState({ selectedHostChipId });
                this.props.app.layoutManager.findView<ViewControl>('control')?.setState({ selectedHostChipId });
              }
            }} />
        </ViewBody>
      </>
    );
  }
}

import { List, OrderedMap } from 'immutable';
import * as React from 'react';

import { Tree, TreeEntryDef, TreeEntryRecord, TreePath, ViewBody, ViewHeader, ViewProps } from 'retroflex';
import { Model } from '..';


export default class ViewTree extends React.Component<ViewProps<Model>> {
  // constructor(props) {
  //   super(props);
  // }

  render() {
    let tree = OrderedMap(
      Object.values(this.props.model.hosts).flatMap((host) => [
        [List([host.state.info.id]), TreeEntryRecord({ name: host.state.info.name, selectable: false })],
        [List([host.state.info.id, 'chips']), TreeEntryRecord({ name: 'Chips', selectable: false })],
        ...Object.values(host.state.chips).map((chip): [TreePath, TreeEntryDef] => {
          let model = host.state.models[chip.modelId];
          return [List([host.state.info.id, 'chips', chip.id]), TreeEntryRecord({ name: `${chip.name} (${model.name})` })]
        }),
        [List([host.state.info.id, 'devices']), TreeEntryRecord({ name: 'Devices', selectable: false })],
        ...host.state.devices.map((device): [TreePath, TreeEntryDef] =>
          [List([host.state.info.id, 'devices', device.id]), TreeEntryRecord({ name: device.name })]
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
                      host.backend.createChip({ modelId });
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
            }} />
        </ViewBody>
      </>
    );
  }
}

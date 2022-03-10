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
      Object.entries(this.props.model.hosts).flatMap(([id, host]) => [
        [List([id]), TreeEntryRecord({ name: host.state.name, selectable: false })],
        [List([id, 'chips']), TreeEntryRecord({ name: 'Chips', selectable: false })],
        ...Object.values(host.state.chips).map((chip, index): [TreePath, TreeEntryDef] => {
          let model = host.state.chipModels[chip.modelId];
          return [List([id, 'chips', index.toString()]), TreeEntryRecord({ name: `${chip.name} (${model.name})` })]
        }),
        [List([id, 'devices']), TreeEntryRecord({ name: 'Devices', selectable: false })],
        ...host.state.devices.map((device): [TreePath, TreeEntryDef] =>
          [List([id, 'devices', device.id]), TreeEntryRecord({ name: device.name })]
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

              if ((sourcePath.size === 2) && (sourcePath.get(1) === 'chips')) {
                let host = this.props.model.hosts[sourcePath.first()!];

                return this.props.app.showContextMenu(event, [
                  { id: 'add', name: 'Add chip', icon: 'add', children: [
                    ...Object.entries(host.state.chipModels).map(([id, chipModel]) => (
                      { id: 'add.' + id, name: chipModel.name }
                    )),
                    { id: 'div1', type: 'divider' },
                    { id: 'c', name: 'Manage chip models' }
                  ] }
                ]);
              }

              if ((sourcePath.size === 3) && (sourcePath.get(1)) === 'chips') {
                return this.props.app.showContextMenu(event, [
                  { id: 'remove', name: 'Remove chip' }
                ]);
              }
            }}
            onModify={(path, modifierId, value) => {
              // this.setState({ tree });
            }} />
        </ViewBody>
      </>
    );
  }
}

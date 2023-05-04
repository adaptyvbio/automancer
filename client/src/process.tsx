import { PluginName, ProtocolBlock, ProtocolBlockName, ProtocolBlockPath } from 'pr1-shared';
import * as React from 'react';

import { GraphNode } from './components/graph-editor';
import { FeatureGroupDef } from './interfaces/feature';
import { ProtocolBlockGraphRenderer } from './interfaces/graph';
import { PluginBlockImpl } from './interfaces/plugin';


const computeGraph: ProtocolBlockGraphRenderer<ProtocolBlock, never, Location> = (block, path, ancestors, location, options, context) => {
  let impl = context.host.plugins[block.namespace].blocks[block.name];
  let features = impl.createEntries!(block, null)[0].features;

  let name: string | null = null;

  let featureCount = features.length;
  let settings = options.settings;

  let width = Math.round((280 + settings.nodePadding * 2) / settings.cellPixelSize);
  let height = Math.ceil((
    ((name !== null) ? settings.nodeHeaderHeight : 0)
    + (30 * featureCount)
    + (5.6 * (featureCount - 1))
    + (settings.nodeBodyPaddingY * 2)
    + (settings.nodePadding * 2)
    + (settings.nodeBorderWidth * 2)
  ) / settings.cellPixelSize);

  return {
    compactable: true,
    start: { x: 0, y: 0 },
    end: options.settings.vertical
      ? { x: 0, y: height }
      : { x: width, y: 0 },
    size: {
      width,
      height
    },

    render(position, renderOptions) {
      let active = false; // (location !== null);

      return (
        <GraphNode
          active={active}
          autoMove={false}
          cellSize={{
            width,
            height
          }}
          createMenu={() => {
            return [
              ...(active
                ? createActiveBlockMenu(block, location!, context)
                : []),
              { id: 'jump', name: 'Jump to', icon: 'move_down' },
              { id: 'skip', name: 'Skip', icon: 'playlist_remove' }
            ];
          }}
          node={{
            id: '_',
            title: (name !== null) ? { value: name } : null,
            features,
            position
          }}
          onSelectBlockMenu={(menuPath) => {
            let message = onSelectBlockMenu(block, location!, menuPath);

            if (message) {
              // ...
              return;
            }

            switch (menuPath.first()) {
              case 'jump': {
                let tree = options.settings.editor.props.tree!;

                let getChildPoint = (block: ProtocolBlock, path: ProtocolBlockPath): unknown => {
                  let unit = UnitTools.asBlockUnit(context.host.units[block.namespace])!;
                  return unit.createDefaultPoint!(block, path[0], (block) => getChildPoint(block, path.slice(1)));
                };

                let point = getChildPoint(tree, path);
                options.settings.editor.props.execution.jump(point);
              }
            }
          }}
          path={path}
          selected={JSON.stringify(options.settings.editor.props.selectedBlockPath) === JSON.stringify(path)}
          settings={options.settings} />
      );
    }
  };
};

export function createProcessBlockImpl<Data, Location>(options: {
  createFeatures?(data: Data, location: Location | null): FeatureGroupDef;
}): PluginBlockImpl<ProtocolBlock & {
  data: Data;
}, never, Location> {
  return {
    computeGraph,
    createEntries(block, location) {
      return [{
        features: options.createFeatures?.(block.data, location) ?? [
          { icon: 'not_listed_location',
            label: 'Process' }
        ]
      }];
    }
  };
}

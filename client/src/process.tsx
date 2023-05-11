import { ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';
import * as React from 'react';

import { GraphNode } from './components/graph-editor';
import { ProtocolBlockGraphRenderer } from './interfaces/graph';
import { PluginBlockImpl, BlockContext } from './interfaces/plugin';
import { ComponentType } from 'react';
import { FeatureDef } from './components/features';


const computeGraph: ProtocolBlockGraphRenderer<ProtocolBlock, unknown> = (block, path, ancestors, location, options, context) => {
  let impl = context.host.plugins[block.namespace].blocks[block.name];
  let features = impl.createFeatures!(block, null, context);

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

      return {
        element: (
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
        ),
        nodes: [{
          path,
          position: {
            x: position.x + (width * 0.5),
            y: position.y + (height * 0.5)
          }
        }]
      };
    }
  };
};


export interface ProcessBlock<Data> extends ProtocolBlock {
  data: Data;
}

export interface ProcessLocation<Location> {
  children: {};
  mode: ProcessLocationMode;
  pausable: boolean;
  process: Location;
  time: number;
}

export enum ProcessLocationMode {
  Broken = 0,
  Halting = 1,
  Normal = 2,
  Pausing = 3,
  Paused = 4,
  ResumingProcess = 5,
  Starting = 6,
  Terminated = 7
}

export function createProcessBlockImpl<Data, Location>(options: {
  Component?: ComponentType<{
    context: BlockContext;
    data: Data;
    date: number;
    location: Location;
  }>;
  createFeatures?(data: Data, location: Location | null): FeatureDef[];
  getLabel?(data: Data): string | null;
}): PluginBlockImpl<ProcessBlock<Data>, ProcessLocation<Location>> {
  return {
    ...(options.Component && {
      Component(props) {
        let Component = options.Component!;

        return (
          <Component
            data={props.block.data}
            date={props.location.time}
            context={props.context}
            location={props.location.process} />
        );
      }
    }),
    computeGraph,
    createCommands(block, location, context) {
      if ((location.mode === ProcessLocationMode.Normal) && location.pausable) {
        return [{
          id: 'pause',
          label: 'Pause',
          shortcut: 'P',
          onTrigger() {
            context.pool.add(async () => {
              await context.sendMessage({ type: 'pause' });
            });
          }
        }];
      }

      if ((location.mode === ProcessLocationMode.Paused)) {
        return [{
          id: 'resume',
          label: 'Resume',
          shortcut: 'P',
          onTrigger() {
            context.pool.add(async () => {
              await context.sendMessage({ type: 'resume' });
            });
          }
        }];
      }

      return [];
    },
    createFeatures(block, location) {
      return options.createFeatures?.(block.data, location?.process ?? null) ?? [
        { icon: 'not_listed_location',
          label: 'Process' }
      ];
    },
    getLabel(block) {
      return options.getLabel?.(block.data) ?? null;
    }
  };
}

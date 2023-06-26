import { DiagnosticId, MasterBlockLocation, ProtocolBlock } from 'pr1-shared';

import { ComponentType } from 'react';
import { FeatureDef } from './components/features';
import { GraphNode } from './components/graph-editor';
import { Report } from './components/report';
import { RectSurface } from './geometry';
import { ProtocolBlockGraphRenderer } from './interfaces/graph';
import { BlockContext, PluginBlockImpl } from './interfaces/plugin';
import { deepEqual } from './util';


const computeGraph: ProtocolBlockGraphRenderer<ProtocolBlock, ProcessLocation<unknown>> = (block, path, ancestors, location, options, context) => {
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
      let selection = options.settings.editor.props.selection;

      let status = (selection && deepEqual(selection.blockPath, path))
        ? selection.observed
          ? ('observed' as const)
          : ('selected' as const)
        : ('default' as const);

      return {
        element: (
          <GraphNode
            activity={location
              ? (location.mode.type !== 'running')
                ? 'paused'
                : 'active'
              : 'default'}
            autoMove={false}
            cellSize={{
              width,
              height
            }}
            node={{
              id: '_',
              title: (name !== null)
                ? {
                  text: name,
                  value: name
                }
                : null,
              features,
              position
            }}
            path={path}
            status={status}
            settings={options.settings} />
        ),
        nodes: [{
          path,
          surface: new RectSurface(position, { width, height })
        }]
      };
    }
  };
};


export interface ProcessBlock<Data> extends ProtocolBlock {
  data: Data;
}

export interface ProcessLocation<Location> extends MasterBlockLocation {
  children: {};
  date: number;
  mode: {
    type: 'collecting';
  } | {
    type: 'collectionFailed';
  } | {
    type: 'failed';
    errorId: DiagnosticId;
  } | {
    type: 'halting';
  } | {
    type: 'running';
    pausable: boolean;
    processLocation: Location | null;
    form: 'halting' | 'jumping' | 'normal' | 'paused' | 'pausing';
  };
}

export function createProcessBlockImpl<Data, Location>(options: {
  Component?: ComponentType<{
    context: BlockContext;
    data: Data;
    date: number;
    location: Location;
    status: 'normal' | 'paused';
  }>;
  createFeatures?(data: Data, location: Location | null): FeatureDef[];
  getLabel?(data: Data): string | null;
}): PluginBlockImpl<ProcessBlock<Data>, ProcessLocation<Location>> {
  return {
    Component(props) {
      let mode = props.location.mode;

      // return <p>{JSON.stringify(mode)}</p>

      if (mode.type === 'failed') {
        let errorId = mode.errorId;
        let error = props.context.experiment.master!.masterAnalysis.errors.find((error) => (error.id === errorId)) ?? null;

        if (error) {
          return (
            <Report analysis={{
              effects: [],
              errors: [error],
              warnings: []
            }} />
          );
        }

        return (
          <p style={{ margin: '1rem 0' }}>An error occured.</p>
        );
      }

      let Component = options.Component;

      if (Component && (mode.type === 'running') && mode.processLocation) {
        return (
          <Component
            data={props.block.data}
            date={props.location.date}
            context={props.context}
            location={mode.processLocation}
            status={(mode.form === 'paused') ? 'paused' : 'normal'} />
        );
      }

      return null;
    },
    computeGraph,
    createCommands(block, location, context) {
      if (location.mode.type === 'running') {
        if (location.mode.form === 'paused') {
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

        if (location.mode.pausable) {
          return [{
            id: 'pause',
            disabled: (location.mode.form !== 'normal'),
            label: 'Pause',
            shortcut: 'P',
            onTrigger() {
              context.pool.add(async () => {
                await context.sendMessage({ type: 'pause' });
              });
            }
          }];
        }
      }

      return [];
    },
    createFeatures(block, location) {
      let processLocation = (location?.mode.type === 'running')
        ? location.mode.processLocation
        : null;

      return options.createFeatures?.(block.data, processLocation) ?? [
        { icon: 'not_listed_location',
          label: 'Process' }
      ];
    },
    getLabel(block) {
      return options.getLabel?.(block.data) ?? null;
    }
  };
}

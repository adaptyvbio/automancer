import { GraphBlockMetrics, GraphLink, GraphRenderer, MenuEntryPath, ProtocolBlock, ProtocolBlockPath, React, Unit } from 'pr1';


export interface Block extends ProtocolBlock {
  children: ProtocolBlock[];
}

export interface BlockMetrics extends GraphBlockMetrics {
  children: GraphBlockMetrics[];
  childrenX: number[];
  linksCompact: boolean[];
}

export interface Location {
  child: unknown;
  index: number;
  interrupting: boolean;
  mode: LocationMode;
}

export enum LocationMode {
  Normal = 0,
  PausingChild = 1,
  PausingState = 2,
  Paused = 3
}

export interface Point {
  child: unknown | null;
  index: number;
}


const horizontalCellGap = 2;
const verticalCellGap = 1;

const namespace = 'sequence';

const graphRenderer: GraphRenderer<Block, BlockMetrics, Location> = {
  computeMetrics(block, ancestors, options) {
    let vertical = options.settings.vertical;
    let verticalFlag = vertical ? 1 : 0;

    let childrenMetrics = block.children.map((child, index) => options.computeMetrics(child, [...ancestors, block]));
    let linksCompact: boolean[] = [];

    let xs = 0;
    let wasSegment = false;

    let childrenX = childrenMetrics.map((childMetrics, childIndex) => {
      let child = block.children[childIndex];
      let isSegment = (child.namespace === 'segment');

      if (childIndex > 0) {
        let compact = options.settings.allowCompactActions && wasSegment && isSegment;
        linksCompact.push(compact);

        if (!compact) {
          xs += vertical
            ? verticalCellGap
            : horizontalCellGap;
        }
      }

      wasSegment = isSegment;

      let x = xs;

      xs += vertical
        ? childMetrics.size.height
        : childMetrics.size.width;

      return x;
    });

    let start = childrenMetrics[0].start;
    let end = childrenMetrics.at(-1).end;

    return {
      children: childrenMetrics,
      childrenX,
      linksCompact,

      start: {
        x: childrenX[0] * (1 - verticalFlag) + start.x,
        y: childrenX[0] * verticalFlag + start.y
      },
      end: {
        x: childrenX.at(-1) * (1 - verticalFlag) + end.x,
        y: childrenX.at(-1) * verticalFlag + end.y
      },
      size: vertical
        ? {
          width: Math.max(...childrenMetrics.map(({ size }) => size.width)),
          height: xs
        }
        : {
          width: xs,
          height: Math.max(...childrenMetrics.map(({ size }) => size.height))
        }
    };
  },
  render(block, path, metrics, position, state, options) {
    let vertical = options.settings.vertical;
    let verticalFlag = vertical ? 1 : 0;
    let linkDirection = vertical
      ? ('vertical' as const)
      : ('horizontal' as const);

    let children = block.children.map((child, childIndex) => {
      let childState = (state?.index === childIndex)
        ? state.child
        : null;

      let childX = metrics.childrenX[childIndex];
      let childSize = metrics.children[childIndex];

      let el = options.render(child, [...path, childIndex], childSize, {
        x: position.x + childX * (1 - verticalFlag),
        y: position.y + childX * verticalFlag
      }, childState, {
        attachmentEnd: (childIndex < block.children.length - 1)
          ? !metrics.linksCompact[childIndex]
          : options.attachmentEnd,
        attachmentStart: (childIndex > 0)
          ? !metrics.linksCompact[childIndex - 1]
          : options.attachmentStart
      });

      return <React.Fragment key={childIndex}>{el}</React.Fragment>;
    });

    return (
      <>
        {new Array(children.length - 1).fill(0).map((_, index) => {
          if (metrics.linksCompact[index]) {
            return null;
          }

          let start = metrics.children[index].end;
          let startX = metrics.childrenX[index];

          let end = metrics.children[index + 1].start;
          let endX = metrics.childrenX[index + 1];

          return (
            <GraphLink
              link={{
                start: {
                  direction: linkDirection,
                  x: position.x + start.x + startX * (1 - verticalFlag),
                  y: position.y + start.y + startX * verticalFlag
                },
                end: {
                  direction: linkDirection,
                  x: position.x + end.x + endX * (1 - verticalFlag),
                  y: position.y + end.y + endX * verticalFlag
                }
              }}
              settings={options.settings}
              key={index} />
          );
        })}
        {children}
      </>
    );
  }
};

function getChildBlock(block: Block, key: number) {
  return block.children[key];
}

function getActiveChildState(location: Location, _key: number) {
  return location.child;
}

function getChildrenExecutionKeys(_block: Block, state: Location) {
  return [state.index];
}

function getBlockClassLabel(_block: Block) {
  return 'Sequence block';
}

function createActiveBlockMenu(_block: Block, location: Location) {
  return [
    ...((location.mode !== LocationMode.Paused)
      ? [{ id: 'pause', name: 'Pause', icon: 'pause_circle', disabled: (location.mode !== LocationMode.Normal) }]
      : [{ id: 'resume', name: 'Resume', icon: 'play_circle' }]),
      { id: 'halt', name: 'Halt', icon: 'report' },
    { id: 'interrupt', name: 'Interrupt', icon: 'pan_tool', checked: location.interrupting }
  ];
}

function createDefaultPoint(block: Block, key: number, getChildPoint: (block: ProtocolBlock) => unknown) {
  return {
    child: getChildPoint(block.children[key]),
    index: key
  };
}

function onSelectBlockMenu(_block: Block, location: Location, path: MenuEntryPath) {
  switch (path.first()) {
    case 'halt':
      return { type: 'halt' };
    case 'interrupt':
      return { type: 'setInterrupt', value: !location.interrupting }
    case 'pause':
      return { 'type': 'pause' };
    case 'resume':
      return { 'type': 'resume' };
  }
}

function transformBlockLabel(block: Block, location: Location, label: string) {
  return `${label} (mode: ${LocationMode[location.mode]}, ${location.mode})`;
}


export default {
  createActiveBlockMenu,
  createDefaultPoint,
  getChildBlock,
  getActiveChildState,
  getBlockClassLabel,
  getChildrenExecutionKeys,
  graphRenderer,
  namespace,
  onSelectBlockMenu,
  transformBlockLabel
} satisfies Unit

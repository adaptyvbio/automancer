import { GraphLink, Host, MenuEntryPath, Plugin, PluginBlockImpl, Point as GeometryPoint, ProtocolBlockGraphRenderer, React } from 'pr1';
import { PluginName, ProtocolBlock, ProtocolBlockName } from 'pr1-shared';


export interface Block extends ProtocolBlock {
  children: ProtocolBlock[];
}

export interface Location {
  children: { 0: unknown; };
  index: number;
  interrupting: boolean;
}

export type Key = number;

export interface Point {
  child: unknown | null;
  index: number;
}


const horizontalCellGap = 2;
const verticalCellGap = 1;

const namespace = ('sequence' as PluginName);

const computeGraph: ProtocolBlockGraphRenderer<Block, Key, Location> = (block, path, ancestors, location, options, context) => {
  let vertical = options.settings.vertical;
  let verticalFlag = vertical ? 1 : 0;

  let childrenMetrics = block.children.map((child, childIndex) => options.computeMetrics(childIndex, location?.children[0]));
  let linksCompact: boolean[] = [];

  let inlineDirSize = Math.max(...childrenMetrics.map(({ size }) => vertical ? size.width : size.height));

  let currentBlockDirPos = 0;
  let wasCompactable = false;

  let childrenPos = childrenMetrics.map((childMetrics, childIndex): GeometryPoint => {
    if (childIndex > 0) {
      let compact = options.settings.allowCompactActions && wasCompactable && !!childMetrics.compactable;
      linksCompact.push(compact);

      if (!compact) {
        currentBlockDirPos += vertical
          ? verticalCellGap
          : horizontalCellGap;
      }
    }

    wasCompactable = !!childMetrics.compactable;

    let childBlockDirPos = currentBlockDirPos;

    currentBlockDirPos += vertical
      ? childMetrics.size.height
      : childMetrics.size.width;

    return {
      x: (inlineDirSize - childMetrics.size.width) * 0.5,
      y: childBlockDirPos
    };
  });

  let start = childrenMetrics[0].start;
  let end = childrenMetrics.at(-1).end;

  return {
    start: {
      x: childrenPos[0].x + start.x,
      y: childrenPos[0].y + start.y
    },
    end: {
      x: childrenPos.at(-1).x + end.x,
      y: childrenPos.at(-1).y + end.y
    },
    size: vertical
      ? {
        width: inlineDirSize,
        height: currentBlockDirPos
      }
      : {
        width: currentBlockDirPos,
        height: inlineDirSize
      },

    render(position, renderOptions) {
      let vertical = options.settings.vertical;
      let linkDirection = vertical
        ? ('vertical' as const)
        : ('horizontal' as const);

      let children = block.children.map((_child, childIndex) => {
        let childMetrics = childrenMetrics[childIndex];
        let childPos = childrenPos[childIndex];

        let el = childMetrics.render({
          x: position.x + childPos.x,
          y: position.y + childPos.y
        }, {
          attachmentEnd: (childIndex < block.children.length - 1)
            ? !linksCompact[childIndex]
            : renderOptions.attachmentEnd,
          attachmentStart: (childIndex > 0)
            ? !linksCompact[childIndex - 1]
            : renderOptions.attachmentStart
        });

        return <React.Fragment key={childIndex}>{el}</React.Fragment>;
      });

      return (
        <>
          {children}
          {new Array(children.length - 1).fill(0).map((_, childIndex) => {
            if (linksCompact[childIndex]) {
              return null;
            }

            let start = childrenMetrics[childIndex].end;
            let startPos = childrenPos[childIndex];

            let end = childrenMetrics[childIndex + 1].start;
            let endPos = childrenPos[childIndex + 1];

            return (
              <GraphLink
                link={{
                  start: {
                    direction: linkDirection,
                    x: position.x + start.x + startPos.x,
                    y: position.y + start.y + startPos.y
                  },
                  end: {
                    direction: linkDirection,
                    x: position.x + end.x + endPos.x,
                    y: position.y + end.y + endPos.y
                  }
                }}
                settings={options.settings}
                key={childIndex} />
            );
          })}
        </>
      );
    }
  };
};

function getChildBlock(block: Block, key: number) {
  return block.children[key];
}

function getActiveChildLocation(location: Location, _key: number) {
  return location.children[0];
}

function getChildrenExecutionRefs(block: Block, location: Location) {
  return [{ blockKey: location.index, executionId: 0 }];
}

function createActiveBlockMenu(block: Block, location: Location, options: { host: Host; }) {
  return [
    { id: 'halt', name: 'Skip', icon: 'double_arrow', disabled: false },
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
  }
}


export default {
  namespace,

  blocks: {
    ['_' as ProtocolBlockName]: {
      computeGraph,
      getChild(block, key) {
        return block.children[key];
      },
      getLabel(block) {
        return 'Sequence';
      },
      renderEntries(block, location) {
        return {
          entries: []
        };
      }
    } satisfies PluginBlockImpl<Block, Key, Location>
  }
} satisfies Plugin;

import { Protocol, ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';
import * as React from 'react';

import graphEditorStyles from '../../styles/components/graph-editor.module.scss';

import { FeatureGroup } from '../components/features';
import { OverflowableText } from '../components/overflowable-text';
import { Point, SideValues, Size } from '../geometry';
import { Host } from '../host';
import { ProtocolBlockGraphRenderer, ProtocolBlockGraphRendererMetrics } from '../interfaces/graph';
import { UnknownPluginBlockImpl } from '../interfaces/plugin';
import { FeatureGroupDef } from '../interfaces/unit';
import * as util from '../util';
import { ViewExecution } from '../views/execution';
import { MenuDef, MenuEntryPath } from './context-menu';
import { ContextMenuArea } from './context-menu-area';
import { Icon } from './icon';
import { getBlockName } from '../protocol';


export interface GraphEditorProps {
  execution?: ViewExecution;
  host: Host;
  protocol: Protocol | null;
  selectBlock(path: ProtocolBlockPath | null, options?: { showInspector?: unknown; }): void;
  selectedBlockPath: ProtocolBlockPath | null;
  location?: unknown;
  summary?: React.ReactNode;
}

export interface GraphEditorState {
  animatingView: boolean;
  offset: Point;
  size: Size | null;
}

export class GraphEditor extends React.Component<GraphEditorProps, GraphEditorState> {
  controller = new AbortController();
  initialized = false;
  offsetBoundaries: { min: Point; max: Point; } | null = null;
  refContainer = React.createRef<HTMLDivElement>();
  settings: GraphRenderSettings | null = null;

  observer = new ResizeObserver((_entries) => {
    if (!this.initialized) {
      this.initialized = true;
      this.setSize();
    } else {
      this.observerDebounced();
    }
  });

  observerDebounced = util.debounce(500, () => {
    this.setSize();

    // this.setState((state) => ({
    //   offset: this.getBoundOffset(state.offset)
    // }));
  }, { signal: this.controller.signal });

  constructor(props: GraphEditorProps) {
    super(props);

    this.state = {
      animatingView: false,
      offset: { x: 0, y: 0 },
      size: null
    };
  }

  clearSize() {
    this.setState((state) => state.size ? { size: null } : null);
  }

  setSize() {
    let container = this.refContainer.current!;
    let rect = container.getBoundingClientRect();

    this.setState({
      size: {
        width: rect.width,
        height: rect.height
      }
    });
  }

  reveal() {
    let settings = this.settings!;

    this.setState({
      offset: {
        x: settings.cellPixelSize * 10,
        y: settings.cellPixelSize * 0
      }
    });
  }

  getBoundOffset(point: Point): Point {
    util.assert(this.offsetBoundaries);

    return {
      x: Math.min(Math.max(point.x, this.offsetBoundaries.min.x), this.offsetBoundaries.max.x),
      y: Math.min(Math.max(point.y, this.offsetBoundaries.min.y), this.offsetBoundaries.max.y)
    };
  }

  selectBlock(path: ProtocolBlockPath | null, options?: { showInspector?: unknown; }) {
    this.props.selectBlock(path, options);
  }

  componentDidMount() {
    let container = this.refContainer.current!;

    // This will immediately call setSize().
    this.observer.observe(container);

    this.controller.signal.addEventListener('abort', () => {
      this.observer.disconnect();
    });

    container.addEventListener('wheel', (event) => {
      event.preventDefault();

      if (this.offsetBoundaries) {
        this.setState((state) => ({
          offset: this.getBoundOffset({
            x: state.offset.x + event.deltaX * 1,
            y: state.offset.y + event.deltaY * 1
          })
        }));
      }
    }, { passive: false, signal: this.controller.signal });


    let styles = this.refContainer.current!.computedStyleMap();
    let cellPixelSize = CSSNumericValue.parse(styles.get('--cell-size')!).value;
    let nodeBorderWidth = CSSNumericValue.parse(styles.get('--node-border-width')!).value;
    let nodeHeaderHeight = CSSNumericValue.parse(styles.get('--node-header-height')!).value;
    let nodePadding = CSSNumericValue.parse(styles.get('--node-padding')!).value;
    let nodeBodyPaddingY = CSSNumericValue.parse(styles.get('--node-body-padding-y')!).value;

    this.settings = {
      editor: this,

      allowCompactActions: true,
      cellPixelSize,
      nodeBodyPaddingY,
      nodeBorderWidth,
      nodeHeaderHeight,
      nodePadding,
      vertical: true
    };
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  render() {
    if (!this.state.size) {
      return <div className={graphEditorStyles.root} ref={this.refContainer} />;
    }

    let context = { host: this.props.host };
    let settings = this.settings!;
    let renderedTree!: React.ReactNode | null;

    let getBlockImpl = (block: ProtocolBlock) => this.props.host.plugins[block.namespace].blocks[block.name];

    if (this.props.protocol?.root) {
      // console.log(this.props.tree);
      // console.log('---');

      let computeGraph = (
        groupRootBlock: ProtocolBlock,
        path: ProtocolBlockPath,
        ancestors: ProtocolBlock[],
        location: unknown
      ): ProtocolBlockGraphRendererMetrics => {
        // let blockImpl = getBlockImpl(block);

        let currentBlock = groupRootBlock;
        let currentBlockImpl: UnknownPluginBlockImpl;
        let currentBlockPath = path;

        let groupBlocks: ProtocolBlock[] = [];
        let groupName: string | null = null;

        while (true) {
          currentBlockImpl = getBlockImpl(currentBlock);
          let currentBlockName = getBlockName(currentBlock);

          if (currentBlockImpl.computeGraph || (currentBlockName && groupName)) {
            break;
          }

          if (currentBlockName) {
            groupName = currentBlockName;
          }

          groupBlocks.push(currentBlock);

          let key = 0;
          currentBlock = currentBlockImpl.getChild!(currentBlock, key);
          currentBlockPath.push(key);
        }

        let defaultLabelComponents = groupBlocks.flatMap((block) => {
          return getBlockImpl(block).getLabel?.(block) ?? [];
        });

        if ((groupBlocks.length > 0) && (groupName || (defaultLabelComponents.length > 0))) {
          return computeContainerBlockGraph(({
            label: (groupName ?? defaultLabelComponents.join(', '))
          } as any), currentBlockPath.slice(0, -1), [], null, {
            settings,
            computeMetrics(key, location) {
              return computeGraph(currentBlock, currentBlockPath, [...ancestors, ...groupBlocks], null);
            },
          }, context);
        }

        return currentBlockImpl.computeGraph!(currentBlock, currentBlockPath, [...ancestors, ...groupBlocks], location, {
          settings,
          computeMetrics: (key, childLocation: unknown | null) => {
            let childBlock = currentBlockImpl.getChild!(currentBlock, key);
            return computeGraph(childBlock, [...currentBlockPath, key], [...ancestors, currentBlock], childLocation);
          }
        }, context);
      };

      let origin: Point = { x: 1, y: 1 };
      let treeMetrics = computeGraph(this.props.protocol.root, [], [], this.props.location ?? null);

      renderedTree = treeMetrics.render(origin, {
        attachmentEnd: false,
        attachmentStart: false
      });

      let margin = {
        bottom: 2,
        left: 1,
        right: 1,
        top: 1
      } satisfies SideValues;

      let min = {
        x: (origin.x - margin.left) * settings.cellPixelSize,
        y: (origin.y - margin.top) * settings.cellPixelSize
      } satisfies Point;

      this.offsetBoundaries = {
        min,
        max: {
          x: Math.max(min.x, (origin.x + treeMetrics.size.width + margin.right) * settings.cellPixelSize - this.state.size.width),
          y: Math.max(min.y, (origin.y + treeMetrics.size.height + margin.bottom) * settings.cellPixelSize - this.state.size.height)
        }
      };
    } else {
      renderedTree = null;
    }

    let frac = (x: number) => (x - Math.floor(x));
    let offsetX = this.state.offset.x;
    let offsetY = this.state.offset.y;

    return (
      <div className={graphEditorStyles.root} ref={this.refContainer} /* tabIndex={-1} onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (this.props.selectedBlockPath) {
          let currentBlock = this.props.tree!;
          let lineBlocks: ProtocolBlock[] = [];

          for (let key of this.props.selectedBlockPath) {
            let currentBlockImpl = getBlockImpl(currentBlock);
            currentBlock = currentBlockImpl.getChild!(currentBlock, key);
            lineBlocks.push(currentBlock);
          }

          for (let [blockIndex, block] of lineBlocks.slice().reverse().entries()) {
            let blockImpl = getBlockImpl(block);

            let key: unknown;

            switch (event.key) {
              case 'ArrowDown':
                key = blockImpl.getAdjacentBlockKey?.(block, 1) ?? null;
                break;
              case 'ArrowUp':
                key = blockImpl.getAdjacentBlockKey?.(block, -1) ?? null;
                break;
            }

            if (key !== null) {
              this.props.selectBlock([...this.props.selectedBlockPath.slice(0, blockIndex), key]);

              break;
            }
          }
        }
      }} */>
        <svg
          viewBox={`0 0 ${this.state.size.width} ${this.state.size.height}`}
          className={util.formatClass(graphEditorStyles.svg, { '_animatingView': this.state.animatingView })}
          style={{
            width: `${this.state.size.width}px`,
            height: `${this.state.size.height}px`
          }}
          onClick={() => {
            this.props.selectBlock(null);
          }}>
          <defs>
            <pattern x={settings.cellPixelSize * 0.5} y={settings.cellPixelSize * 0.5} width={settings.cellPixelSize} height={settings.cellPixelSize} patternUnits="userSpaceOnUse" id="grid">
              <circle cx={settings.cellPixelSize * 0.5} cy={settings.cellPixelSize * 0.5} r="1.5" fill="#d8d8d8" />
            </pattern>
          </defs>

          <rect
            x="0" y="0"
            width={(this.state.size.width + settings.cellPixelSize)}
            height={(this.state.size.height + settings.cellPixelSize)}
            fill="url(#grid)"
            transform={`translate(${-frac(offsetX / settings.cellPixelSize) * settings.cellPixelSize} ${-frac(offsetY / settings.cellPixelSize) * settings.cellPixelSize})`} />
          <g transform={`translate(${-offsetX} ${-offsetY})`} onTransitionEnd={() => {
            this.setState({ animatingView: false });
          }}>
            {renderedTree}
          </g>
        </svg>
        <div className={graphEditorStyles.actionsRoot}>
          <div className={graphEditorStyles.actionsGroup}>
            <button type="button" className={graphEditorStyles.actionsButton}><Icon name="center_focus_strong" className={graphEditorStyles.actionsIcon} /></button>
          </div>
          {/* <div className={graphEditorStyles.actionsGroup}>
            <button type="button" className={graphEditorStyles.actionsButton}><Icon name="add" className={graphEditorStyles.actionsIcon} /></button>
            <button type="button" className={graphEditorStyles.actionsButton} disabled><Icon name="remove" className={graphEditorStyles.actionsIcon} /></button>
          </div> */}
        </div>
        {this.props.summary && (
          <div className={graphEditorStyles.summary}>
            {this.props.summary}
          </div>
        )}
      </div>
    );
  }
}


export interface GraphRenderSettings {
  editor: GraphEditor;

  allowCompactActions: boolean;
  cellPixelSize: number;
  nodeBodyPaddingY: number;
  nodeBorderWidth: number;
  nodeHeaderHeight: number;
  nodePadding: number;
  vertical: boolean;
}


type GraphNodeId = string;

interface GraphNodeDef {
  id: GraphNodeId;
  title: {
    alternate?: boolean;
    value: string;
  } | null;
  features: FeatureGroupDef;
  position: {
    x: number;
    y: number;
  };
}

export function GraphNode(props: {
  active?: unknown;
  autoMove: unknown;
  cellSize: Size;
  createMenu(): MenuDef;
  node: GraphNodeDef;
  onMouseDown?(event: React.MouseEvent): void;
  onSelectBlockMenu(path: MenuEntryPath): void;
  path: ProtocolBlockPath;
  selected?: unknown;
  settings: GraphRenderSettings;
}) {
  let { node, settings } = props;

  // let host = props.settings.editor.props.host;
  // let blockAnalysis = analyzeBlockPath(props.settings.editor.props.protocol!, props.path, { host });

  return (
    <g
      className={util.formatClass(graphEditorStyles.noderoot, { '_automove': props.autoMove })}
      transform={`translate(${settings.cellPixelSize * node.position.x} ${settings.cellPixelSize * node.position.y})`}>
      <foreignObject
        x="0"
        y="0"
        width={settings.cellPixelSize * props.cellSize.width}
        height={settings.cellPixelSize * props.cellSize.height}
        className={graphEditorStyles.nodeobject}>
        <ContextMenuArea
          createMenu={props.createMenu}
          onSelect={props.onSelectBlockMenu}>
          <div
            className={util.formatClass(graphEditorStyles.node, {
              '_active': props.active,
              '_selected': props.selected
            })}
            onClick={(event) => {
              event.stopPropagation();
              settings.editor.selectBlock(props.path);
            }}
            onDoubleClick={() => {
              settings.editor.selectBlock(props.path, { showInspector: true });
            }}
            onMouseDown={props.onMouseDown}>
            {node.title && (
              <div className={graphEditorStyles.header}>
                <div className={graphEditorStyles.title} title={node.title.value}>{node.title.alternate ? <i>{node.title.value}</i> : node.title.value}</div>
              </div>
            )}
            <div className={graphEditorStyles.body}>
              <FeatureGroup group={node.features} />
            </div>
          </div>
        </ContextMenuArea>
      </foreignObject>
    </g>
  );
}


export interface GraphLinkDef {
  start: GraphLinkPoint;
  end: GraphLinkPoint;
}

export interface GraphLinkPoint extends Point {
  direction: 'horizontal' | 'vertical' | null;
}

export function GraphLink(props: {
  link: GraphLinkDef;
  settings: GraphRenderSettings;
}) {
  let { link, settings } = props;

  let startX = settings.cellPixelSize * link.start.x;
  let startY = settings.cellPixelSize * link.start.y;

  switch (link.start.direction) {
    case 'horizontal':
      startX -= settings.nodePadding;
      startY += settings.cellPixelSize;
      break;

    case 'vertical':
      startX += settings.nodePadding + (settings.nodeHeaderHeight * 0.8);
      startY -= settings.nodePadding;
      break;
  }

  let endX = settings.cellPixelSize * link.end.x;
  let endY = settings.cellPixelSize * link.end.y;

  switch (link.end.direction) {
    case 'horizontal':
      endX += settings.nodePadding;
      endY += settings.cellPixelSize;
      break;
    case 'vertical':
      endX += settings.nodePadding + (settings.nodeHeaderHeight * 0.8);
      endY += settings.nodePadding;
      break;
  }

  let d = `M${startX} ${startY}`;

  let curveHalfHeight = settings.cellPixelSize * 0.5;

  let midX = (startX + endX) * 0.5;
  let midY = (startY + endY) * 0.5;

  d += `L${startX} ${midY - curveHalfHeight}Q${startX} ${midY} ${midX} ${midY}Q${endX} ${midY} ${endX} ${midY + curveHalfHeight}L${endX} ${endY}`;

  return (
    <>
      <path d={d} className={graphEditorStyles.link} />
      <circle
        cx={startX}
        cy={startY}
        r="5"
        fill="#fff"
        stroke="#000"
        strokeWidth="2" />
      <circle
        cx={endX}
        cy={endY}
        r="5"
        fill="#fff"
        stroke="#000"
        strokeWidth="2" />
    </>
  );
}


export function GraphNodeContainer(props: {
  cellSize: Size;
  path: ProtocolBlockPath;
  position: Point;
  settings: GraphRenderSettings;
  title: React.ReactNode;
}) {
  let { settings } = props;

  return (
    <foreignObject
      x={settings.cellPixelSize * props.position.x}
      y={settings.cellPixelSize * props.position.y}
      width={settings.cellPixelSize * props.cellSize.width}
      height={settings.cellPixelSize * props.cellSize.height}
      className={graphEditorStyles.groupobject}>
        <div
          className={util.formatClass(graphEditorStyles.group, { '_selected': util.deepEqual(props.path, settings.editor.props.selectedBlockPath) })}
          onClick={(event) => {
            event.stopPropagation();
            settings.editor.selectBlock(props.path);
          }}>
          <OverflowableText>
            <div className={graphEditorStyles.grouplabel}>{props.title}</div>
          </OverflowableText>
        </div>
      </foreignObject>
  );
}


const computeContainerBlockGraph: ProtocolBlockGraphRenderer<ProtocolBlock & {
  label: string;
}, 0> = (block, path, ancestors, location, options, context) => {
  let childMetrics = options.computeMetrics(0, null);

  let size = {
    width: childMetrics.size.width + 2,
    height: childMetrics.size.height + 3
  };

  return {
    start: {
      x: 0,
      y: 0
    },
    end: {
      x: 0,
      y: size.height
    },
    size,

    render(position, renderOptions) {
      return (
        <>
          <GraphNodeContainer
            cellSize={size}
            path={path}
            position={position}
            settings={options.settings}
            title={block.label} />
          {childMetrics.render({
            x: position.x + 1,
            y: position.y + 2
          }, renderOptions)}
        </>
      );
    }
  }
};

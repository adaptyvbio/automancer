import { Map as ImMap, List } from 'immutable';
import { Protocol, ProtocolBlock, ProtocolBlockPath } from 'pr1-shared';
import { Component, ReactNode, createRef } from 'react';

import graphEditorStyles from '../../styles/components/graph-editor.module.scss';

import { FeatureList } from '../components/features';
import { OverflowableText } from '../components/overflowable-text';
import { Point, RectSurface, SideValues, Size, squareDistance, squareLength } from '../geometry';
import { Host } from '../host';
import { ProtocolBlockGraphRenderer, ProtocolBlockGraphRendererMetrics } from '../interfaces/graph';
import { GlobalContext, UnknownPluginBlockImpl } from '../interfaces/plugin';
import { FeatureGroupDef } from '../interfaces/unit';
import { getBlockImpl, getBlockName } from '../protocol';
import * as util from '../util';
import { Icon } from './icon';
import { Application } from '../application';


export interface GraphEditorProps {
  app: Application;
  host: Host;
  protocolRoot: ProtocolBlock | null;
  selectBlock(path: ProtocolBlockPath | null, options?: { showInspector?: unknown; }): void;
  selection: {
    blockPath: ProtocolBlockPath;
    observed: boolean;
  } | null;
  location?: unknown;
  summary?: ReactNode;
}

export interface GraphEditorState {
  self: GraphEditor;

  animatingView: boolean;
  offset: Point;
  oldSelection: GraphEditorProps['selection'] | null;
  size: Size | null;
  trackSelectedBlock: boolean;
}

export class GraphEditor extends Component<GraphEditorProps, GraphEditorState> {
  private controller = new AbortController();
  private initialized = false;
  private pool = new util.Pool();
  private refContainer = createRef<HTMLDivElement>();
  private settings: GraphRenderSettings | null = null;

  private lastComputation: {
    element: ReactNode;
    margin: SideValues;
    nodeSurfaces: ImMap<List<number>, RectSurface>;
    solidMargin: SideValues;
    worldSize: Size;
  } | null = null;

  private observer = new ResizeObserver((_entries) => {
    if (!this.initialized) {
      this.initialized = true;
      this.setSize();
    } else {
      this.observerDebounced();
    }
  });

  private observerDebounced = util.debounce(500, () => {
    this.setSize();

    // this.setState((state) => ({
    //   offset: this.getBoundOffset(state.offset)
    // }));
  }, { signal: this.controller.signal });

  constructor(props: GraphEditorProps) {
    super(props);

    this.state = {
      self: this,

      animatingView: false,
      offset: { x: 0, y: 0 },
      oldSelection: null,
      size: null,
      trackSelectedBlock: false
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

  getBoundOffset(point: Point, state: GraphEditorState = this.state): Point {
    util.assert(this.lastComputation);
    util.assert(state.size);

    return {
      x: Math.min(Math.max(point.x, 0), this.lastComputation.worldSize.width - state.size.width),
      y: Math.min(Math.max(point.y, 0), this.lastComputation.worldSize.height - state.size.height)
    };
  }

  selectBlock(path: ProtocolBlockPath | null, options?: { showInspector?: unknown; }) {
    this.props.selectBlock(path, options);
  }

  override componentDidMount() {
    let container = this.refContainer.current!;

    // This will immediately call setSize().
    this.observer.observe(container);

    this.controller.signal.addEventListener('abort', () => {
      this.observer.disconnect();
    });

    container.addEventListener('wheel', (event) => {
      event.preventDefault();

      if (this.lastComputation && this.state.size) {
        this.setState((state) => ({
          offset: this.getBoundOffset({
            x: state.offset.x + event.deltaX * 1,
            y: state.offset.y + event.deltaY * 1
          }),
          trackSelectedBlock: (state.trackSelectedBlock && !this.props.selection!.observed)
        }));
      }

      this.setState({
        animatingView: false
      });
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


    this.props.app.shortcutManager.attach('Escape', () => {
      if (!this.props.selection || this.props.selection.observed) {
        return false;
      }

      this.selectBlock(null);
      return true;
    }, { signal: this.controller.signal });

    this.props.app.shortcutManager.attach(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'], (event, properties) => {
      if (this.lastComputation) {
        let currentPath = this.props.selection && List(this.props.selection.blockPath);
        let originPosition = currentPath && this.lastComputation.nodeSurfaces.get(currentPath)!.center;

        let minDistance = Infinity;
        let minPath: List<number> | null = null;

        for (let [path, surface] of this.lastComputation.nodeSurfaces) {
          if (path.equals(currentPath)) {
            continue;
          }

          let distance: number;
          let position = surface.center;

          if (originPosition) {
            if ((properties.key === 'ArrowDown') && !(position.y > originPosition.y)) {
              continue;
            }

            if ((properties.key === 'ArrowUp') && !(position.y < originPosition.y)) {
              continue;
            }

            if ((properties.key === 'ArrowRight') && !(position.x > originPosition.x)) {
              continue;
            }

            if ((properties.key === 'ArrowLeft') && !(position.x < originPosition.x)) {
              continue;
            }

            distance = squareDistance(position, originPosition);
          } else {
            if (properties.key === 'ArrowDown') {
              distance = squareLength(position);
            } else if (properties.key === 'ArrowUp') {
              distance = -squareLength(position);
            } else {
              distance = Infinity;
            }
          }

          if (distance < minDistance) {
            minDistance = distance;
            minPath = path;
          }
        }

        if (minPath) {
          this.props.selectBlock(minPath.toArray());
        }
      }
    }, { signal: this.controller.signal });

    this.props.app.shortcutManager.attach(['PageDown', 'PageUp'], (event, properties) => {
      if (this.lastComputation) {
        let result = List(this.lastComputation.nodeSurfaces).maxBy(([path, surface]) => {
          return surface.center.y * ((properties.key === 'PageDown') ? 1 : -1);
        });

        if (result) {
          let [path, surface] = result;
          this.props.selectBlock(path.toArray());
        }
      }
    }, { signal: this.controller.signal });
  }

  override componentWillUnmount() {
    this.controller.abort();
  }

  private compute(props: GraphEditorProps, state: GraphEditorState) {
    if (props.protocolRoot && state.size) {
      let globalContext: GlobalContext = {
        app: this.props.app,
        host: props.host,
        pool: this.pool
      };

      let settings = this.settings!;

      // console.log(this.props.tree);
      // console.log('---');

      let computeGraph = (
        groupRootBlock: ProtocolBlock,
        path: ProtocolBlockPath,
        ancestors: ProtocolBlock[],
        location: unknown
      ): ProtocolBlockGraphRendererMetrics => {
        let currentBlock = groupRootBlock;
        let currentBlockImpl: UnknownPluginBlockImpl;
        let currentBlockPath = path;
        let currentLocation = location;

        let groupBlocks: ProtocolBlock[] = [];
        let groupName: string | null = null;

        while (true) {
          currentBlockImpl = getBlockImpl(currentBlock, globalContext);
          let currentBlockName = getBlockName(currentBlock);

          if (currentBlockImpl.computeGraph || (currentBlockName && groupName)) {
            break;
          }

          if (currentBlockName) {
            groupName = currentBlockName;
          }

          groupBlocks.push(currentBlock);

          let key = 0;
          currentBlock = currentBlockImpl.getChildren!(currentBlock, globalContext)[key].block;
          currentBlockPath.push(key);
          currentLocation = currentLocation && (currentBlockImpl.getChildrenExecution!(currentBlock, currentLocation, globalContext)?.[key]?.location ?? null);
        }

        let defaultLabelComponents = groupBlocks.flatMap((block) => {
          return getBlockImpl(block, globalContext).getLabel?.(block) ?? [];
        });

        if ((groupBlocks.length > 0) && (groupName || (defaultLabelComponents.length > 0))) {
          return computeContainerBlockGraph(({
            label: (groupName ?? defaultLabelComponents.join(', '))
          } as any), currentBlockPath.slice(0, -1), [], null, {
            settings,
            computeMetrics(key) {
              return computeGraph(currentBlock, currentBlockPath, [...ancestors, ...groupBlocks], currentLocation);
            },
          }, globalContext);
        }

        return currentBlockImpl.computeGraph!(currentBlock, currentBlockPath, [...ancestors, ...groupBlocks], currentLocation, {
          settings,
          computeMetrics: (key) => {
            let childBlock = currentBlockImpl.getChildren!(currentBlock, globalContext)[key].block;
            let childLocation = currentLocation && (currentBlockImpl.getChildrenExecution!(currentBlock, currentLocation, globalContext)?.[key]?.location ?? null);

            return computeGraph(childBlock, [...currentBlockPath, key], [...ancestors, currentBlock], childLocation);
          }
        }, globalContext);
      };


      // Render graph

      let margin: SideValues = {
        bottom: (this.props.summary ? 2 : 1),
        left: 1,
        right: 1,
        top: 1
      };

      let solidMargin: SideValues = {
        bottom: (this.props.summary ? 2 : 0),
        left: 0,
        right: 0,
        top: 0
      };

      let origin: Point = {
        x: margin.left,
        y: margin.top
      };

      let treeMetrics = computeGraph(props.protocolRoot, [], [], props.location ?? null);

      let rendered = treeMetrics.render(origin, {
        attachmentEnd: false,
        attachmentStart: false
      });

      let nodeSurfaces = ImMap(rendered.nodes.map((nodeInfo) => [
        List(nodeInfo.path),
        nodeInfo.surface
      ]));

      let worldSize = {
        width: Math.max(state.size.width, (treeMetrics.size.width + margin.left + margin.right) * settings.cellPixelSize),
        height: Math.max(state.size.height, (treeMetrics.size.height + margin.top + margin.bottom) * settings.cellPixelSize)
      };

      this.lastComputation = {
        element: rendered.element,
        margin,
        nodeSurfaces,
        solidMargin,
        worldSize
      };
    } else {
      this.lastComputation = null;
    }

    return this.lastComputation;
  }

  override render() {
    if (!this.state.size) {
      return <div className={graphEditorStyles.root} ref={this.refContainer} />;
    }

    let computation = this.compute(this.props, this.state);

    let settings = this.settings!;

    let offsetX = this.state.offset.x;
    let offsetY = this.state.offset.y;

    return (
      <div className={graphEditorStyles.root} ref={this.refContainer} tabIndex={-1}>
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

          <g transform={`translate(${-offsetX} ${-offsetY})`} onTransitionEnd={() => {
            this.setState({ animatingView: false });
          }}>
            <rect
              x="0" y="0"
              width={computation?.worldSize.width ?? this.state.size.width}
              height={computation?.worldSize.height ?? this.state.size.height}
              fill="url(#grid)" />
            {this.lastComputation?.element}
          </g>
        </svg>
        <div className={graphEditorStyles.actionsRoot}>
          <div className={graphEditorStyles.actionsGroup}>
            {!!this.props.location && (
              <button
                type="button"
                className={util.formatClass(graphEditorStyles.actionsButton, { '_active': (this.state.trackSelectedBlock && this.props.selection!.observed) })}
                onClick={() => {
                  this.setState({ trackSelectedBlock: !(this.state.trackSelectedBlock && this.props.selection!.observed) });
                  this.props.selectBlock(null);
                }}>
                <Icon name="enable" className={graphEditorStyles.actionsIcon} />
              </button>
            )}
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

  static getDerivedStateFromProps(props: GraphEditorProps, state: GraphEditorState): Partial<GraphEditorState> | null {
    let computation = state.self.compute(props, state);

    if (computation && state.size && state.trackSelectedBlock && props.selection?.observed) {
      if (computation) {
        let surface = state.self.lastComputation!.nodeSurfaces.get(List(props.selection.blockPath));

        if (surface) {
          let settings = state.self.settings!;
          let idealOffset: Point = {
            x: Math.min((surface.position.x - computation.margin.left) * settings.cellPixelSize, computation.worldSize.width - state.size.width),
            y: Math.min((surface.position.y - computation.margin.top) * settings.cellPixelSize, computation.worldSize.height - state.size.height)
          };

          return {
            animatingView: true,
            offset: idealOffset
          };
        }
      }
    } else if (computation && state.size && props.selection && (props.selection !== state.oldSelection)) {
      let surface = computation.nodeSurfaces.get(List(props.selection.blockPath));
      let settings = state.self.settings!;

      if (surface) {
        let newOffset: Point = { ...state.offset };

        if ((surface.position.y + computation.solidMargin.top) * settings.cellPixelSize < state.offset.y) {
          newOffset.y = (surface.position.y - computation.margin.top) * settings.cellPixelSize;
        }

        if ((surface.position.y + surface.size.height + computation.solidMargin.bottom) * settings.cellPixelSize > state.offset.y + state.size.height) {
          newOffset.y = (surface.position.y + surface.size.height + computation.margin.bottom) * settings.cellPixelSize - state.size.height;
        }

        return {
          animatingView: true,
          offset: newOffset,
          oldSelection: props.selection
        };
      }
    }

    return null;
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
    text: string;
    value: ReactNode;
  } | null;
  features: FeatureGroupDef;
  position: {
    x: number;
    y: number;
  };
}

export function GraphNode(props: {
  activity?: 'active' | 'default' | 'paused';
  autoMove: unknown;
  cellSize: Size;
  node: GraphNodeDef;
  path: ProtocolBlockPath;
  settings: GraphRenderSettings;
  status: 'default' | 'observed' | 'selected';
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
        <div
          className={graphEditorStyles.node}
          data-activity={props.activity}
          data-status={props.status}
          onClick={(event) => {
            event.stopPropagation();
            settings.editor.selectBlock(props.path);
          }}
          onDoubleClick={() => {
            settings.editor.selectBlock(props.path, { showInspector: true });
          }}>
          {node.title && (
            <div className={graphEditorStyles.header}>
              <div className={graphEditorStyles.title} title={node.title.text}>{node.title.value}</div>
            </div>
          )}
          <div className={graphEditorStyles.body}>
            <FeatureList features={node.features} />
          </div>
        </div>
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
  title: ReactNode;
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
          className={graphEditorStyles.group}
          // className={util.formatClass(graphEditorStyles.group, { '_selected': util.deepEqual(props.path, settings.editor.props.selectedBlockPath) })}
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
  let childMetrics = options.computeMetrics(0);

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
      let offset: Point = {
        x: position.x + 1,
        y: position.y + 2
      };

      let childRender = childMetrics.render(offset, renderOptions)

      return {
        element: (
          <>
            <GraphNodeContainer
              cellSize={size}
              path={path}
              position={position}
              settings={options.settings}
              title={block.label} />
            {childRender.element}
          </>
        ),
        nodes: childRender.nodes
      };
    }
  }
};

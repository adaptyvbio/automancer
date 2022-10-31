import { Set as ImSet } from 'immutable';
import * as React from 'react';

import { Icon } from './icon';
import * as util from '../util';


export interface GraphEditorProps {

}

export interface GraphEditorState {
  nodes: NodeDef[];
  selectedNodeIds: ImSet<NodeId>;
  size: {
    width: number;
    height: number;
  } | null;
}

export class GraphEditor extends React.Component<GraphEditorProps, GraphEditorState> {
  action: {
    type: 'select';
    singleTargetId: NodeId | null;
    startPoint: {
      x: number;
      y: number;
    };
    targets: {
      id: NodeId;
      startPosition: {
        x: number;
        y: number;
      };
    }[];
  } | {
    type: 'move';
    startPoint: {
      x: number;
      y: number;
    };
    targets: {
      id: NodeId;
      startPosition: {
        x: number;
        y: number;
      };
    }[];
  } | null = null;

  mouseDown = false;
  refContainer = React.createRef<HTMLDivElement>();

  constructor(props: GraphEditorProps) {
    super(props);

    this.state = {
      nodes: [
        {
          id: '0',
          title: 'Alpha',
          features: [
            { icon: 'hourglass_empty', label: '10 min' },
            { icon: 'air', label: 'Neutravidin' }
          ],
          position: {
            x: 3,
            y: 5
          }
        },
        {
          id: '1',
          title: 'Beta',
          features: [
            { icon: 'hourglass_empty', label: '10 min' },
            { icon: 'air', label: 'Neutravidin' }
          ],
          position: {
            x: 18,
            y: 3
          }
        },
        {
          id: '2',
          title: 'Gamma',
          features: [
            { icon: 'hourglass_empty', label: '10 min' },
            { icon: 'air', label: 'Neutravidin' }
          ],
          position: {
            x: 18,
            y: 8
          }
        }
      ],
      selectedNodeIds: ImSet(),
      size: null
    };
  }

  componentDidMount() {
    let container = this.refContainer.current!;
    let rect = container.getBoundingClientRect();

    this.setState({
      size: {
        width: rect.width,
        height: rect.height
      }
    });
  }

  render() {
    if (!this.state.size) {
      return <div className="geditor-root" ref={this.refContainer} />;
    }

    let styles = this.refContainer.current!.computedStyleMap();
    // console.log(Object.fromEntries(Array.from(styles)));
    let cellSize = CSSNumericValue.parse(styles.get('--cell-size')!).value;
    let nodeHeaderHeight = CSSNumericValue.parse(styles.get('--node-header-height')!).value;
    let nodePadding = CSSNumericValue.parse(styles.get('--node-padding')!).value;

    let cellCountX = Math.floor(this.state.size.width / cellSize);
    let cellCountY = Math.floor(this.state.size.height / cellSize);

    let nodeWidth = Math.round((220 + nodePadding * 2) / cellSize);
    let nodeHeight = Math.ceil((nodeHeaderHeight + 80 + nodePadding * 2) / cellSize);

    // let link = {
    //   start: { x: 11, y: 6 },
    //   end: { x: 18, y: 3 }
    // };

    let settings = {
      cellSize,
      nodeHeaderHeight,
      nodePadding,
      nodeWidth,
      nodeHeight
    };

    return (
      <div className="geditor-root" ref={this.refContainer}
        onMouseMove={(event) => {
          if (this.action?.type === 'select') {
            this.action = {
              type: 'move',
              startPoint: this.action.startPoint,
              targets: this.action.targets
            };
          }

          if (this.action?.type === 'move') {
            let dx = event.clientX - this.action.startPoint.x;
            let dy = event.clientY - this.action.startPoint.y;

            this.setState((state) => {
              if (!this.action) {
                return null;
              }

              return {
                nodes: state.nodes.map((node) => {
                  let target = this.action!.targets.find((target) => target.id === node.id);

                  if (!target) {
                    return node;
                  }

                  return {
                    ...node,
                    position: {
                      x: target.startPosition.x + dx / settings.cellSize,
                      y: target.startPosition.y + dy / settings.cellSize
                    }
                  };
                })
              };
            });
          }
        }}
        onMouseUp={(event) => {
          if ((this.action?.type === 'select') && (this.action.singleTargetId)) {
            this.setState({
              selectedNodeIds: ImSet.of(this.action.singleTargetId)
            });
          }

          if (this.action?.type === 'move') {
            let dx = event.clientX - this.action.startPoint.x;
            let dy = event.clientY - this.action.startPoint.y;

            let action = this.action;

            this.setState((state) => {
              return {
                nodes: state.nodes.map((node) => {
                  let target = action.targets.find((target) => target.id === node.id);

                  if (!target) {
                    return node;
                  }

                  return {
                    ...node,
                    position: {
                      x: target.startPosition.x + Math.round(dx / settings.cellSize),
                      y: target.startPosition.y + Math.round(dy / settings.cellSize)
                    }
                  };
                })
              };
            });
          }

          this.action = null;
        }}>
        <svg viewBox={`0 0 ${this.state.size.width} ${this.state.size.height}`} className="geditor-svg">
          <g>
            {new Array(cellCountX * cellCountY).fill(0).map((_, index) => {
              let x = index % cellCountX;
              let y = Math.floor(index / cellCountX);
              return <circle cx={x * cellSize} cy={y * cellSize} r="1.5" fill="#d8d8d8" key={index} />;
            })}
          </g>

          <Link
            autoMove={this.action?.type !== 'move'}
            link={{
              start: {
                x: this.state.nodes[0].position.x + nodeWidth,
                y: this.state.nodes[0].position.y + 1
              },
              end: {
                x: this.state.nodes[2].position.x,
                y: this.state.nodes[2].position.y + 1
              }
            }}
            settings={settings} />
          <Link
            autoMove={this.action?.type !== 'move'}
            link={{
              start: {
                x: this.state.nodes[0].position.x + nodeWidth,
                y: this.state.nodes[0].position.y + 1
              },
              end: {
                x: this.state.nodes[1].position.x,
                y: this.state.nodes[1].position.y + 1
              }
            }}
            settings={settings} />

          <g
            className="geditor-group"
            transform={`translate(${settings.cellSize * 1} ${settings.cellSize * 1})`}>
            <foreignObject
              x="0"
              y="0"
              width={settings.cellSize * settings.nodeWidth * 4}
              height={settings.cellSize * settings.nodeHeight * 3}
              className="geditor-groupobject">
                <div className="geditor-group">
                  <div className="geditor-grouplabel">Repeat 3 times</div>
                </div>
              </foreignObject>
          </g>

          {this.state.nodes.map((node) => (
            <Node
              autoMove={this.action?.type !== 'move'}
              node={node}
              onMouseDown={(event) => {
                event.preventDefault();

                // let selectedNodeIds = event.metaKey
                //   ? util.toggleSet(this.state.selectedNodeIds, node.id)
                //   : ImSet.of(node.id);

                // this.setState({ selectedNodeIds });

                let singleTargetId: NodeId | null = null;
                let selectedNodeIds;
                let targetNodeIds: ImSet<NodeId>;

                if (event.metaKey) {
                  selectedNodeIds = util.toggleSet(this.state.selectedNodeIds, node.id);
                  targetNodeIds = selectedNodeIds.has(node.id)
                    ? selectedNodeIds
                    : ImSet();
                } else {
                  selectedNodeIds = this.state.selectedNodeIds.has(node.id)
                    ? this.state.selectedNodeIds
                    : ImSet.of(node.id);
                  targetNodeIds = selectedNodeIds;

                  if (this.state.selectedNodeIds.has(node.id)) {
                    singleTargetId = node.id;
                  }
                }

                this.setState({ selectedNodeIds });

                // this.setState((state) => {
                //   if (event.metaKey) {
                //     return { selectedNodeIds: util.toggleSet(state.selectedNodeIds, node.id) };
                //   } else if ((state.selectedNodeIds.size > 1) || !state.selectedNodeIds.has(node.id)) {
                //     return { selectedNodeIds: ImSet([node.id]) };
                //   } else {
                //     return null; // return { selectedNodeIds: ImSet() };
                //   }
                // });

                if (!targetNodeIds.isEmpty()) {
                  this.action = {
                    type: 'select',
                    singleTargetId,
                    startPoint: {
                      x: event.clientX,
                      y: event.clientY
                    },
                    targets: targetNodeIds.toArray().map((nodeId) => {
                      let node = this.state.nodes.find((node) => node.id === nodeId)!;

                      return {
                        id: nodeId,
                        startPosition: node.position
                      };
                    })
                  };
                }
              }}
              selected={this.state.selectedNodeIds.has(node.id)}
              settings={settings}
              key={node.id} />
          ))}
        </svg>
      </div>
    );
  }
}


interface Settings {
  cellSize: number;
  nodeHeaderHeight: number;
  nodePadding: number;
  nodeWidth: number;
  nodeHeight: number;
}


type NodeId = string;

interface NodeDef {
  id: NodeId;
  title: string;
  features: {
    icon: string;
    label: string;
  }[];
  position: {
    x: number;
    y: number;
  };
}

function Node(props: {
  autoMove: unknown;
  node: NodeDef;
  onMouseDown?(event: React.MouseEvent): void;
  selected: unknown;
  settings: Settings;
}) {
  let { node, settings } = props;

  return (
    <g
      className={util.formatClass('geditor-noderoot', { '_automove': props.autoMove })}
      transform={`translate(${settings.cellSize * node.position.x} ${settings.cellSize * node.position.y})`}>
      <foreignObject
        x="0"
        y="0"
        width={settings.cellSize * settings.nodeWidth}
        height={settings.cellSize * settings.nodeHeight}
        className="geditor-nodeobject">
        <div
          className={util.formatClass('geditor-node', { '_selected': props.selected })}
          onMouseDown={props.onMouseDown}>
          <div className="geditor-header">
            <div className="geditor-title">{node.title}</div>
          </div>
          <div className="geditor-body">
            {node.features.map((feature, index) => (
              <div className="geditor-feature" key={index}>
                <Icon name={feature.icon} />
                <div className="geditor-featurelabel">{feature.label}</div>
              </div>
            ))}
          </div>
        </div>
      </foreignObject>

      <circle
        cx={settings.nodePadding}
        cy={settings.nodePadding + settings.nodeHeaderHeight * 0.5}
        r="5"
        fill="#fff"
        stroke="#000"
        strokeWidth="2" />
      <circle
        cx={settings.cellSize * settings.nodeWidth - settings.nodePadding}
        cy={settings.nodePadding + settings.nodeHeaderHeight * 0.5}
        r="5"
        fill="#fff"
        stroke="#000"
        strokeWidth="2" />
    </g>
  );
}


interface LinkDef {
  start: { x: number; y: number; };
  end: { x: number; y: number; };
}

function Link(props: {
  autoMove: unknown;
  link: LinkDef;
  settings: Settings;
}) {
  let { link, settings } = props;

  let startX = settings.cellSize * link.start.x - settings.nodePadding;
  let startY = settings.cellSize * link.start.y;

  let endX = settings.cellSize * link.end.x + settings.nodePadding;;
  let endY = settings.cellSize * link.end.y;

  let d = `M${startX} ${startY}`;

  if (link.end.y !== link.start.y) {
    let dir = (link.start.y < link.end.y) ? 1 : -1;

    let midCellX = Math.round((link.start.x + link.end.x) * 0.5);
    let midX = settings.cellSize * midCellX;

    let midStartX = settings.cellSize * (midCellX - 1);
    let midEndX = settings.cellSize * (midCellX + 1);

    let curveStartY = settings.cellSize * (link.start.y + 1 * dir);
    let curveEndY = settings.cellSize * (link.end.y - 1 * dir);

    d += `L${midStartX} ${startY}Q${midX} ${startY} ${midX} ${curveStartY}L${midX} ${curveEndY}Q${midX} ${endY} ${midEndX} ${endY}`;
  }

  d += `L${endX} ${endY}`;

  return <path d={d} className={util.formatClass('geditor-link', { '_automove': props.autoMove })} />
}

import * as d3 from 'd3';
import * as fc from 'd3fc';
import { List, Map as ImMap } from 'immutable';
import { Application, Button, DynamicValue, Feature, GeneralTabComponentProps, HierarchyEntry, Host, Icon, NodeHierarchy, OrdinaryId, StateUnit, StaticSelect, TitleBar, createSyncSessionStorageStore, formatDynamicValue, useSyncObjectStore, util } from 'pr1';
import { Brand, ChannelId, ClientId, UnitNamespace } from 'pr1-shared';
import { Component, PropsWithChildren, createRef, useEffect, useRef, useState } from 'react';

import styles from './styles.module.scss';


export type NodeId = Brand<string, 'NodeId'>;
export type NodePath = List<NodeId>;

export interface BaseNode {
  id: NodeId;
  icon: string | null;
  connected: string;
  description: string;
  label: string | null;
}

export interface CollectionNode<T = BaseNode> extends BaseNode {
  nodes: Record<NodeId, T>;
}

export interface DeviceNode extends CollectionNode {
  owner: string;
}

export interface ValueNode extends BaseNode {
  spec: {
    type: 'boolean';
  } | {
    type: 'numeric';
    dimensionality: Record<`[${string}]`, number>;
    unitFormatted: string | null;
  };
}


const findNode = (node: BaseNode, path: NodePath) => {
  let currentNode = node;

  for (let id of path) {
    if (!isCollectionNode(currentNode)) {
      return null;
    }

    currentNode = currentNode.nodes[id];

    if (!currentNode) {
      return null;
    }
  }

  return currentNode;
};


export interface ExecutorState {
  root: CollectionNode<DeviceNode>;
}

export interface State {
  values: [NodePath, DynamicValue][];
}

export enum NodeWriteError {
  Disconnected = 0,
  Unclaimable = 1,
  ExprError = 2
}

export interface NodeStateLocation {
  errors: {
    disconnected: boolean;
    evaluation: boolean;
    unclaimable: boolean;
  };
  value: DynamicValue;
}

export interface Location {
  values: [NodePath, NodeStateLocation][];
}

export function isCollectionNode(node: BaseNode): node is CollectionNode {
  return 'nodes' in node;
}

export function isValueNode(node: BaseNode): node is ValueNode {
  return 'spec' in node;
}


export type ContainedValue = {
  time: number;
  value: {
    type: 'null';
  } | {
    type: 'default';
    value: unknown;
  } | null;
}

export interface NodeState {
  connected: boolean;
  value: ContainedValue | null;
  writable: {
    owner: {
      type: 'client';
      clientId: ClientId;
    } | {
      type: 'unknown';
    } | null;
    targetValue: ContainedValue;
  } | null;
}


const namespace = ('devices' as UnitNamespace);

function DeviceControlTab(props: GeneralTabComponentProps) {
  let executor = (props.host.state.executors[namespace] as ExecutorState);
  let [selectedNodePath, setSelectedNodePath] = useSyncObjectStore<NodePath | null, NodeId[] | null>(null, createSyncSessionStorageStore('deviceControl.selectedEntry'), {
    deserialize: (serializedValue) => (serializedValue && List(serializedValue)),
    serialize: (value) => (value?.toJS() ?? null),
  });

  let [nodeStates, setNodeStates] = useState<ImMap<NodePath, NodeState> | null>(null);

  let createNodeEntriesFromNodes = (nodes: BaseNode[], parentNodePath: NodePath = List()): HierarchyEntry<NodeId>[] => {
    return nodes.map((node) => {
      let nodePath = parentNodePath.push(node.id);
      let nodeState = nodeStates?.get(nodePath);

      return {
        id: node.id,
        label: (node.label ?? node.id),
        description: node.description,
        ...(isCollectionNode(node)
          ? {
            type: 'collection',
            children: createNodeEntriesFromNodes(Object.values(node.nodes), nodePath)
          }
          : {
            type: 'node',
            icon: node.icon ?? 'settings_input_hdmi',
            error: (nodeState && !nodeState.connected),
            selected: selectedNodePath?.equals(nodePath)
          })
      };
    })
  };

  useEffect(() => {
    props.app.pool.add(async () => {
      let { channelId } = (await props.host.client.request({
        type: 'requestExecutor',
        namespace,
        data: {
          type: 'listen'
        }
      }) as { channelId: ChannelId; });

      let channel = props.host.client.listen<[NodeId[], NodeState][], {}>(channelId);

      for await (let change of channel) {
        setNodeStates((nodeStates) => (nodeStates ?? ImMap()).withMutations((nodeStatesMut) => {
          for (let [nodePath, nodeState] of change) {
            nodeStatesMut.set(List(nodePath), nodeState);
          }
        }));
      }

      return () => {
        channel.send({});
        channel.close();
      };
    });
  }, []);

  return (
    <>
      <TitleBar title="Device control" />
      <div className={styles.root}>
        <div className={styles.list}>
          <NodeHierarchy
            entries={createNodeEntriesFromNodes(Object.values(executor.root.nodes))}
            onSelectEntry={(entryPath) => void setSelectedNodePath(entryPath)}
            store={createSyncSessionStorageStore('deviceControl.hierarchyOpenEntries')}
            /* [
            { type: 'node',
              id: 'a',
              detail: '34.7ºC',
              icon: 'thermostat',
              label: 'Temperature readout' },
            {
              type: 'collection',
              id: 'b',
              label: 'Temperature controller',
              sublabel: 'Okolab H401-K temperature controller',
              children: [
                { type: 'node',
                  id: 'a',
                  detail: '34.7ºC',
                  icon: 'thermostat',
                  label: 'Temperature readout' },
                { type: 'node',
                  id: 'b',
                  detail: '35.2ºC',
                  icon: 'thermostat',
                  label: 'Temperature setpoint',
                  error: 'Problem' },
              ]
            },
            {
              type: 'collection',
              id: 'c',
              label: 'System',
              children: [
                { type: 'node',
                  id: 'a',
                  detail: '53 years',
                  icon: 'schedule',
                  label: 'Epoch' },
                { type: 'node',
                  id: 'b',
                  detail: '2 hrs 28 min',
                  icon: 'history',
                  label: 'Alive duration' },
                { type: 'node',
                  id: 'c',
                  detail: '294 MB',
                  icon: 'memory',
                  label: 'Process memory usage' },
                { type: 'node',
                  id: 'd',
                  detail: '0.6721',
                  icon: 'monitoring',
                  label: 'Random value' }
              ]
            }
          ] */ />
        </div>
        {(() => {
          if (!selectedNodePath || !nodeStates) {
            return null;
          }

          let nodePath = selectedNodePath;
          let node = findNode(executor.root, nodePath);

          if (!node) {
            setSelectedNodePath(null);
            return null;
          }

          let nodeState = nodeStates.get(nodePath)!;

          return (
            <NodeDetail
              app={props.app}
              executor={executor}
              host={props.host}
              node={node}
              nodePath={nodePath}
              nodeState={nodeState}
              key={nodePath.join('.')} />
          );
        })()}

      </div>
    </>
  )
}


interface WindowOption {
  label: string;
  value: number;
}

const ChartWindowOptions: WindowOption[] = [
  { label: '1 sec', value: 1e3 },
  { label: '10 sec', value: 10e3 },
  { label: '1 min', value: 60e3 },
  { label: '10 min', value: (10 * 60e3) }
];


interface NodeDetailProps {
  app: Application;
  executor: ExecutorState;
  host: Host;
  node: BaseNode;
  nodePath: NodePath;
  nodeState: NodeState;
}

interface NodeDetailState {
  chartReady: boolean;
  chartWindowOption: WindowOption;
}

class NodeDetail extends Component<NodeDetailProps, NodeDetailState> {
  private chart: any;
  private data: [number, number][] = [];
  private chartRenderId: number | null = null;
  private refChart = createRef<HTMLDivElement>();

  private previousDisplayWindow = 0;
  private minSampleCount = 4;
  private storageWindow = 30 * 60e3;

  constructor(props: NodeDetailProps) {
    super(props);

    this.state = {
      chartReady: false,
      chartWindowOption: ChartWindowOptions[1]
    };

    let xScale = d3.scaleLinear();
    let yScale = d3.scaleLinear();

    let series1 = fc
      .seriesWebglLine()
      .mainValue((d) => d[1])
      .crossValue((d) => d[0])
      .decorate((program, data) => {
        fc.webglStrokeColor()
          .value((_, i) => [0x00 / 0xff, 0x74 / 0xff, 0xd9 / 0xff, 1])
          .data(data)(program);
      });

    this.chart = fc
      .chartCartesian(xScale, yScale)
      .webglPlotArea(
        fc.seriesWebglMulti()
          .series([series1])
          .mapping((data, index, series) => data)
      );
  }

  override componentDidUpdate(prevProps: Readonly<NodeDetailProps>, prevState: Readonly<NodeDetailState>, snapshot?: any) {
    // console.log(this.props.nodeState);

    if (isValueNode(this.props.node) && (this.props.node.spec.type === 'numeric') && (this.props.nodeState.value?.value?.type === 'default')) {
      let newTime = this.props.nodeState.value.time;
      let newValue = this.props.nodeState.value.value.value.magnitude;

      if ((this.data.length < 1) || (newTime !== this.data.at(-1)[0])) {
        this.data.push([newTime, newValue]);
        this.controlChartRender();
      }
    }

    if (this.state.chartReady && !prevState.chartReady) {
      let render = () => {
        this.renderChart();
        this.chartRenderId = requestAnimationFrame(render);
      };

      this.chartRenderId = requestAnimationFrame(render);
    }
  }

  override componentWillUnmount() {
    this.cancelChartRender();
  }

  cancelChartRender() {
    if (this.chartRenderId !== null) {
      cancelAnimationFrame(this.chartRenderId);
      this.chartRenderId = null;
    }
  }

  controlChartRender() {
    let now = Date.now();

    let sliceIndex = this.data.findIndex(([time, value]) => time > (now - this.storageWindow));
    this.data.splice(0, (sliceIndex >= 0) ? (sliceIndex - 1) : this.data.length);

    if (this.data.length >= this.minSampleCount) {
      if (!this.state.chartReady) {
        this.setState({ chartReady: true });
      }
    } else {
      if (this.state.chartReady) {
        this.setState({ chartReady: false });
        this.cancelChartRender();
      }
    }
  }

  renderChart() {
    let displayWindow = this.state.chartWindowOption.value;

    let now = Date.now();
    let data = this.data.map(([time, value]) => [(time - now), value]);

    let firstIncludedIndex = data.findIndex(([delta, value]) => -delta < displayWindow);
    data = (firstIncludedIndex >= 0)
      ? data.slice(Math.max(0, firstIncludedIndex - 1))
      : [];

    let values = data.map(([delta, value]) => value);
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    let diff = maxValue - minValue;

    minValue -= diff * 0.05;
    maxValue += diff * 0.05;

    this.chart
      .yDomain([minValue, maxValue])
      // .yTickFormat((value, index) => `${value.toFixed(2)} MB`);


    if (displayWindow !== this.previousDisplayWindow) {
      this.previousDisplayWindow = displayWindow;

      this.chart
        .xDomain([-displayWindow, 0])
        .xTickFormat((delta: number) => {
          let minutes = Math.floor(-delta / 60e3);
          let seconds = Math.round((-delta - minutes * 60e3) / 1e3);

          return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        });
    }


    d3.select(this.refChart.current!)
      .datum(data)
      .call(this.chart);
  }

  override render() {
    let { node, nodePath, nodeState } = this.props;

    let owner = nodeState.writable?.owner;
    let owned = (owner?.type === 'client') && (owner.clientId === this.props.host.clientId);

    return (
      <div className={styles.detailRoot} key={nodePath.join('.')}>
        <div className={styles.detailContents}>
          <div className={styles.detailHeaderRoot}>
            <div className={styles.detailHeaderTitle}>
              <h1 className={styles.detailHeaderLabel}>{node.label ?? node.id}</h1>
              <p className={styles.detailHeaderDescription}>{node.description ?? ' '}</p>
            </div>
            <div className={styles.detailHeaderActions}>
              {nodeState.writable && (
                <Button onClick={() => {
                  this.props.app.pool.add(async () => {
                    await this.props.host.client.request({
                      type: 'requestExecutor',
                      namespace,
                      data: {
                        type: (owned ? 'release' : 'claim'),
                        nodePath: nodePath.toJS()
                      }
                    })
                  });
                }}>{owned ? 'Release' : 'Claim'}</Button>
              )}
            </div>
          </div>
          <div className={styles.detailInfoRoot}>
            <div className={styles.detailInfoEntry}>
              <div className={styles.detailInfoLabel}>Full name</div>
              <div className={styles.detailInfoValue}>
                <code>{nodePath.join('.')}</code>
              </div>
            </div>
            <div className={styles.detailInfoEntry}>
              <div className={styles.detailInfoLabel}>Status</div>
              <div className={styles.detailInfoValue}>
                {nodeState.connected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
            {nodeState.writable && (
              <div className={styles.detailInfoEntry}>
                <div className={styles.detailInfoLabel}>Current user</div>
                <div className={styles.detailInfoValue}>{(() => {
                  if (!owner) {
                    return '–';
                  } if (owned) {
                    return 'You';
                  } if (owner.type === 'client') {
                    return 'Another client';
                  }

                  return '[Unknown]';
                })()}</div>
              </div>
            )}
            {/* <div className={styles.detailConnectionRoot}>
                      <div className={styles.detailConnectionStatus}>
                        <Icon name="error" style="sharp" />
                        <div>Disconnected</div>
                      </div>
                      <p className={styles.detailConnectionMessage}>The device is disconnected.</p>
                    </div> */}
          </div>
          <div className={styles.detailChartRoot}>
            <div className={styles.detailChartToolbar}>
              {/* <div>Frequency: 50 Hz</div> */}
              <StaticSelect
                options={ChartWindowOptions}
                selectOption={(chartWindowOption) => void this.setState({ chartWindowOption })}
                selectedOption={this.state.chartWindowOption}>
                Window: {this.state.chartWindowOption.label}
              </StaticSelect>
            </div>
            <div className={styles.detailChartContainer}>
              {this.state.chartReady
                ? (
                  <div className={styles.detailChartContents} ref={this.refChart} key={0} />
                )
                : (
                  <div className={styles.detailChartPlaceholder} key={1}>
                    <p>Gathering samples...</p>
                  </div>
                )}
            </div>
          </div>
          {isValueNode(node) && (
            <div className={styles.detailValues}>
              <div className={styles.detailValueRoot}>
                <div className={styles.detailValueLabel}>{nodeState.connected ? 'Current value' : 'Last known value'}</div>
                <div className={styles.detailValueQuantity}>
                  <div className={styles.detailValueMagnitude}>
                    {(() => {
                      let container = nodeState.value;

                      if (!container?.value) {
                        // The value is unknown.
                        return '–';
                      } if (container.value.type === 'null') {
                        // The device is disabled.
                        return '[disabled]';
                      }

                      switch (node.spec.type) {
                        case 'numeric':
                          return (container.value.value as { magnitude: number; }).magnitude.toFixed(2);
                        default:
                          return '[unknown]';
                      }
                    })()}
                  </div>
                  {(node.spec.type === 'numeric') && node.spec.unitFormatted && (nodeState.value?.value?.type === 'default') && <div className={styles.detailValueUnit}>{node.spec.unitFormatted}</div>}
                </div>
              </div>
              <div className={styles.detailValueRoot}>
                <div className={styles.detailValueLabel}>Target value</div>
                <div className={styles.detailValueQuantity}>
                  <div className={styles.detailValueMagnitude} contentEditable={false}>34.7</div>
                  <div className={styles.detailValueUnit}>ºC</div>
                </div>
                <p className={styles.detailValueError}>The target value must be in the range 15.2 – 34.7ºC.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}


export default {
  namespace,

  createStateFeatures(state, descendantStates, location, context) {
    let executor = context.host.state.executors[this.namespace] as ExecutorState;

    return state.values.map(([path, stateValue]) => {
      let parentNode = findNode(executor.root, path.slice(0, -1))!;
      let node = findNode(executor.root, path)! as ValueNode;
      let nodeLocation = location?.values.find(([otherPath, _nodeLocation]) => util.deepEqual(otherPath, path))?.[1];

      let errors: Feature['error'][] = [];

      if (nodeLocation?.errors.disconnected) {
        errors.push({ kind: 'power', message: 'Disconnected' });
      } if (nodeLocation?.errors.unclaimable) {
        errors.push({ kind: 'shield', message: 'Unclaimable' });
      } if (nodeLocation?.errors.evaluation) {
        errors.push({ kind: 'error', message: 'Expression evaluation error' });
      }

      let label: JSX.Element | string;

      let currentValue = nodeLocation
        ? nodeLocation.value
        : stateValue;

      if (currentValue.type === 'expression') {
        label = formatDynamicValue(currentValue);
      } else if (currentValue.type === 'none') {
        label = '[Disabled]';
      } else {
        switch (node.value.type) {
          case 'boolean': {
            label = formatDynamicValue(currentValue);
            break;
          }

          case 'enum': {
            util.assert((currentValue.type === 'number') || (currentValue.type === 'string'));
            let innerValue = currentValue.value;
            let enumCase = node.value.cases.find((enumCase) => (enumCase.id === innerValue))!;
            label = (enumCase.label ?? enumCase.id.toString());

            break;
          }

          case 'numeric': {
            util.assert(currentValue.type === 'quantity');
            label = formatDynamicValue(currentValue);
            break;
          }

          default:
            throw new Error();
        }
      }

      return {
        disabled: descendantStates?.some((descendantState) => {
          return descendantState?.values.some(([descendantPath, _descendantValue]) => util.deepEqual(path, descendantPath));
        }),
        description: `${parentNode.label ?? parentNode.id} › ${node.label ?? node.id}`,
        error: errors[0] ?? null,
        icon: node.icon ?? 'settings_input_hdmi',
        label
      };
    }) ?? [];
  },

  generalTabs: [{
    id: 'manual',
    icon: 'tune',
    label: 'Device control',
    component: DeviceControlTab
  }]
} satisfies StateUnit<State, Location>

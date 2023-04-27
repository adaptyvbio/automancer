import { List, Map as ImMap } from 'immutable';
import { Button, DynamicValue, Feature, GeneralTabComponentProps, HierarchyEntry, Icon, NodeHierarchy, StateUnit, TitleBar, createSyncSessionStorageStore, formatDynamicValue, useSyncObjectStore, util } from 'pr1';
import { Brand, ChannelId, ClientId, UnitNamespace } from 'pr1-shared';
import { useEffect, useState } from 'react';

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
  value: {
    nullable: boolean;
    readable: boolean;
    writable: boolean;
  } & ({
    type: 'boolean';
    value: boolean;
  } | {
    type: 'enum';
    cases: {
      id: number | string;
      label: string | null;
    }[];
    value: number | string;
  } | {
    type: 'numeric';
    value: DynamicValue;
  });
}


const findNode = (node: BaseNode, path: NodePath) => {
  let currentNode = node;

  for (let id of path) {
    util.assert(isCollectionNode(currentNode));
    currentNode = currentNode.nodes[id];
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


export interface NodeState {
  connected: boolean;
  writable: {
    owner: {
      type: 'client';
      clientId: ClientId;
    } | {
      type: 'unknown';
    } | null;
  } | null;
}


const namespace = ('devices' as UnitNamespace);

function DeviceControlTab(props: GeneralTabComponentProps) {
  let executor = (props.host.state.executors[namespace] as ExecutorState);
  let [selectedNodePath, setSelectedNodePath] = useSyncObjectStore<NodePath | null, NodeId[] | null>(null, createSyncSessionStorageStore('deviceControl.hierarchyOpenEntries'), {
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
            store={createSyncSessionStorageStore('deviceControl.selectedEntry')}
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
          let nodeState = nodeStates.get(nodePath)!;

          let owner = nodeState.writable?.owner;
          let owned = (owner?.type === 'client') && (owner.clientId === props.host.clientId);

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
                        props.app.pool.add(async () => {
                          await props.host.client.request({
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
                <div className={styles.detailPlotRoot}>
                  <div className={styles.detailPlotToolbar}>
                    <div>Frequency: 50 Hz</div>
                    <div>Window: 10 sec</div>
                  </div>
                  <div className={styles.detailPlotContents}></div>
                </div>
                <div className={styles.detailValues}>
                  <div className={styles.detailValueRoot}>
                    <div className={styles.detailValueLabel}>Current value</div>
                    <div className={styles.detailValueQuantity}>
                      <div className={styles.detailValueMagnitude}>34.7</div>
                      <div className={styles.detailValueUnit}>ºC</div>
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
              </div>
            </div>
          );
        })()}

      </div>
    </>
  )
}


export default {
  namespace,

  createStateFeatures(state, descendantStates, location, context) {
    let executor = context.host.state.executors[this.namespace] as ExecutorState;

    return state.values.map(([path, stateValue]) => {
      let parentNode = findNode(executor.root, path.slice(0, -1));
      let node = findNode(executor.root, path) as ValueNode;
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

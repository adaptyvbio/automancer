import { PluginViewComponentProps } from 'pr1';

import { Map as ImMap, List } from 'immutable';
import { TitleBar } from 'pr1';
import { ChannelId } from 'pr1-shared';
import { useEffect, useState } from 'react';

import styles from './styles.module.scss';

import { NodeDetail } from './components/node-detail';
import { HierarchyEntry, NodeHierarchy } from './components/node-hierarchy';
import { BaseNode, Context, ExecutorState, NodeId, NodePath, NodeState, namespace } from './types';
import { findNode, isCollectionNode } from './util';


// type PersistentStoreEntries = [
//   [['plugin', typeof namespace, 'selected-entry'], NodePath | null]
// ];


export function DeviceControlView(props: PluginViewComponentProps<Context>) {
  let executor = (props.context.host.state.executors[namespace] as ExecutorState);

  // let [preferences, setPreferences] = useSyncObjectStore<Preferences>({
  //   nodePrefs: ImMap(),
  //   userNodes: List()
  // }, createSyncSessionStorageStore(namespace + '.preferences'));

  // let useSession = props.app.store.useSession as StoreManagerHookFromEntries<PersistentStoreEntries>;

  // let [selectedNodePath, setSelectedNodePath] = useSession(['plugin', namespace, 'selected-entry'], null);
  let [selectedNodePath, setSelectedNodePath] = useState<NodePath | null>(null);
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
    props.context.pool.add(async () => {
      let { channelId } = (await props.context.host.client.request({
        type: 'requestExecutor',
        namespace,
        data: {
          type: 'listen'
        }
      }) as { channelId: ChannelId; });

      let channel = props.context.host.client.listen<[NodeId[], NodeState][], {}>(channelId);

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
              context={props.context}
              executor={executor}
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

import { Map as ImMap, Set as ImSet, List } from 'immutable';
import { ShadowScrollable, util, Icon, ureg } from 'pr1';
import { ReactNode, createElement, useState } from 'react';

import styles from './node-hierarchy.module.scss';

import { BaseNode, CollectionNode, Context, NodePath, NodePreference, NodeStates, NumericValue } from '../types';
import { isCollectionNode, isValueNode, iterNodes } from '../util';


export interface NodeHierarchyProps {
  context: Context;
  nodeStates: NodeStates | null;
  rootNode: CollectionNode;
}

export function NodeHierarchy(props: NodeHierarchyProps) {
  let [selectedNodePath, setSelectedNodePath] = props.context.store.useSession('selectedNodePath');
  let [nodePrefs, setNodePrefs] = props.context.store.usePersistent('nodePrefs');
  let openNodePaths = ImSet(
    nodePrefs
      .filter((nodePref) => nodePref.open)
      .keys()
  );

  let getNodePref = (path: NodePath): NodePreference => nodePrefs.get(path) ?? {
    open: false
  };

  let [query, setQuery] = useState('');

  let allNodes = ImMap(iterNodes(props.rootNode));
  let trimmedQuery = query.trim().toLowerCase();

  let queriedNodePaths = (trimmedQuery.length > 0)
    ? ImSet(
      allNodes
        .filter((node, nodePath) => {
          return node.id.toLowerCase().includes(trimmedQuery) || node.label?.toLowerCase().includes(trimmedQuery);
        })
        .keys()
    )
    : null;

  return (
    <div className={styles.root}>
      <div className={styles.search}>
        <input
          type="text"
          placeholder="Search..."
          spellCheck={false}
          onInput={(event) => void setQuery(event.currentTarget.value)}
          value={query} />
      </div>

      <ShadowScrollable direction="vertical" className={styles.contentsContainer}>
        <div className={styles.contentsRoot}>
          {/* <div className={styles.groupRoot}>
            <div className={styles.groupHeader}>Saved devices</div>
            <div className={styles.groupList}>
              {props.entries.map((entry) => (
                <NodeHierarchyEntry
                  entry={entry}
                  entryPath={List([entry.id])}
                  onSelectEntry={props.onSelectEntry}
                  openEntryPaths={openEntryPaths}
                  setOpenEntryPaths={setOpenEntryPaths}
                  key={entry.id} />
              ))}
            </div>
          </div> */}
          <div className={styles.groupRoot}>
            <div className={styles.groupHeader}>All devices</div>
            <div className={styles.groupList}>
              {Object.values(props.rootNode.nodes)
                .map((childNode) => [List([childNode.id]), childNode] as const)
                .filter(([childNodePath, childNode]) => !queriedNodePaths || isNodeQueried(childNodePath, queriedNodePaths))
                .map(([childNodePath, childNode]) => (
                  <NodeHierarchyNode
                    node={childNode}
                    nodePath={childNodePath}
                    nodeStates={props.nodeStates}
                    openNode={(path) => {
                      let nodePref = getNodePref(path);

                      setNodePrefs(nodePrefs.set(path, {
                        ...nodePref,
                        open: !nodePref.open
                      }))
                    }}
                    queriedNodePaths={queriedNodePaths}
                    openNodePaths={openNodePaths}
                    selectNode={(path) => void setSelectedNodePath(path)}
                    selectedNodePaths={ImSet(selectedNodePath ? [selectedNodePath] : [])}
                    key={childNode.id} />
                ))}
            </div>
          </div>
        </div>
      </ShadowScrollable>
    </div>
  )
}

export function NodeHierarchyNode(props: {
  node: BaseNode;
  nodePath: NodePath;
  nodeStates: NodeStates | null;
  queriedNodePaths: ImSet<NodePath> | null;

  openNode(path: NodePath): void;
  openNodePaths: ImSet<NodePath>;

  selectNode(path: NodePath): void;
  selectedNodePaths: ImSet<NodePath>;
}) {
  let isSelected = props.selectedNodePaths.has(props.nodePath);

  if (isCollectionNode(props.node)) {
    let isOpen = props.openNodePaths.has(props.nodePath);

    return (
      <div className={util.formatClass(styles.collectionRoot, { '_open': isOpen })}>
        <div className={util.formatClass(styles.entryRoot, { '_selected': isSelected })}>
          <button type="button" className={styles.entryCollapse} onClick={() => void props.openNode(props.nodePath)}>
            <Icon name="chevron_right" style="sharp" className={styles.entryChevron} />
          </button>
          <button
            type="button"
            className={styles.entryButton}
            onClick={() => {
              props.selectNode(props.nodePath);

              if (!isOpen || isSelected) {
                props.openNode(props.nodePath);
              }
            }}>
            <Icon name={props.node.icon ?? 'settings_input_hdmi'} className={styles.entryIcon} />
            <div className={styles.entryBody}>
              <div className={styles.entryLabel}>{props.node.label ?? props.node.id}</div>
              {props.node.description && <div className={styles.entryDescription}>{props.node.description}</div>}
            </div>
            <div className={styles.entryValue}></div>
            {/* <Icon name="error" className={styles.entryErrorIcon} /> */}
          </button>
        </div>
        <div className={styles.collectionList}>
          {Object.values(props.node.nodes)
            .map((childNode) => [props.nodePath.push(childNode.id), childNode] as const)
            .filter(([childNodePath, childNode]) => !props.queriedNodePaths || isNodeQueried(childNodePath, props.queriedNodePaths))
            .map(([childNodePath, childNode]) => (
              <NodeHierarchyNode
                node={childNode}
                nodeStates={props.nodeStates}
                nodePath={childNodePath}
                queriedNodePaths={props.queriedNodePaths}
                selectNode={props.selectNode}
                selectedNodePaths={props.selectedNodePaths}
                openNodePaths={props.openNodePaths}
                openNode={props.openNode}
                key={childNode.id} />)
          )}
        </div>
      </div>
    );
  }

  let nodeState = props.nodeStates?.get(props.nodePath);
  let entryValue: ReactNode = null;

  if (isValueNode(props.node)) {
    let lastValue = nodeState?.lastValueEvent?.value;

    if (lastValue && (lastValue.type === 'default')) {
      if (props.node.spec?.type === 'numeric') {
        entryValue = ureg.formatQuantityAsReact((lastValue.innerValue as NumericValue).magnitude, 0, ureg.deserializeContext(props.node.spec.context), {
          createElement,
          style: 'symbol'
        });
      } else if (props.node.spec?.type === 'enum') {
        let caseId = lastValue.innerValue as (number | string);
        let specCase = props.node.spec.cases.find((specCase) => (specCase.id === caseId))!;

        entryValue = (specCase.label ?? specCase.id);
      }
    } else {
      entryValue = '–';
    }
  }

  return (
    <div className={util.formatClass(styles.entryRoot, { '_selected': isSelected })}>
      <button
        type="button"
        className={styles.entryButton}
        onClick={() => void props.selectNode(props.nodePath)}>
        <Icon name={props.node.icon ?? 'settings_input_hdmi'} className={styles.entryIcon} />
        <div className={styles.entryBody}>
          <div className={styles.entryLabel}>{props.node.label ?? props.node.id}</div>
          {props.node.description && <div className={styles.entryDescription}>{props.node.description}</div>}
          {/* {<Icon name="error" className={styles.entryErrorIcon} />} */}
        </div>
        <div className={styles.entryValue}>{entryValue}</div>
      </button>
      {/* {!!props.node.error && <Icon name="error" style="sharp" className={styles.entryErrorIcon} />} */}
    </div>
  );
}


function isNodeQueried(nodePath: NodePath, queriedNodePaths: ImSet<NodePath>) {
  return queriedNodePaths.some((queriedNodePath) => queriedNodePath.slice(0, nodePath.size).equals(nodePath));
}

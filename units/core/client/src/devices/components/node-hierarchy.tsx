import { Set as ImSet, List } from 'immutable';
import { ShadowScrollable, util, Icon } from 'pr1';

import styles from './node-hierarchy.module.scss';

import { BaseNode, Context, NodePath, NodePreference } from '../types';
import { isCollectionNode } from '../util';


export interface NodeHierarchyProps {
  context: Context;
  nodes: BaseNode[];
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

  return (
    <div className={styles.root}>
      <div className={styles.search}>
        <input type="text" placeholder="Search..." autoCorrect="off" /> {/* ??? */}
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
              {props.nodes.map((node) => (
                <NodeHierarchyNode
                  node={node}
                  nodePath={List([node.id])}
                  // onSelectEntry={props.onSelectEntry}
                  openNode={(path) => {
                    let nodePref = getNodePref(path);

                    setNodePrefs(nodePrefs.set(path, {
                      ...nodePref,
                      open: !nodePref.open
                    }))
                  }}
                  openNodePaths={openNodePaths}
                  selectNode={(path) => void setSelectedNodePath(path)}
                  selectedNodePaths={ImSet(selectedNodePath ? [selectedNodePath] : [])}
                  // setOpenEntryPaths={setOpenEntryPaths}
                  key={node.id} />
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

  openNode(path: NodePath): void;
  openNodePaths: ImSet<NodePath>;

  selectNode(path: NodePath): void;
  selectedNodePaths: ImSet<NodePath>;
}) {
  if (isCollectionNode(props.node)) {
    return (
      <div className={util.formatClass(styles.collectionRoot, { '_open': props.openNodePaths.has(props.nodePath) })}>
        <div className={styles.entryRoot}>
          <button type="button" className={styles.entryButton} onClick={() => void props.openNode(props.nodePath)}>
            <Icon name="chevron_right" style="sharp" className={styles.entryIcon} />
            <div className={styles.entryBody}>
              <div className={styles.entryLabel}>{props.node.label ?? props.node.id}</div>
              {props.node.description && <div className={styles.entrySublabel}>{props.node.description}</div>}
            </div>
            <div className={styles.entryValue}></div>
            {/* <Icon name="error" style="sharp" className={styles.entryErrorIcon} /> */}
          </button>
        </div>
        <div className={styles.collectionList}>
          {Object.values(props.node.nodes).map((childNode) => (
            <NodeHierarchyNode
              node={childNode}
              nodePath={props.nodePath.push(childNode.id)}
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

  return (
    <div className={styles.entryRoot}>
      <button
        type="button"
        className={util.formatClass(styles.entryButton, { '_selected': props.selectedNodePaths.has(props.nodePath) })}
        onClick={() => void props.selectNode(props.nodePath)}>
        <Icon name={props.node.icon ?? 'settings_input_hdmi'} style="sharp" className={styles.entryIcon} />
        <div className={styles.entryBody}>
          <div className={styles.entryLabel}>{props.node.label ?? props.node.id}</div>
          {props.node.description && <div className={styles.entrySublabel}>{props.node.description}</div>}
        </div>
        {/* {props.node.detail && <div className={styles.entryValue}>{props.node.detail}</div>} */}
      </button>
      {/* {!!props.node.error && <Icon name="error" style="sharp" className={styles.entryErrorIcon} />} */}
    </div>
  );
}

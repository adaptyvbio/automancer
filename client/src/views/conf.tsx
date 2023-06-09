import * as React from 'react';
import { ComponentType } from 'react';
import seqOrd from 'seq-ord';

import descriptionStyles from '../../styles/components/description.module.scss';
import formStyles from '../../styles/components/form.module.scss';
import styles from '../../styles/views/conf.module.scss';
import viewStyles from '../../styles/components/view.module.scss';

import { Icon } from '../components/icon';
import * as Form from '../components/standard-form';
import { TitleBar } from '../components/title-bar';
import * as util from '../util';
import { Button } from '../components/button';
import { ViewProps } from '../interfaces/view';
import { BaseUrl } from '../constants';
import { Description } from '../components/description';
import { OrdinaryId, PluginInfo } from 'pr1-shared';
import { GraphDirection, ShortcutDisplayMode } from '../store/application';
import { createPluginContext } from '../plugin';
import { Application } from '../application';
import { findWithIndex } from '../util';


export interface ConfGroup {
  id: OrdinaryId;
  pages: ConfPage[];
}

export interface ConfPage {
  id: OrdinaryId;
  component?: ConfPageComponent;
  icon: string;
  label: string;
}


export type ViewConfProps = ViewProps<{
  id: 'main',
  params: {};
  state: void;
} | {
  id: 'page';
  params: {
    0: string | undefined;
    groupId: string;
    pageId: string;
  };
  state: void;
}>;

export interface ViewConfState {
  reloadBannerVisible: boolean;
  selectedGroupAndPageIds: [string, string] | null;
}

export class ViewConf extends React.Component<ViewConfProps, ViewConfState> {
  private controller = new AbortController();

  constructor(props: ViewConfProps) {
    super(props);

    this.state = {
      reloadBannerVisible: false,
      selectedGroupAndPageIds: null
    };
  }

  private checkCurrentPair() {
    let currentPair = ViewConf.getCurrentPair(this.props, this.state);

    if ((this.props.route.id === 'page') && !currentPair) {
      ViewConf.navigate();
    }
  }

  override componentDidMount() {
    this.checkCurrentPair();

    document.body.addEventListener('keydown', (event) => {
      if ((event.target === event.currentTarget) && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.stopPropagation();

        let down = (event.key === 'ArrowDown');
        let delta1 = down ? 1 : -1;
        let delta2 = down ? 0 : -1;

        let currentPair = ViewConf.getCurrentPair(this.props, this.state);
        let groups = ViewConf.getGroups(this.props, this.state);

        if (currentPair) {
          let newPage = currentPair.group.pages[currentPair.pageIndex + delta1];

          if (newPage) {
            ViewConf.navigateToPage(currentPair.group.id, newPage.id);
          } else {
            let newGroup = groups[currentPair.groupIndex + delta1];

            if (newGroup) {
              let newPage = newGroup.pages.at(delta2)!;
              ViewConf.navigateToPage(newGroup.id, newPage.id);
            }
          }
        } else {
          let newGroup = groups.at(delta2)!;
          let newPage = newGroup.pages.at(delta2)!;

          ViewConf.navigateToPage(newGroup.id, newPage.id);
        }
      }
    }, { signal: this.controller.signal });
  }

  override componentDidUpdate() {
    this.checkCurrentPair();
  }

  override componentWillUnmount() {
    this.controller.abort();
  }

  override render() {
    let route = this.props.route;

    let groups = ViewConf.getGroups(this.props, this.state);
    let currentPair = ViewConf.getCurrentPair(this.props, this.state);
    let CurrentPageComponent = currentPair?.page.component;


    return (
      <main className={viewStyles.root}>
        <TitleBar title={currentPair?.page.label ?? 'Settings'} />
        <div className={util.formatClass(viewStyles.contents, styles.root)}>
          <div className={styles.selectorRoot}>
            <div className={styles.selectorListRoot}>
              {groups.map((group, groupIndex) => (
                <div className={styles.selectorListGroup} key={group.id}>
                  {group.pages.map((page, pageIndex) => (
                    <a
                      href={`${BaseUrl}/settings/${group.id}/${page.id}`}
                      className={util.formatClass(styles.selectorListEntry, {
                        '_selected': (route.id === 'page')
                          && (route.params.groupId === group.id)
                          && (route.params.pageId === page.id)
                      })}
                      key={page.id}>
                      <Icon name={page.icon} className={styles.selectorListIcon} />
                      <div className={styles.selectorListLabel}>{page.label}</div>
                    </a>
                  ))}
                </div>
              ))}

              {/* {new Array(2).fill(0).map(() => (
                <div className={styles.selectorListGroup}>
                  {new Array(10).fill(0).map(() => (
                    <button type="button" className={styles.selectorListEntry}>
                      <Icon name="settings_input_hdmi" className={styles.selectorListIcon} />
                      <div className={styles.selectorListLabel}>Devices very very very very long</div>
                    </button>
                  ))}
                </div>
              ))} */}
            </div>
          </div>
          {/* {(route.id === 'section') && (
            <div className={styles.contentsOuter}>
              <div className={styles.contentsInner}>
                {(() => {
                  if (route.params.groupId === 'units') {
                    let namespace = route.params.sectionId;
                    let unitInfo = unitsInfo[namespace];

                    let unit = this.props.host.units[namespace];
                    let Component = unit?.OptionsComponent;

                    if (Component) {
                      return (
                        <Component
                          app={this.props.app}
                          baseUrl={`${BaseUrl}/settings/units/${namespace}`}
                          host={this.props.host}
                          pathname={route.params[0] ?? ''} />
                      );
                    } else {
                      return (
                        <Description>
                          <h2>{unitInfo.metadata.title}</h2>
                          <p>This module cannot be configured here.</p>
                        </Description>
                      );
                    }
                  }

                  return null;
                })()}
              </div>
            </div>
          )} */}

          {CurrentPageComponent && (
            <div className={styles.contentsOuter}>
              <div className={util.formatClass(styles.contentsInner, descriptionStyles.root)}>
                <CurrentPageComponent
                  app={this.props.app}
                  setReloadRequired={() => void this.setState({ reloadBannerVisible: true })} />
              </div>
            </div>
          )}

              {/* <h2>AMF</h2>

              <h3>Devices</h3>

              <div className={descriptionStyles.itemlistRoot}>
                <button type="button" className={descriptionStyles.itemlistEntry}>
                  <div className={descriptionStyles.itemlistDetails}>
                    <div className={descriptionStyles.itemlistLabel}>Rotary valve (E5:0D:94:9B)</div>
                    <div className={descriptionStyles.itemlistDescription}>Configured</div>
                  </div>
                  <Icon name="chevron_right" style="sharp" className={descriptionStyles.itemlistChevron} />
                </button>
                <button type="button" className={descriptionStyles.itemlistEntry}>
                  <div className={descriptionStyles.itemlistDetails}>
                    <div className={descriptionStyles.itemlistLabel}>Rotary valve (CF:70:A8:16)</div>
                    <div className={descriptionStyles.itemlistDescription}>Configured</div>
                  </div>
                  <Icon name="chevron_right" style="sharp" className={descriptionStyles.itemlistChevron} />
                </button>
                <div className={descriptionStyles.itemlistEntry}>
                  <div className={descriptionStyles.itemlistDetails}>
                    <div className={descriptionStyles.itemlistLabel}>Rotary valve (1D:A0:53:3E)</div>
                    <div className={descriptionStyles.itemlistDescription}>Not configured</div>
                  </div>
                  <Button className={descriptionStyles.itemlistAction}>Configure</Button>
                </div>
                {/* {new Array(3).fill(0).map(() => (
                  <div className={descriptionStyles.itemlistEntry}>
                    <div className={descriptionStyles.itemlistDetails}>
                      <div className={descriptionStyles.itemlistLabel}>USB ACM 2</div>
                      <div className={descriptionStyles.itemlistDescription}>Not configured</div>
                    </div>
                    <Button className={descriptionStyles.itemlistAction}>Configure</Button>
                  </div>
                ))} }
              </div>

              <div className={descriptionStyles.rightactions}>
                <Button>Other...</Button>
              </div> */}
          {this.state.reloadBannerVisible && (
            <div className={styles.reload}>
              <p>Reload the setup to apply changes.</p>
              <Button onClick={() => {}}>Reload</Button>
            </div>
          )}
        </div>
      </main>
    );
  }


  static getCurrentPair(props: ViewConfProps, state: ViewConfState) {
    if (props.route.id === 'page') {
      let { groupId, pageId } = props.route.params;
      let groups = ViewConf.getGroups(props, state);

      let groupEntry = findWithIndex(groups, (group) => (group.id === groupId));

      if (groupEntry) {
        let [groupIndex, group] = groupEntry;

        let pageEntry = findWithIndex(group.pages, (page) => (page.id === pageId));

        if (pageEntry) {
          let [pageIndex, page] = pageEntry;

          return {
            group,
            groupIndex,
            page,
            pageIndex
          };
        }
      }
    }

    return null;
  }

  static getGroups(props: ViewConfProps, state: ViewConfState): ConfGroup[] {
    let pluginInfos = props.host.state.info.units;

    return [
      {
        id: 'main',
        pages: [
          { id: 'general',
            component: GeneralConfPage,
            icon: 'settings',
            label: 'General' }
        ]
      },
      { id: 'plugin',
        pages: Object.values(pluginInfos)
          .map((pluginInfo) => [pluginInfo, props.host.plugins[pluginInfo.namespace]?.SettingsComponent] as const)
          .filter(([pluginInfo, component]) => component)
          .map(([unitInfo, component]): ConfPage => ({
            id: unitInfo.namespace,
            component: (_pageProps) => {
              let Component = component!;

              return (
                <Component
                  app={props.app}
                  context={createPluginContext(props.app, props.host, unitInfo.namespace)} />
              );
            },
            icon: 'extension',
            label: unitInfo.metadata.title ?? unitInfo.namespace
          }))
          .sort(seqOrd(function* (a, b, rules) {
            yield rules.text(a.label, b.label);
          }))
      },
/*       {
        id: 'add-plugin',
        pages: [
          {
            id: 'add-plugin',
            icon: 'add',
            label: 'Add plugin'
          }
        ]
      } */
    ];
  }

  static navigate() {
    return navigation.navigate(`${BaseUrl}/settings`);
  }

  static navigateToPage(groupId: OrdinaryId, pageId: OrdinaryId) {
    return navigation.navigate(`${BaseUrl}/settings/${groupId}/${pageId}`);
  }

  static routes = [
    { id: 'main', pattern: '/settings' },
    { id: 'page', pattern: '/settings/:groupId/:pageId/**' }
  ];
}


function UnitIcon(props: {
  value: NonNullable<PluginInfo['metadata']['icon']>;
}) {
  let icon = props.value;

  switch (icon.kind) {
    case 'bitmap': return (
      <div className="usettings-icon">
        <div className="usettings-icon-mask" style={{ WebkitMaskImage: `url(${icon.value})` }} />
      </div>
    );

    case 'icon': return (
      <div className="usettings-icon">
        <Icon name={icon.value} />
      </div>
    );

    case 'svg': return (
      <div className="usettings-icon" dangerouslySetInnerHTML={{ __html: icon.value }} />
    );
  }
}


export type ConfPageComponent = ComponentType<ConfPageComponentProps>;

export interface ConfPageComponentProps {
  app: Application;
  setReloadRequired(): void;
}


function GeneralConfPage(props: ConfPageComponentProps) {
  let [automaticSave, setAutomaticSave] = props.app.store.usePersistent('editor.automaticSave');
  // let [graphDirection, setGraphDirection] = props.app.store.usePersistent('graph.direction');
  let [shortcutDisplayMode, setShortcutDisplayMode] = props.app.store.usePersistent('general.shortcutDisplayMode');

  return (
    <>
      <h2>General</h2>

      <h3>Editor</h3>

      <label className={formStyles.checkRoot}>
        <input type="checkbox" checked={automaticSave} onChange={(event) => void setAutomaticSave(!automaticSave)} />
        <div className={formStyles.checkTitle}>Automatic save</div>
        <p className={formStyles.checkDescription}>Save the editor's contents automatically at regular intervals.</p>
      </label>

      {/* <Form.Select
        label="Graph direction"
        value={graphDirection}
        onInput={setGraphDirection}
        options={[
          { id: GraphDirection.Vertical,
            label: 'Vertical' },
          { id: GraphDirection.Horizontal,
            label: 'Horizontal' }
        ]} /> */}

      <h3>Shortcuts</h3>

      <Form.Select
        label="Display mode"
        value={shortcutDisplayMode}
        onInput={setShortcutDisplayMode}
        options={[
          { id: ShortcutDisplayMode.Disabled,
            label: 'Disabled' },
          { id: ShortcutDisplayMode.Normal,
            label: 'Normal' },
          { id: ShortcutDisplayMode.Symbols,
            label: 'Advanced symbols' }
        ]} />
    </>
  );
}

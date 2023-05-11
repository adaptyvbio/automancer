import * as React from 'react';
import { ComponentType, useContext } from 'react';
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
import { UnitInfo } from 'pr1-shared';
import { OrdinaryId } from '../interfaces/util';
import { ApplicationStore } from '../application';


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
} | {
  id: 'page';
  params: {
    0: string | undefined;
    groupId: string;
    pageId: string;
  };
}>;

export interface ViewConfState {
  reloadBannerVisible: boolean;
  selectedGroupAndPageIds: [string, string] | null;
}

export class ViewConf extends React.Component<ViewConfProps, ViewConfState> {
  constructor(props: ViewConfProps) {
    super(props);

    this.state = {
      reloadBannerVisible: false,
      selectedGroupAndPageIds: null
    };
  }

  componentDidUpdate(prevProps: Readonly<ViewProps>, prevState: Readonly<ViewConfState>) {
    // TODO: Check that the selected section exists
  }

  render() {
    let unitsInfo = this.props.host.state.info.units;

    let groups: ConfGroup[] = [
      {
        id: 'main',
        pages: [
          {
            id: 'general',
            component: GeneralConfPage,
            icon: 'settings',
            label: 'General'
          },
          {
            id: 'editor',
            icon: 'edit_note',
            label: 'Editor'
          }
        ]
      },
      { id: 'plugins',
        pages: Object.values(unitsInfo)
          .map((unitInfo) => ({
            id: unitInfo.namespace,
            icon: 'extension',
            label: unitInfo.metadata.title ?? unitInfo.namespace
          }))
          .sort(seqOrd(function* (a, b, rules) {
            yield rules.text(a.label, b.label);
          }))
      },
      {
        id: 'add-unit',
        pages: [
          {
            id: 'add-unit',
            icon: 'add',
            label: 'Add module'
          }
        ]
      }
    ];

    let route = this.props.route;

    let currentPage: ConfPage | null;

    if (route.id === 'page') {
      let { groupId, pageId } = route.params;

      currentPage = groups
        .find((group) => group.id === groupId)?.pages
        .find((page) => page.id === pageId) ?? null;
    } else {
      currentPage = null;
    }

    let CurrentPageComponent = currentPage?.component;


    return (
      <main className={viewStyles.root}>
        <TitleBar title={currentPage?.label ?? 'Settings'} />
        <div className={util.formatClass(viewStyles.contents, styles.root)}>
          <div className={styles.selectorRoot}>
            <div className={styles.selectorListRoot}>
              {groups.map((group) => (
                <div className={styles.selectorListGroup} key={group.id}>
                  {group.pages.map((page) => (
                    <a href={`${BaseUrl}/settings/${group.id}/${page.id}`} className={util.formatClass(styles.selectorListEntry, {
                      '_selected': (route.id === 'page')
                        && (route.params.groupId === group.id)
                        && (route.params.pageId === page.id)
                    })} key={page.id}>
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
                  setReloadRequired={() => void this.setState({ reloadBannerVisible: true })}
                  store={this.props.app.store} />
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
              <Button>Reload</Button>
            </div>
          )}
        </div>
      </main>
    );
  }


  static routes = [
    { id: 'main', pattern: '/settings' },
    { id: 'page', pattern: '/settings/:groupId/:pageId/**' }
  ];
}


function UnitIcon(props: {
  value: NonNullable<UnitInfo['metadata']['icon']>;
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
  setReloadRequired(): void;
  store: ApplicationStore;
}


enum ShortcutPref {
  Default,
  Disabled,
  Symbol
}

function GeneralConfPage(props: ConfPageComponentProps) {
  let [automaticSave, setAutomaticSave] = props.store.usePersistent<boolean>(['editor', 'automatic-save'], false);
  let [shortcutPref, setShortcutPref] = props.store.usePersistent<ShortcutPref>(['misc', 'shortcut'], ShortcutPref.Disabled);
  // let [progressDisplayPref, setProgressDisplayPref] = props.store.usePersistent<>();

  return (
    <>
      <h2>General</h2>

      <h3>Editor</h3>

      <label className={formStyles.checkRoot}>
        <input type="checkbox" checked={automaticSave} onInput={(event) => void setAutomaticSave(!automaticSave)} />
        <div className={formStyles.checkTitle}>Automatic save</div>
        <p className={formStyles.checkDescription}>The editor's contents will be saved automatically at regular intervals.</p>
      </label>

      <h3>Miscellaneous</h3>

      <Form.Select
        label="Shortcut display"
        value={shortcutPref}
        onInput={(value) => void setShortcutPref(value)}
        options={[
          { id: ShortcutPref.Disabled,
            label: 'Disabled' },
          { id: ShortcutPref.Default,
            label: 'Default' },
          { id: ShortcutPref.Symbol,
            label: 'Symbols' }
        ]} />
    </>
  );
}

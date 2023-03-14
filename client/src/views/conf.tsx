import * as React from 'react';
import seqOrd from 'seq-ord';

import { Application } from '../application';
import { Icon } from '../components/icon';
import * as Form from '../components/standard-form';
import { TitleBar } from '../components/title-bar';
import { Host } from '../host';
import { UnitInfo, UnitNamespace } from '../units';
import * as util from '../util';
import { Button } from '../components/button';
import { ViewProps } from '../interfaces/view';
import { BaseUrl } from '../constants';
import { Description } from '../components/description';

import descriptionStyles from '../../styles/components/description.module.scss';
import formStyles from '../../styles/components/form.module.scss';
import styles from '../../styles/views/conf.module.scss';
import viewStyles from '../../styles/components/view.module.scss';


export type ViewConfProps = ViewProps<{
  id: 'main',
  params: {};
} | {
  id: 'section';
  params: {
    0: string | undefined;
    groupId: string;
    sectionId: string;
  };
}>;

export interface ViewConfState {
  reloadBannerVisible: boolean;
  selectedGroupAndSectionIds: [string, string] | null;
}

export class ViewConf extends React.Component<ViewConfProps, ViewConfState> {
  constructor(props: ViewConfProps) {
    super(props);

    this.state = {
      reloadBannerVisible: true,
      selectedGroupAndSectionIds: null
    };
  }

  componentDidUpdate(prevProps: Readonly<ViewProps>, prevState: Readonly<ViewConfState>) {
    // TODO: Check that the selected section exists
  }

  render() {
    let unitsInfo = this.props.host.state.info.units;

    let groups = [
      {
        id: 'main',
        sections: [
          {
            id: 'general',
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
      { id: 'units',
        sections: Object.values(unitsInfo)
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
        sections: [
          {
            id: 'add-unit',
            icon: 'add',
            label: 'Add module'
          }
        ]
      }
    ];

    let route = this.props.route;

    return (
      <main className={viewStyles.root}>
        <TitleBar title={(() => {
          if (route.id === 'section') {
            let { groupId, sectionId } = route.params;

            return groups
              .find((group) => group.id === groupId)!
              .sections
              .find((section) => section.id === sectionId)!
              .label;
          }

          return 'Settings';
        })()} />
        <div className={util.formatClass(viewStyles.contents, styles.root)}>
          <div className={styles.selectorRoot}>
            <div className={styles.selectorListRoot}>
              {groups.map((group) => (
                <div className={styles.selectorListGroup} key={group.id}>
                  {group.sections.map((section) => (
                    <a href={`${BaseUrl}/settings/${group.id}/${section.id}`} className={util.formatClass(styles.selectorListEntry, {
                      '_selected': (route.id === 'section')
                        && (route.params.groupId === group.id)
                        && (route.params.sectionId === section.id)
                    })} key={section.id}>
                      <Icon name={section.icon} className={styles.selectorListIcon} />
                      <div className={styles.selectorListLabel}>{section.label}</div>
                    </a>
                  ))}
                </div>
              ))}

              {false && new Array(2).fill(0).map(() => (
                <div className={styles.selectorListGroup}>
                  {new Array(10).fill(0).map(() => (
                    <button type="button" className={styles.selectorListEntry}>
                      <Icon name="settings_input_hdmi" className={styles.selectorListIcon} />
                      <div className={styles.selectorListLabel}>Devices very very very very long</div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {(route.id === 'section' && false) && (
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
          )}

          <div className={styles.contentsOuter}>
            <div className={util.formatClass(styles.contentsInner, descriptionStyles.root)}>
              <h2>AMF</h2>

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
                ))} */}
              </div>

              <div className={descriptionStyles.rightactions}>
                <Button>Other...</Button>
              </div>

              {/* {new Array(100).fill(0).map(() => (<label className={formStyles.checkRoot}>
                <input type="checkbox" />
                <div className={formStyles.checkTitle}>Automatic save</div>
                <p className={formStyles.checkDescription}>The editor's contents will be saved automatically at regular intervals.</p>
              </label>))} */}
            </div>
          </div>
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
    { id: 'section', pattern: '/settings/:groupId/:sectionId/**' }
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

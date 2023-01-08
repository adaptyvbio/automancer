import * as React from 'react';

import { TitleBar } from '../../components/title-bar';
import * as util from '../../util';
import * as Form from '../../components/standard-form';
import { ViewProps } from '../../interfaces/view';

import descriptionStyles from '../../../styles/components/description.module.scss';
import formStyles from '../../../styles/components/form.module.scss';
import viewStyles from '../../../styles/components/view.module.scss';



export class ViewDesign extends React.Component<ViewProps, {}> {
  static route = { id: '_', pattern: '/design' };

  constructor(props: ViewProps) {
    super(props);

    this.state = {

    };
  }

  render() {
    return (
      <main className={viewStyles.root}>
        <TitleBar title="Design" />

        <div className={viewStyles.contents}>
          <div className={util.formatClass(descriptionStyles.root, formStyles.main)}>
            <div className={descriptionStyles.header}>
              <h2>Settings super super long super super long super super long</h2>
              <div className={formStyles.actions}>
                <button type="button" className={formStyles.btn}>New experiment</button>
                <button type="button" className={formStyles.btn}>New experiment</button>
              </div>
            </div>

            <p className={formStyles.paragraph}>Codespaces created from the following repositories can have GPG capabilities and sign commits so that GitHub can verify that they come from a trusted source. Only enable this for repositories that you trust.</p>

            <label className={formStyles.fieldControl}>
              <div className={formStyles.fieldLabel}>Setup name</div>
              <input type="text" className={formStyles.fieldTextfield} />
            </label>
            <label className={formStyles.fieldControl}>
              <div className={formStyles.fieldLabel}>Setup name</div>
              <input type="text" className={formStyles.fieldTextfield} />
            </label>

            <Form.CheckboxList label="Virtual environment">
              <Form.Checkbox label="Create a virtual environment">
                <p>Virtual environments are not supported in this Python installation. Install venv to add their support.</p>
              </Form.Checkbox>
              <Form.Checkbox label="Create a virtual environment">
                <p>Virtual environments are not supported in this Python installation. Install venv to add their support.</p>
              </Form.Checkbox>
              <Form.Checkbox label="Create a virtual environment">
                <p>Virtual environments are not supported in this Python installation.</p>
                <p>Install venv to add their support.</p>
              </Form.Checkbox>
              <Form.Checkbox label="Create a virtual environment" />
              <Form.Checkbox label="Create a virtual environment" />
              <Form.Checkbox label="Create a virtual environment" checked disabled={true} />
            </Form.CheckboxList>

            <h2>Settings super super long super super long super super long</h2>

            <label className={formStyles.checkRoot}>
              <input type="checkbox" />
              <div className={formStyles.checkTitle}>Organizations within this enterprise</div>
              <p className={formStyles.checkDescription}>Members can fork a repository to an organization within this enterprise.</p>
            </label>
            <label className={formStyles.checkRoot}>
              <input type="checkbox" />
              <div className={formStyles.checkTitle}>Organizations within this enterprise</div>
              <p className={formStyles.checkDescription}>Members can fork a repository to an organization within this enterprise.</p>
            </label>

            <div className={formStyles.checkGroup}>
              <label className={formStyles.checkRoot}>
                <input type="checkbox" />
                <div className={formStyles.checkTitle}>Organizations within this enterprise</div>
                <p className={formStyles.checkDescription}>Members can fork a repository to an organization within this enterprise.</p>
              </label>
              <label className={formStyles.checkRoot}>
                <input type="checkbox" />
                <div className={formStyles.checkTitle}>Organizations within this enterprise</div>
                <p className={formStyles.checkDescription}>Members can fork a repository to an organization within this enterprise.</p>
              </label>
              <label className={formStyles.checkRoot}>
                <input type="checkbox" />
                <div className={formStyles.checkTitle}>Organizations within this enterprise</div>
                <p className={formStyles.checkDescription}>Members can fork a repository to an organization within this enterprise.</p>
              </label>
              <label className={formStyles.checkRoot}>
                <input type="checkbox" />
                <div className={formStyles.checkTitle}>Organizations within this enterprise</div>
                <p className={formStyles.checkDescription}>Members can fork a repository to an organization within this enterprise.</p>
              </label>
            </div>

            <h2>Editor</h2>

            <label className={formStyles.checkRoot}>
              <input type="checkbox" />
              <div className={formStyles.checkTitle}>Automatic save</div>
              <p className={formStyles.checkDescription}>The editor's contents will be saved automatically at regular intervals.</p>
            </label>
          </div>
        </div>
      </main>
    );
  }
}

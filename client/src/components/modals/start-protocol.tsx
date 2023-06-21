import { ExperimentId } from 'pr1-shared';
import { useEffect, useRef, useState } from 'react';

import descriptionStyles from '../../../styles/components/description.module.scss';

import { Modal } from '../modal';
import * as Form from '../standard-form';
import { Host } from '../../host';


const NewExperimentOptionId = '_new' as const;

export function StartProtocolModal(props: {
  host: Host;
  onCancel(): void;
  onSubmit(data: {
    experimentId: ExperimentId;
    newExperimentTitle: null;
  } | {
    experimentId: null;
    newExperimentTitle: string | null;
  }): void;
}) {
  let experiments = Object.values(props.host.state.experiments);
  let [experimentId, setExperimentId] = useState<ExperimentId | typeof NewExperimentOptionId>(
    experiments.find((experiment) => !experiment.master)?.id ?? NewExperimentOptionId
  );

  let [newExperimentTitle, setNewExperimentTitle] = useState<string>('');
  let refNewExperimentTitleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (experimentId === NewExperimentOptionId) {
      refNewExperimentTitleInput.current!.focus();
    }
  }, [experimentId]);

  return (
    <Modal onCancel={props.onCancel}>
      <form className={descriptionStyles.root} onSubmit={(event) => {
        event.preventDefault();

        props.onSubmit(
          (experimentId === NewExperimentOptionId)
            ? { experimentId: null, newExperimentTitle: (newExperimentTitle.trim() || null) }
            : { experimentId, newExperimentTitle: null }
        );
      }}>
        <h2>Start protocol</h2>

        <Form.Select
          label="Experiment"
          onInput={(value) => {
            setExperimentId(value);

            if (value === NewExperimentOptionId) {
              setNewExperimentTitle('');
            }
          }}
          options={[
            { id: ('_header1' as ExperimentId), label: 'Existing experiments', disabled: true },
            ...experiments.map((experiment) => ({
              id: experiment.id,
              label: experiment.title,
              disabled: experiment.master
            })),
            { id: ('_header2' as ExperimentId), label: 'New experiment', disabled: true },
            { id: NewExperimentOptionId, label: 'New experiment' }
          ]}
          value={experimentId} />

        {(experimentId === NewExperimentOptionId) && (
          <Form.TextField
            label="Experiment title"
            onInput={(value) => void setNewExperimentTitle(value)}
            placeholder="Untitled experiment"
            value={newExperimentTitle}
            targetRef={refNewExperimentTitleInput} />
        )}

        <Form.Actions mode="both">
          <div>
            <Form.Action label="Cancel" shortcut="Escape" onClick={props.onCancel} />
          </div>
          <div>
            <Form.Action label="Start" type="submit" />
          </div>
        </Form.Actions>
      </form>
    </Modal>
  )
}

import * as React from 'react';

import descriptionStyles from '../../../styles/components/description.module.scss';

import { Modal } from '../modal';
import * as Form from '../standard-form';
import { Host } from '../../host';
import { MetadataTools } from '../../unit';
import { Chip, ChipCondition, ChipId, UnitNamespace } from 'pr1-shared';


const NewChipOptionId = ('_new' as ChipId);

export function StartProtocolModal(props: {
  host: Host;
  onCancel(): void;
  onSubmit(data: {
    chipId: ChipId;
    newChipTitle: null;
  } | {
    chipId: null;
    newChipTitle: string | null;
  }): void;
}) {
  let metadataTools = props.host.units['metadata' as UnitNamespace] as unknown as MetadataTools;
  let chips = (Object.values(props.host.state.chips)
    .filter((chip) => chip.condition === ChipCondition.Ok) as Chip[])
    .map((chip) => ({ chip, metadata: metadataTools.getChipMetadata(chip) }));

  let [chipId, setChipId] = React.useState<ChipId | typeof NewChipOptionId>(
    chips.find(({ chip, metadata }) => !metadata.archived && !chip.master)?.chip.id ?? NewChipOptionId
  );

  let [newChipTitle, setNewChipTitle] = React.useState<string>('');

  let refNewChipTitleInput = React.createRef<HTMLInputElement>();

  React.useEffect(() => {
    if (chipId === NewChipOptionId) {
      refNewChipTitleInput.current!.focus();
    }
  }, [chipId]);

  return (
    <Modal onCancel={props.onCancel}>
      <form className={descriptionStyles.root} onSubmit={(event) => {
        event.preventDefault();

        props.onSubmit(
          (chipId === NewChipOptionId)
            ? { chipId: null, newChipTitle: (newChipTitle.trim() || null) }
            : { chipId, newChipTitle: null }
        )
      }}>
        <h2>Start protocol</h2>

        <Form.Select
          label="Experiment"
          onInput={(value) => {
            setChipId(value);

            if (value === NewChipOptionId) {
              setNewChipTitle('');
            }
          }}
          options={[
            { id: ('_header1' as ChipId), label: 'Existing experiments', disabled: true },
            ...chips.map(({ chip, metadata }) => ({
              id: chip.id,
              label: metadata.title,
              disabled: metadata.archived || chip.master
            })),
            { id: ('_header2' as ChipId), label: 'New experiment', disabled: true },
            { id: NewChipOptionId, label: 'New experiment' }
          ]}
          value={chipId} />

        {(chipId === NewChipOptionId) && (
          <Form.TextField
            label="Experiment title"
            onInput={(value) => void setNewChipTitle(value)}
            placeholder="Untitled experiment"
            value={newChipTitle}
            targetRef={refNewChipTitleInput} />
        )}

        <Form.Actions mode="modal">
          <Form.Action label="Cancel" shortcut="Escape" onClick={props.onCancel} />
          <Form.Action label="Start" type="submit" />
        </Form.Actions>
      </form>
    </Modal>
  )
}

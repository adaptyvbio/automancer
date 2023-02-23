import { Chip, Form, Host, MatrixEditorProps } from 'pr1';
import { React } from 'pr1';


export const namespace = 'metadata';

export interface Command {
  type: 'set';
  archived: boolean;
  description: string;
  title: string;
}

export interface Runner {
  archived: boolean;
  creationDate: number;
  description: string;
  title: string;
}

export function MatrixEditor(props: MatrixEditorProps) {
  let runner = props.chip.runners[namespace] as Runner;

  let [description, setDescription] = React.useState(runner.description);
  let [title, setTitle] = React.useState(runner.title);

  let synchronize = ({ description, title }: { description: string; title: string; }) => {
    props.host.backend.command({
      chipId: props.chip.id,
      namespace,
      command: {
        type: 'set',
        archived: runner.archived,
        description,
        title
      }
    });
  };

  return (
    <>
      <div className="header header--2">
        <h2>General</h2>
      </div>

      <Form.Form>
        <Form.TextField
          label="Name"
          onInput={(value) => void setTitle(value)}
          onBlur={() => {
            let trimmedTitle = title.trim();

            if (trimmedTitle) {
              synchronize({ description, title: trimmedTitle });
            } else {
              setTitle(runner.title);
            }
          }}
          placeholder="e.g. Assay attempt 3"
          value={title} />

        <Form.TextArea
          label="Description"
          onInput={(value) => void setDescription(value)}
          onBlur={() => {
            synchronize({ description, title });
          }}
          placeholder="e.g. Started on March 23rd"
          value={description} />
      </Form.Form>
    </>
  );
}


// Other contribution points

export async function archiveChip(host: Host, chip: Chip, value: boolean) {
  let runner = chip.runners[namespace] as Runner;

  await host.backend.command({
    chipId: chip.id,
    namespace,
    command: {
      type: 'set',
      archived: value,
      description: runner.description,
      title: runner.title
    }
  });
}

export function getChipMetadata(chip: Chip) {
  let runner = chip.runners[namespace] as Runner;

  return {
    archived: runner.archived,
    creationDate: runner.creationDate,
    description: runner.description,
    title: runner.title
  };
}

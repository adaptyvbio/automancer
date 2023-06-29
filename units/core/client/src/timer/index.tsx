import { EvaluableValue, Form, PanelAction, PanelActions, PanelDataList, PanelLoader, PanelPlaceholder, PanelRoot, PanelSection, PanelSpinner, Plugin, ProgressBar, ProgressDisplayMode, TimeSensitive, TimedProgressBar, createProcessBlockImpl, formatDuration, formatEvaluable } from 'pr1';
import { MasterBlockLocation, PluginName, ProtocolBlockName } from 'pr1-shared';


export interface ProcessData {
  duration: EvaluableValue<number | null>;
}

export interface ProcessLocation {
  date: number | null;
  duration: number | null;
  progress: number;
}


export default {
  namespace: ('timer' as PluginName),
  blocks: {
    ['_' as ProtocolBlockName]: createProcessBlockImpl<ProcessData, ProcessLocation>({
      Component(props) {
        if (props.location.duration === null) {
          return (
            <TimeSensitive
              contents={() => (
                <p>Time elapsed: {new Date().toString()}</p>
              )}
              interval={1000} />
          );
        }

        return (
          <TimedProgressBar
            date={props.location.date!}
            duration={props.location.duration * 1000}
            setValue={(progress) => {
              props.context.pool.add(async () => {
                await props.context.sendMessage({
                  type: 'jump',
                  value: {
                    progress
                  }
                });
              });
            }}
            value={props.location.progress} />
        );
      },
      createFeatures(data, location) {
        let formatInnerValue = (value: number | null) =>
          (value !== null)
            ? formatDuration(value * 1000)
            : 'Forever';

        return [{
          icon: 'hourglass_empty',
          label: location
            ? formatInnerValue(location.duration)
            : formatEvaluable(data.duration, formatInnerValue)
        }];
      },
      getLabel(data) {
        return 'Wait';
      }
    })
  },

  executionPanels: [{
    id: '_',
    label: 'Timer',
    shortcut: 'T',
    Component(props) {
      // return <PanelLoader />;

      return (
        // <PanelPlaceholder message="No timer currently active" />
        <PanelRoot>
          <PanelSection>
            <h2>Metrics</h2>

            <p>Most recent orders delivered to customers.</p>

            <PanelDataList data={[
              { label: 'Duration', value: 'Forever' },
              { label: 'Time elapsed', value: 'Forever' },
              { label: 'Time elapsed elapsed elapsed', value: `${new Date()}` }
            ]} />
          </PanelSection>
          <PanelSection>
            <h2>Actions</h2>

            <PanelActions>
              <PanelAction>Toggle</PanelAction>
              <PanelAction>Toggle</PanelAction>
            </PanelActions>
          </PanelSection>
          <PanelSection>
            <h2>Results</h2>

            <PanelSpinner />
          </PanelSection>
          <PanelSection>
            <h2>Input</h2>

            <Form.TextField label="Value 1" value="Foo" onInput={() => {}} />
            <Form.TextField label="Value 2" value="Foo" onInput={() => {}} />
          </PanelSection>
          <PanelSection>
            <PanelActions>
              <PanelAction>Toggle</PanelAction>
              <PanelAction>Toggle</PanelAction>
            </PanelActions>
          </PanelSection>
          <PanelSection>
            <PanelActions>
              <PanelAction>Toggle</PanelAction>
              <PanelAction>Toggle</PanelAction>
            </PanelActions>
          </PanelSection>
          <PanelSection>
            <PanelActions>
              <PanelAction>Toggle</PanelAction>
              <PanelAction>Toggle</PanelAction>
            </PanelActions>
          </PanelSection>
          <PanelSection>
            <PanelActions>
              <PanelAction>Toggle</PanelAction>
              <PanelAction>Toggle</PanelAction>
            </PanelActions>
          </PanelSection>
        </PanelRoot>
      );
    }
  }],

  SettingsComponent(props) {
    let [shortcutPref, setShortcutPref] = props.context.store.usePersistent('progressDisplayMode');

    return (
      <>
        <h2>Timer</h2>

        <Form.Select
          label="Progress display mode"
          value={shortcutPref}
          onInput={setShortcutPref}
          options={[
            { id: ProgressDisplayMode.Fraction,
              label: 'Fraction' },
            { id: ProgressDisplayMode.TimeElapsed,
              label: 'Time elapsed' },
            { id: ProgressDisplayMode.TimeRemaining,
              label: 'Time remaining' }
          ]} />
      </>
    );
  },

  persistentStoreDefaults: {
    progressDisplayMode: ProgressDisplayMode.Fraction
  }
} satisfies Plugin<{
  progressDisplayMode: ProgressDisplayMode;
}>

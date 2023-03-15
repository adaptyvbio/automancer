import { DynamicValue, formatDynamicValue, StateUnit } from 'pr1';


export interface State {
  entries: {
    condition: DynamicValue;
  }[];
}

export interface Location {

}

export default {
  namespace: 'expect',
  createStateFeatures(state, ancestorStates, location, context) {
    return state.entries.map((entry) => ({
      icon: 'notification_important',
      label: formatDynamicValue(entry.condition),
      description: 'Expect'
    }));
  }
} satisfies StateUnit<State, Location>

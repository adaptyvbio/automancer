import { StateUnit } from 'pr1';


export interface State {

}

export interface Location {
  rows: number;
}

export default {
  namespace: 'record',
  createStateFeatures(state, ancestorStates, location, context) {
    return state
      ? [
        { icon: 'monitoring',
          label: 'Record data' + (location ? ` (${location.rows} rows)` : '') }
      ]
      : [];
  }
} satisfies StateUnit<State, Location>

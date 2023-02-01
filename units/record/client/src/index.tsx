import { StateUnit } from 'pr1';


export interface State {

}

export interface Location {

}

export default {
  namespace: 'record',
  createStateFeatures(state, ancestorStates, location, context) {
    return state
      ? [
        { icon: 'monitoring',
          label: 'Record data' }
      ]
      : [];
  }
} satisfies StateUnit<State, Location>

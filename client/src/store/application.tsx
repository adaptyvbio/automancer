import { StoreConsumer } from './types';


export enum GraphDirection {
  Horizontal = 0,
  Vertical = 1
}

export enum ShortcutDisplayMode {
  Disabled = 0,
  Normal = 1,
  Symbols = 2
}

export interface ApplicationPersistentStoreEntries {
  'general.shortcutDisplayMode': ShortcutDisplayMode,
  'graph.direction': GraphDirection,
  'editor.automaticSave': boolean
}

export const ApplicationPersistentStoreDefaults: ApplicationPersistentStoreEntries = {
  'general.shortcutDisplayMode': ShortcutDisplayMode.Disabled,
  'graph.direction': GraphDirection.Vertical,
  'editor.automaticSave': false
};


export interface ApplicationSessionStoreEntries {

}

export const ApplicationSessionStoreDefaults: ApplicationSessionStoreEntries = {

};


export type ApplicationStoreConsumer = StoreConsumer<ApplicationPersistentStoreEntries, ApplicationSessionStoreEntries>;

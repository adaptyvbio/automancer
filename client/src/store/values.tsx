import type { OrdinaryId, UnionToIntersection } from 'pr1-shared';
import type { SpecializedStoreManagerHook } from './store-manager';


export enum GraphDirection {
  Horizontal = 0,
  Vertical = 1
}

export enum ShortcutDisplayMode {
  Disabled = 0,
  Normal = 1,
  Symbols = 2
}

export type PersistentStoreEntries = [
  [['general', 'shortcut-display-mode'], ShortcutDisplayMode],
  [['graph', 'direction'], GraphDirection],
  [['editor', 'automatic-save'], boolean],
];

export const PersistentStoreDefaults: PersistentStoreEntries = [
  [['general', 'shortcut-display-mode'], ShortcutDisplayMode.Disabled],
  [['graph', 'direction'], GraphDirection.Vertical],
  [['editor', 'automatic-save'], false],
];


export type SessionStoreEntries = [

];

export const SessionStoreDefaults: SessionStoreEntries = [

];


export type StoreManagerHookFromEntries<T> = UnionToIntersection<{
  [S in keyof T]: T[S] extends [(infer K) & OrdinaryId[], infer V] ? SpecializedStoreManagerHook<K, V> : never;
}[(keyof T) & number]>;


export type PersistentStoreManagerHook = StoreManagerHookFromEntries<PersistentStoreEntries>;
export type SessionStoreManagerHook = StoreManagerHookFromEntries<SessionStoreEntries>;

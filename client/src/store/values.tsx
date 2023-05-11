import type { UnionToIntersection } from 'pr1-shared';
import type { SpecializedStoreManagerHook } from './store-manager';
import type { OrdinaryId } from '../interfaces/util';


export enum GraphDirection {
  Horizontal,
  Vertical
}

export enum ShortcutDisplayMode {
  Default,
  Disabled,
  Symbol
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

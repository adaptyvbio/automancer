import type { DiagnosticBaseReference } from './diagnostic';
import type { MasterItem } from './master';
import { RichText } from './rich-text';


export type Effect = MasterItem<{
  type: string;
  references: DiagnosticBaseReference[];
}>;

export interface GenericEffect extends Effect {
  type: 'generic';
  description: RichText | null;
  icon: string | null;
  message: string;
}

export type RichText = RichTextComponent[];

export type RichTextComponent = string | {
  type: 'code';
  value: RichText;
} | {
  type: 'link';
  url: string;
  value: RichText;
} | {
  type: 'strong';
  value: RichText;
};

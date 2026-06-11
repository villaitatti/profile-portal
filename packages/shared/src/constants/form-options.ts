export const TITLE_OPTIONS = [
  'Dr.',
  'Prof.',
  'Mr.',
  'Mrs.',
  'Ms.',
  'Mx.',
] as const;

export type TitleOption = (typeof TITLE_OPTIONS)[number];

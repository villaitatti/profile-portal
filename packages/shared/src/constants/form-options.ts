export const TITLE_OPTIONS = [
  'Mr.',
  'Mrs.',
  'Ms.',
  'Mx.',
  'Dr.',
  'Prof.',
  'Prefer not to say',
] as const;

export type TitleOption = (typeof TITLE_OPTIONS)[number];

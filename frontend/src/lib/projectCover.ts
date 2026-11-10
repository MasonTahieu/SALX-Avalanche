import type { Project } from '../types/domain';

export type ProjectCoverKind = 'wind' | 'solar' | 'hydro' | 'mangrove' | 'cookstove' | 'forest' | 'generic';

// Checked in order against the project's name and type, without diacritics,
// so Vietnamese names match too ("Điện gió" -> "dien gio"). Cookstoves and
// mangroves come first because their projects are often typed broadly as
// "Renewable Energy" or "Forestry".
const RULES: Array<[ProjectCoverKind, RegExp]> = [
  ['cookstove', /cook ?stove|\bstoves?\b|\bbep\b/],
  ['mangrove', /mangrove|ngap man|\bduoc\b/],
  ['wind', /\bwind|dien gio|phong dien/],
  ['solar', /solar|photovoltaic|\bpv\b|mat troi/],
  ['hydro', /hydro|thuy dien/],
  ['forest', /forest|reforest|afforest|\btrees?\b|\brung\b|trong cay/],
];

const plain = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Which illustration fits a project, from its name and project type. */
export function projectCoverKind(project?: Pick<Project, 'projectName' | 'projectMetadata'> | null): ProjectCoverKind {
  const type = (project?.projectMetadata as any)?.properties?.project_type;
  const text = plain([project?.projectName, type].filter(Boolean).join(' '));
  for (const [kind, pattern] of RULES) {
    if (pattern.test(text)) return kind;
  }
  return 'generic';
}

// Kinds drawn in more than one version; the rest are mirrored for variety.
const VARIANTS: Partial<Record<ProjectCoverKind, number>> = { mangrove: 2 };

/**
 * The cover image for a project. Projects of the same kind take turns through
 * the kind's versions and mirror images, so neighbouring cards differ.
 */
export function projectCoverImage(kind: ProjectCoverKind, projectId: number) {
  const versions = VARIANTS[kind] ?? 1;
  const version = projectId % versions;
  const file = version === 0 ? kind : `${kind}-${version + 1}`;
  return {
    src: `/assets/covers/${file}.svg`,
    mirrored: Math.floor(projectId / versions) % 2 === 1,
  };
}

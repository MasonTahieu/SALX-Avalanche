import type { Project } from '../../types/domain';
import { projectCoverImage, projectCoverKind } from '../../lib/projectCover';

interface ProjectCoverProps {
  project?: Project;
  projectId: number;
  eager?: boolean;
}

/**
 * The illustration for a project's kind (wind, solar, hydro, mangrove,
 * cookstove, forest, or a contour-map fallback). It fills its positioned
 * parent and is decorative: the card's title names the project.
 */
export function ProjectCover({ project, projectId, eager = false }: ProjectCoverProps) {
  const { src, mirrored } = projectCoverImage(projectCoverKind(project), projectId);
  return (
    <img
      src={src}
      alt=""
      width={600}
      height={512}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: mirrored ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}

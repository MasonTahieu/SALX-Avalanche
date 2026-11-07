import type { Project } from '../types/domain';
import { env } from '../config/env';

const property = (project: Project, key: string) => project.projectMetadata?.properties?.[key];

export function projectDisplay(project?: Project) {
  const meta = project?.projectMetadata || {};
  const props = meta.properties || {};
  const monitoring = props.monitoring_period || {};
  return {
    description: String(meta.description || ''),
    image: String(meta.image || ''),
    projectType: String(props.project_type || ''),
    location: String(props.location || ''),
    methodology: String(props.methodology || ''),
    monitoringStart: String(monitoring.start || ''),
    monitoringEnd: String(monitoring.end || ''),
  };
}

const BARE_CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{50,})$/i;

/**
 * HTTP link for an IPFS reference (`ipfs://CID[/path]` or a bare CID) through
 * the configured gateway; other URLs are returned unchanged. `filename` names
 * the file when it is saved, while the gateway still shows it inline
 * (`Content-Disposition: inline; filename=...`).
 */
export function ipfsToHttp(uri?: string | null, filename?: string) {
  if (!uri) return '';
  const value = uri.trim();
  let path: string | null = null;
  if (value.startsWith('ipfs://')) path = value.slice('ipfs://'.length).replace(/^ipfs\//, '');
  else if (BARE_CID.test(value)) path = value;
  if (!path) return value;
  const url = `${env.ipfsGatewayUrl}/${path}`;
  return filename ? `${url}?filename=${encodeURIComponent(filename)}` : url;
}

export function projectAttribute(project: Project, trait: string) {
  const attributes = Array.isArray(project.projectMetadata?.attributes) ? project.projectMetadata?.attributes : [];
  const match = attributes.find((item: any) => String(item?.trait_type).toLowerCase() === trait.toLowerCase());
  return match?.value == null ? '' : String(match.value);
}

export function projectSearchText(project?: Project) {
  if (!project) return '';
  const details = projectDisplay(project);
  return [project.projectName, project.onChainProjectId, details.projectType, details.location, details.methodology]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function projectMetadataIsValid(project?: Project) {
  return project?.metadataValidationStatus === 'VALID';
}

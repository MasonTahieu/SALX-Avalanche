import { describe, it, expect } from 'vitest';
import { projectCoverImage, projectCoverKind } from '../../lib/projectCover';

const project = (projectName: string, projectType = '') => ({
  projectName,
  projectMetadata: { properties: { project_type: projectType } },
});

describe('project covers', () => {
  it('matches the demo projects by name before their broad type', () => {
    expect(projectCoverKind(project('Krông Pắc Improved Cookstoves', 'Renewable Energy'))).toBe('cookstove');
    expect(projectCoverKind(project('Thốt Nốt Rice Mill Rooftop Solar', 'Renewable Energy'))).toBe('solar');
    expect(projectCoverKind(project('Ngọc Hiển Mangrove Restoration Pilot', 'Mangrove Restoration'))).toBe('mangrove');
  });

  it('does not mistake the place name Cần Giờ for wind power', () => {
    expect(projectCoverKind(project('E2E Test - Can Gio Mangrove', 'Mangrove restoration'))).toBe('mangrove');
    expect(projectCoverKind(project('Cần Giờ community project', ''))).toBe('generic');
  });

  it('understands English and Vietnamese project names', () => {
    expect(projectCoverKind(project('Bạc Liêu Wind Farm'))).toBe('wind');
    expect(projectCoverKind(project('Nhà máy điện gió Ninh Thuận'))).toBe('wind');
    expect(projectCoverKind(project('Dự án điện mặt trời Tây Ninh'))).toBe('solar');
    expect(projectCoverKind(project('Thủy điện nhỏ Sơn La'))).toBe('hydro');
    expect(projectCoverKind(project('Sơn La Small Hydro', 'Hydropower'))).toBe('hydro');
    expect(projectCoverKind(project('Trồng rừng phòng hộ', ''))).toBe('forest');
    expect(projectCoverKind(project('Community Project', 'Afforestation'))).toBe('forest');
    expect(projectCoverKind(project('Bếp đun cải tiến'))).toBe('cookstove');
  });

  it('falls back to the contour cover', () => {
    expect(projectCoverKind(project('Rice straw biochar'))).toBe('generic');
    expect(projectCoverKind(undefined)).toBe('generic');
  });

  it('gives neighbouring projects of one kind different covers', () => {
    // Mangroves have two versions: the two demo mangrove projects (#1, #2) differ.
    expect(projectCoverImage('mangrove', 1)).toEqual({ src: '/assets/covers/mangrove-2.svg', mirrored: false });
    expect(projectCoverImage('mangrove', 2)).toEqual({ src: '/assets/covers/mangrove.svg', mirrored: true });
    // Single-version kinds alternate with a mirror image.
    expect(projectCoverImage('hydro', 4)).toEqual({ src: '/assets/covers/hydro.svg', mirrored: false });
    expect(projectCoverImage('hydro', 5)).toEqual({ src: '/assets/covers/hydro.svg', mirrored: true });
  });
});

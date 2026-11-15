import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/backend', () => ({
  backend: { certificateByToken: vi.fn() },
}));

vi.mock('../../services/blockchain', () => ({
  certificateOnChain: vi.fn(),
}));

import { VerifyCertificatePage } from '../../pages/VerifyCertificatePage';
import { backend } from '../../services/backend';
import { ApiError } from '../../services/api';
import { certificateOnChain } from '../../services/blockchain';
import { env } from '../../config/env';
import { certificateImageUrl } from '../../lib/certificateImage';

const OWNER = '0x1111111111111111111111111111111111111111';

const ON_CHAIN = {
  tokenId: 3,
  owner: OWNER,
  retirer: OWNER,
  projectId: 2,
  projectCount: 1,
  salAmount: 5,
  co2Kg: 50,
  retiredAt: 1_762_750_000,
  certificateURI: 'ipfs://QmCert',
  revoked: false,
};

const RECORD = {
  certificateTokenId: 3,
  ownerAddress: OWNER,
  projectId: 2,
  projectName: 'Ngọc Hiển Mangrove',
  projectCount: 1,
  retiredTokenAmount: 5,
  retiredCO2Kg: 50,
  certificateURI: 'ipfs://QmCert',
  txHash: '0xretire',
  status: 'ACTIVE' as const,
};

async function openPage(path = '/verify/3') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify/:tokenId" element={<VerifyCertificatePage />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe('VerifyCertificatePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(certificateOnChain).mockResolvedValue(ON_CHAIN);
    vi.mocked(backend.certificateByToken).mockResolvedValue(RECORD as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });

  it('confirms a certificate that matches the chain, with QR and share links', async () => {
    await openPage();

    expect(screen.getByRole('heading', { name: 'Certificate SBT #3' })).toBeTruthy();
    expect(screen.getByText('50 kg CO₂e retired · Ngọc Hiển Mangrove')).toBeTruthy();
    expect(screen.getByText(`Verified on ${env.chainName}`)).toBeTruthy();
    expect(screen.getByText('Matches the chain')).toBeTruthy();
    expect(screen.getByText('Active, cannot be transferred or resold')).toBeTruthy();
    expect(screen.getByRole('img', { name: /QR code linking to .*\/verify\/3$/ })).toBeTruthy();

    const linkedIn = screen.getByRole('link', { name: 'Share on LinkedIn' }).getAttribute('href')!;
    expect(new URL(linkedIn).searchParams.get('url')).toBe(`${env.apiUrl}/api/certificates/token/3/share`);
    const facebook = screen.getByRole('link', { name: 'Share on Facebook' }).getAttribute('href')!;
    expect(new URL(facebook).searchParams.get('u')).toBe(`${env.apiUrl}/api/certificates/token/3/share`);
    expect(screen.getByRole('link', { name: 'Download QR' }).getAttribute('download')).toBe('SALX-SBT-3-QR.svg');
    // No link back to this same page from the certificate card.
    expect(screen.queryByRole('link', { name: /Verify & share/ })).toBeNull();
    expect(certificateOnChain).toHaveBeenCalledWith(3);
  });

  it('flags a revoked certificate and offers no sharing', async () => {
    vi.mocked(certificateOnChain).mockResolvedValue({ ...ON_CHAIN, revoked: true });
    await openPage();

    expect(screen.getByText('This certificate was revoked')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Share on LinkedIn' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Share on Facebook' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share on Instagram' })).toBeNull();
  });

  it('offers a downloadable certificate for Instagram on browsers without file sharing', async () => {
    const fetchImage = vi.fn();
    vi.stubGlobal('fetch', fetchImage);
    await openPage();

    fireEvent.click(screen.getByRole('button', { name: 'Share on Instagram' }));

    expect(screen.getByRole('link', { name: 'Download image' }).getAttribute('href')).toBe(certificateImageUrl(3, 'download'));
    expect(screen.getByRole('link', { name: /Open Instagram/ }).getAttribute('href')).toBe('https://www.instagram.com/');
    expect(screen.queryByRole('button', { name: 'Share image' })).toBeNull();
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('passes the prepared PNG to the system share menu on a separate tap', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperties(navigator, {
      share: { configurable: true, value: share },
      canShare: { configurable: true, value: vi.fn().mockReturnValue(true) },
    });
    const fetchImage = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['PNG bytes'], { type: 'image/png' }),
    });
    vi.stubGlobal('fetch', fetchImage);
    await openPage();

    fireEvent.click(screen.getByRole('button', { name: 'Share on Instagram' }));
    const shareButton = await screen.findByRole('button', { name: 'Share image' });
    expect(fetchImage).toHaveBeenCalledWith(certificateImageUrl(3), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(share).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(shareButton); });
    expect(share.mock.calls[0][0].files?.[0]).toMatchObject({ name: 'SALX-SBT-3.png', type: 'image/png' });
  });

  it('warns when SALX’s copy differs from the chain', async () => {
    vi.mocked(backend.certificateByToken).mockResolvedValue({ ...RECORD, retiredCO2Kg: 500 } as any);
    await openPage();

    expect(screen.getByText('On Avalanche, but SALX’s copy differs')).toBeTruthy();
    expect(screen.getByText('Differs from the chain')).toBeTruthy();
  });

  it('says so when the certificate does not exist', async () => {
    vi.mocked(certificateOnChain).mockResolvedValue(null);
    vi.mocked(backend.certificateByToken).mockRejectedValue(new ApiError(404, { error: 'Không tìm thấy chứng chỉ' }));
    await openPage('/verify/99');

    expect(screen.getByText('No certificate SBT #99 exists')).toBeTruthy();
    expect(screen.queryByText(/artwork/)).toBeNull();
    expect(screen.queryByText('On-chain record')).toBeNull();
  });

  it('still checks the chain when the SALX backend is down', async () => {
    vi.mocked(backend.certificateByToken).mockRejectedValue(new Error('Failed to fetch'));
    await openPage();

    expect(screen.getByText(`Verified on ${env.chainName}`)).toBeTruthy();
    expect(screen.getByText('Not available')).toBeTruthy();
    expect(screen.getByText(/artwork is not available right now/)).toBeTruthy();
  });

  it('offers a retry when Avalanche cannot be reached', async () => {
    vi.mocked(certificateOnChain).mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(ON_CHAIN);
    await openPage();

    expect(screen.getByText('Could not reach Avalanche')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(screen.getByText(`Verified on ${env.chainName}`)).toBeTruthy();
  });

  it('rejects a link that is not a certificate number', async () => {
    await openPage('/verify/abc');

    expect(screen.getByText('Not a certificate number')).toBeTruthy();
    expect(certificateOnChain).not.toHaveBeenCalled();
  });
});

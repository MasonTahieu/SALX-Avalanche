import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Listing } from '../../types/domain';

vi.mock('../../services/backend', () => ({
  backend: {
    createCertificateMetadata: vi.fn(),
    certificateByTx: vi.fn(),
  },
}));

vi.mock('../../services/blockchain', () => ({
  buySAL: vi.fn(),
  ensureMarketplaceApproval: vi.fn(),
  isMarketplaceApproved: vi.fn(),
  retireSAL: vi.fn(),
  retirementConfig: vi.fn(),
}));

vi.mock('../../contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

import { CheckoutDialog } from '../../components/marketplace/CheckoutDialog';
import { backend } from '../../services/backend';
import { buySAL, ensureMarketplaceApproval, isMarketplaceApproved, retireSAL, retirementConfig } from '../../services/blockchain';
import { useWallet } from '../../contexts/WalletContext';

const LISTING: Listing = {
  listingId: 3,
  projectId: 2,
  sellerAddress: '0xseller',
  initialAmount: 1200,
  remainingAmount: 1200,
  pricePerUnitWei: '2000000000000000',
  pricePerUnitETH: '0.002',
  active: true,
};

const PROJECT = {
  _id: 'p2',
  onChainProjectId: 2,
  projectName: 'Ngọc Hiển Mangrove',
  projectMetadata: { properties: { project_type: 'Mangrove restoration', location: 'Cà Mau, Vietnam' } },
} as any;

const MINTED = {
  tokenId: 3,
  owner: '0xbuyer',
  projectId: 2,
  salAmount: 5,
  co2Kg: 50,
  certificateURI: 'ipfs://QmCert',
  txHash: '0xretire',
};

const CERTIFICATE = {
  certificateTokenId: 3,
  ownerAddress: '0xbuyer',
  projectId: 2,
  retiredTokenAmount: 5,
  retiredCO2Kg: 50,
  status: 'ACTIVE' as const,
};

function mockWallet(overrides: Record<string, unknown> = {}) {
  const wallet: any = {
    address: '0xbuyer',
    modalOpen: false,
    nativeBalance: '1',
    walletKind: 'metamask',
    openWalletModal: vi.fn(),
    refreshBalance: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  vi.mocked(useWallet).mockImplementation(() => wallet);
  return wallet;
}

async function renderDialog() {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <CheckoutDialog listing={LISTING} project={PROJECT} amount={5} onClose={onClose} />
    </MemoryRouter>,
  );
  // Let the fee and approval reads on mount settle.
  await act(async () => {});
  return { onClose };
}

const confirmButton = () => screen.getByRole('button', { name: /confirm|connect wallet|try again|processing/i });

describe('CheckoutDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockWallet();
    vi.mocked(retirementConfig).mockResolvedValue({ maxProjects: 5, kgPerSAL: 10, certificateFeeETH: '0.001' });
    vi.mocked(isMarketplaceApproved).mockResolvedValue(true);
    vi.mocked(buySAL).mockResolvedValue({ txHash: '0xbuy', blockNumber: 1 });
    vi.mocked(ensureMarketplaceApproval).mockResolvedValue(null);
    vi.mocked(backend.createCertificateMetadata).mockResolvedValue({
      certificateURI: 'ipfs://QmCert',
      imageURI: 'ipfs://QmImg',
      authorization: { nonce: 0, deadline: 9999999999, signature: '0xSIG', signer: '0xSigner' },
    } as any);
    vi.mocked(retireSAL).mockResolvedValue({ txHash: '0xretire', blockNumber: 2, minted: MINTED });
    vi.mocked(backend.certificateByTx).mockResolvedValue(CERTIFICATE as any);
  });

  it('shows the price, certificate fee and total before anything is signed', async () => {
    await renderDialog();

    expect(screen.getByRole('dialog', { name: 'Ngọc Hiển Mangrove' })).toBeTruthy();
    expect(screen.getByText('5 × 0.002 AVAX = 0.01 AVAX')).toBeTruthy();
    expect(screen.getByText('0.001 AVAX')).toBeTruthy();
    expect(screen.getByText('0.011 AVAX')).toBeTruthy();
    expect(screen.getByText('You will confirm 2 transactions in your wallet.')).toBeTruthy();
    expect(confirmButton().textContent).toBe('Confirm and get certificate');
    expect(buySAL).not.toHaveBeenCalled();
  });

  it('only buys once "Retire now" is unticked', async () => {
    await renderDialog();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Retire now and get my certificate' }));

    expect(screen.queryByText('Retire and mint certificate')).toBeNull();
    expect(screen.queryByText('Certificate fee')).toBeNull();
    expect(screen.getByText('You will confirm 1 transaction in your wallet.')).toBeTruthy();
    expect(confirmButton().textContent).toBe('Confirm purchase');
  });

  it('blocks the purchase when the wallet cannot cover the total', async () => {
    mockWallet({ nativeBalance: '0.005' });
    await renderDialog();

    expect(screen.getByText(/Your wallet has 0.005 AVAX, but this needs 0.011 AVAX/)).toBeTruthy();
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes on Escape while idle, but not while a step is running', async () => {
    let finishPurchase!: (value: { txHash: string; blockNumber: number }) => void;
    vi.mocked(buySAL).mockImplementation(() => new Promise(resolve => { finishPurchase = resolve; }));
    const { onClose } = await renderDialog();
    const dialog = screen.getByRole('dialog');

    await act(async () => { fireEvent.click(confirmButton()); });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { finishPurchase({ txHash: '0xbuy', blockNumber: 1 }); });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('goes inert while the wallet dialog is open on top of it', async () => {
    mockWallet({ address: null, modalOpen: true, nativeBalance: null });
    await renderDialog();

    expect(document.querySelector('.checkout')?.hasAttribute('inert')).toBe(true);
  });

  it('shows the SBT from the receipt before the backend has recorded it', async () => {
    vi.mocked(backend.certificateByTx).mockResolvedValue({ status: 'PENDING' });
    await renderDialog();

    await act(async () => { fireEvent.click(confirmButton()); });

    expect(screen.getByText('Certificate minted')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Retired 5 SAL/ })).toBeTruthy();
    expect(screen.getByText('SBT #3 · on-chain')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Drawing the certificate artwork/);
    // No artwork yet, so nothing to download.
    expect(screen.queryByRole('link', { name: /Download certificate/ })).toBeNull();
    expect(screen.getByRole('link', { name: /View on Snowtrace/ }).getAttribute('href')).toMatch(/\/tx\/0xretire$/);
  });

  it('ends on the certificate once the flow finishes', async () => {
    await renderDialog();

    await act(async () => { fireEvent.click(confirmButton()); });

    expect(screen.getByText('Certificate minted')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Retired 5 SAL/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View all certificates' }).getAttribute('href')).toBe('/dashboard?tab=certificates');
  });
});

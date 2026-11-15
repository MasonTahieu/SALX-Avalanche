import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FootprintCalculator } from '../../components/home/FootprintCalculator';
import { MarketplacePage } from '../../pages/MarketplacePage';
import { backend } from '../../services/backend';
import type { Listing } from '../../types/domain';

vi.mock('../../services/backend', () => ({
  backend: { listings: vi.fn(), projects: vi.fn() },
}));

vi.mock('../../components/marketplace/CheckoutDialog', () => ({
  CheckoutDialog: ({ amount }: { amount: number }) => <div role="dialog">{amount} SAL in checkout</div>,
}));

const listing: Listing = {
  listingId: 1,
  projectId: 1,
  sellerAddress: '0xseller',
  initialAmount: 20,
  remainingAmount: 20,
  pricePerUnitWei: '1000000000000000',
  pricePerUnitETH: '0.001',
  active: true,
};

describe('Footprint estimate to checkout', () => {
  beforeEach(() => {
    vi.mocked(backend.listings).mockResolvedValue([
      listing,
      { ...listing, listingId: 2, projectId: 2, remainingAmount: 1 },
    ]);
    vi.mocked(backend.projects).mockResolvedValue([]);
  });

  it('updates the suggested quantity from the selected scenario and rounds up to whole SAL', () => {
    render(<MemoryRouter><FootprintCalculator /></MemoryRouter>);
    expect(screen.getByText('10.9')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Find projects for 2 SAL/ }).getAttribute('href')).toBe('/marketplace?sal=2');

    fireEvent.click(screen.getByRole('button', { name: 'Office' }));
    expect(screen.getByText('185.61')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Find projects for 19 SAL/ })).toBeTruthy();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Monthly electricity use (kWh)' }), { target: { value: '12.5' } });
    expect(screen.getByText('7.73')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Find projects for 1 SAL/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Event' }));
    expect(screen.getByText('29.07')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Find projects for 3 SAL/ })).toBeTruthy();

    const trips = screen.getByRole('spinbutton', { name: 'Motorbike round trips' });
    fireEvent.change(trips, { target: { value: '52' } });
    expect(screen.getByRole('link', { name: /Find projects for 4 SAL/ })).toBeTruthy();

    fireEvent.change(trips, { target: { value: '0' } });
    expect(screen.queryByRole('link', { name: /Find projects/ })).toBeNull();
  });

  it('shows listings with enough SAL and opens the existing checkout at the suggested quantity', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<FootprintCalculator />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /Find projects for 2 SAL/ }));
    await screen.findByRole('heading', { name: 'SAL Project #1' });
    expect(screen.queryByRole('heading', { name: 'SAL Project #2' })).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Quantity' }).value).toBe('2');

    fireEvent.click(screen.getByRole('button', { name: /Buy & Get Certificate/i }));
    expect(within(screen.getByRole('dialog')).getByText('2 SAL in checkout')).toBeTruthy();
  });

  it('lets visitors clear an unavailable quantity and browse the regular marketplace', async () => {
    render(<MemoryRouter initialEntries={['/marketplace?sal=30']}><MarketplacePage /></MemoryRouter>);
    expect(await screen.findByText('NO LISTINGS MATCH THIS QUANTITY AND YOUR FILTERS')).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Clear suggested quantity' }));
    const quantities = screen.getAllByRole<HTMLInputElement>('spinbutton', { name: 'Quantity' });
    expect(quantities.map(input => input.value)).toEqual(['1', '1']);
  });
});

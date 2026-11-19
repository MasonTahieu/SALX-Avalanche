import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CertificateCard } from '../../components/certificate/CertificateCard';
import * as esgAuditPdfModule from '../../lib/esgAuditPdf';
import type { Certificate } from '../../types/domain';

const CERTIFICATE: Certificate = {
  certificateTokenId: 5,
  ownerAddress: '0xf139e000000000000000000000000000000fddc82',
  projectId: 4,
  projectName: 'Thốt Nốt Rice Mill Rooftop Solar',
  retiredTokenAmount: 5,
  retiredCO2Kg: 50,
  mintedAt: '2026-11-18T08:34:00.000Z',
  txHash: '0xabc123',
  status: 'ACTIVE',
};

describe('CertificateCard ESG Audit PDF button', () => {
  it('renders Export ESG Audit PDF button and triggers export on click', () => {
    const exportSpy = vi.spyOn(esgAuditPdfModule, 'exportEsgAuditPdf').mockImplementation(() => {});

    render(
      <MemoryRouter>
        <CertificateCard certificate={CERTIFICATE} />
      </MemoryRouter>
    );

    const pdfButton = screen.getByRole('button', { name: /Export ESG Audit PDF/i });
    expect(pdfButton).toBeTruthy();

    fireEvent.click(pdfButton);
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(exportSpy).toHaveBeenCalledWith(CERTIFICATE, undefined);

    exportSpy.mockRestore();
  });
});

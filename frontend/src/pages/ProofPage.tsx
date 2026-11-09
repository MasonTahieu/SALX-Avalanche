import { useEffect, useState } from 'react';
import { env } from '../config/env';
import { formatDate, shortAddress } from '../lib/format';
import { formatFee, proofActionLabel } from '../lib/proofFormat';
import { backend } from '../services/backend';
import type { ProofReport } from '../types/domain';
import './ProofPage.css';

const CONTRACTS = [
  { name: 'SALMarketplace', role: 'Listings, purchases, votes and retirement', address: env.marketplaceAddress },
  { name: 'SAL1155', role: 'SAL credit token, one token ID per project', address: env.sal1155Address },
  { name: 'GreenCertificateSBT', role: 'Soulbound retirement certificates', address: env.certificateAddress },
];

export function ProofPage() {
  const [report, setReport] = useState<ProofReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    backend.proof()
      .then((data) => { if (active) setReport(data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const totalTransactions = report?.activity.reduce((sum, item) => sum + item.count, 0) ?? null;

  return (
    <div className="proof">
      <header className="proof-head">
        <span className="proof-kicker">PROOF / {env.chainName}</span>
        <h1 className="proof-title">Check it<br />on-chain.</h1>
        <p className="proof-lead">
          Every number here comes from SALX transactions on the {env.chainName} testnet.
          Open any link to check it yourself on Snowtrace.
        </p>
      </header>

      <section className="proof-metrics" aria-label="Network measurements">
        <Metric
          label="Avg block time"
          value={report?.blockTime ? `${report.blockTime.averageSeconds}s` : '—'}
          note={report?.blockTime ? `Across the last ${report.blockTime.sampleBlocks} blocks` : 'Not available right now'}
        />
        <Metric
          label="Indexed actions"
          value={totalTransactions == null ? '—' : String(totalTransactions)}
          note="Mint, buy and retire"
        />
        <Metric
          label="Latest block"
          value={report?.latestBlock ? report.latestBlock.toLocaleString('en-US') : '—'}
          note={report ? `Updated ${formatDate(report.generatedAt)}` : 'Not available right now'}
        />
      </section>

      {failed && (
        <p className="proof-notice" role="status">
          Live numbers could not be loaded. The contract links below still work.
        </p>
      )}

      <section className="proof-section">
        <h2 className="proof-heading">Contracts</h2>
        <div className="proof-contracts">
          {CONTRACTS.map((contract) => (
            <a
              key={contract.name}
              className="proof-contract"
              href={`${env.blockExplorerUrl}/address/${contract.address}#code`}
              target="_blank"
              rel="noreferrer"
            >
              <strong>{contract.name}</strong>
              <span>{contract.role}</span>
              <code>{shortAddress(contract.address, 8, 6)} ↗</code>
            </a>
          ))}
        </div>
      </section>

      {report && (
        <>
          <section className="proof-section">
            <h2 className="proof-heading">Measured cost per action</h2>
            <div className="proof-table-wrap">
              <table className="proof-table">
                <thead>
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">Transactions</th>
                    <th scope="col">Avg gas</th>
                    <th scope="col">Avg network fee</th>
                  </tr>
                </thead>
                <tbody>
                  {report.activity.map((item) => (
                    <tr key={item.type}>
                      <td>{proofActionLabel(item.type)}</td>
                      <td>{item.count}</td>
                      <td>{item.averageGasUsed == null ? '—' : item.averageGasUsed.toLocaleString('en-US')}</td>
                      <td>{formatFee(item.averageFeeAvax, env.nativeSymbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="proof-footnote">
              Network fee is gas used × gas price, read from transaction receipts. It excludes the SAL price and the
              certificate fee. Testnet fees can differ from mainnet.
            </p>
          </section>

          <section className="proof-section">
            <h2 className="proof-heading">Recent transactions</h2>
            {report.recent.length === 0 ? (
              <p className="proof-footnote">No transactions indexed yet.</p>
            ) : (
              <div className="proof-table-wrap">
                <table className="proof-table">
                  <thead>
                    <tr>
                      <th scope="col">Action</th>
                      <th scope="col">Transaction</th>
                      <th scope="col">Block</th>
                      <th scope="col">Time</th>
                      <th scope="col">Network fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.recent.map((tx) => (
                      <tr key={`${tx.type}-${tx.txHash}`}>
                        <td>{proofActionLabel(tx.type)}</td>
                        <td>
                          <a href={`${env.blockExplorerUrl}/tx/${tx.txHash}`} target="_blank" rel="noreferrer">
                            {shortAddress(tx.txHash, 8, 6)} ↗
                          </a>
                        </td>
                        <td>{tx.blockNumber.toLocaleString('en-US')}</td>
                        <td>{formatDate(tx.timestamp)}</td>
                        <td>{formatFee(tx.feeAvax, env.nativeSymbol)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="proof-metric">
      <span className="proof-metric-label">{label}</span>
      <strong className="proof-metric-value">{value}</strong>
      <span className="proof-metric-note">{note}</span>
    </div>
  );
}

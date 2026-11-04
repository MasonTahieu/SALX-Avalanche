import { type ChangeEvent, type DragEvent, type FormEvent, useRef, useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { useDocumentUpload } from '../components/submit/useDocumentUpload';
import { useProjectSubmit } from '../components/submit/useProjectSubmit';
import { networkById } from '../config/networks';
import { env } from '../config/env';

const MONO = "'JetBrains Mono', monospace";
const SYNE = "'Syne', sans-serif";

const STEPS = [
  { n: 1, label: 'DOCUMENTS' },
  { n: 2, label: 'PROJECT INFO' },
  { n: 3, label: 'REVIEW' },
  { n: 4, label: 'ON-CHAIN' },
];

const PROJECT_TYPES = [
  'Mangrove Restoration',
  'Renewable Energy',
  'Avoided Deforestation',
  'Soil Carbon',
  'Blue Carbon',
];

const CARBON_STANDARDS = [
  'Verra (VCS)',
  'Gold Standard',
  'ACR',
  'CAR',
];

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--surf2)',
  border: '1px solid var(--bd-str)',
  borderRadius: 8,
  padding: '11px 14px',
  fontSize: 12,
  color: 'var(--ink)',
  fontFamily: MONO,
  outline: 'none',
  boxSizing: 'border-box',
};

type WizStep = 1 | 2 | 3;

export function SubmitProjectPage() {
  const wallet = useWallet();
  const networkSymbol = networkById(wallet.chainId)?.symbol ?? env.nativeSymbol;
  const [wizStep, setWizStep] = useState<WizStep>(1);
  const [done, setDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useDocumentUpload();
  const submit = useProjectSubmit();

  // Logical step 1 → visual step 1 (DOCUMENTS)
  const handleStep1 = async () => {
    if (upload.isUploading) return;
    if (upload.entries.some(e => e.status === 'pending')) await upload.uploadAll();
    setWizStep(2);
  };

  // Logical step 2 → visual step 2 (PROJECT INFO) → generates metadata
  const handleStep2 = async (e: FormEvent) => {
    e.preventDefault();
    if (!wallet.address) { wallet.openWalletModal(); return; }
    const docs = upload.entries.filter(e => e.status === 'done' && e.uri != null).map(e => ({ name: e.file.name, uri: e.uri! }));
    const ok = await submit.fetchMetadata(docs);
    if (ok) setWizStep(3);
  };

  // Logical step 3 → visual step 3/4 (REVIEW → ON-CHAIN)
  const handleStep3 = async () => {
    if (!wallet.address) { wallet.openWalletModal(); return; }
    const ok = await submit.submitOnChain();
    if (ok) setDone(true);
  };

  const handleFileDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) upload.addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) upload.addFiles(Array.from(e.target.files));
  };

  // Derive visual step: step 3 = REVIEW, step 4 = ON-CHAIN treated as both active when wizStep===3
  const visualStep = wizStep === 3 ? 4 : wizStep;

  if (done && submit.txHash) {
    return (
      <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
        <div className="home-dc-section" style={{ padding: '60px 34px 80px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(45,201,34,.15)', border: '1px solid rgba(45,201,34,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 22, color: 'var(--g)' }}>
            ✓
          </div>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--mut)' }}>SUBMIT / CONFIRMED</span>
          <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(32px,5vw,48px)', margin: '12px 0 8px', color: 'var(--ink)' }}>Project submitted.</h1>
          <p style={{ fontSize: 12, color: 'var(--mut)', maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.6 }}>
            "{submit.form.projectName}" is pending validator review. SAL will be minted once quorum is reached and admin confirms.
          </p>
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bd-str)', borderRadius: 8, padding: '12px 18px', fontFamily: MONO, fontSize: 9, color: 'var(--mut)', wordBreak: 'break-all', maxWidth: 560, margin: '0 auto' }}>
            TX: {submit.txHash}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-dc" style={{ animation: 'fadeUp .35s ease' }}>
      <div className="home-dc-section" style={{ maxWidth: 780, padding: '44px 34px 80px' }}>

        {/* Header */}
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>SUBMIT / NEW PROJECT</span>
        <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 'clamp(32px,5vw,48px)', lineHeight: 1, letterSpacing: '-.02em', margin: '10px 0 6px', color: 'var(--ink)' }}>Submit Carbon Project</h1>
        <p style={{ fontSize: 11, color: 'var(--mut)', margin: '0 0 32px', lineHeight: 1.6 }}>
          Metadata uploaded to IPFS. On-chain deposit = proposed SAL × tokenization fee.
        </p>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 36 }}>
          {STEPS.map((s, i) => {
            const active = s.n === visualStep;
            const done = s.n < visualStep;
            return (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: active ? 'var(--g)' : done ? 'rgba(45,201,34,.25)' : 'var(--surf2)', border: `1px solid ${active ? 'var(--g)' : done ? 'rgba(45,201,34,.4)' : 'var(--bd-str)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 9, color: active ? '#06110b' : done ? 'var(--g)' : 'var(--mut)', fontWeight: 700, flexShrink: 0 }}>
                    {done ? '✓' : s.n}
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.1em', color: active ? 'var(--ink)' : 'var(--mut)', whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 1, background: done ? 'rgba(45,201,34,.4)' : 'var(--bd-str)', margin: '0 6px', marginBottom: 18 }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: DOCUMENTS ── */}
        {wizStep === 1 && (
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bd-str)', borderRadius: 12, padding: '22px 24px' }}>
            <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)' }}>MRV DOCUMENTS</span>
            <p style={{ fontSize: 11, color: 'var(--mut)', margin: '6px 0 18px', lineHeight: 1.5 }}>
              Up to 20 files · Max 5 MB each · PDF, PNG, JPG
            </p>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? 'var(--g)' : 'var(--bd-str)'}`, borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s', background: dragOver ? 'rgba(45,201,34,.04)' : 'transparent' }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>⬆</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: dragOver ? 'var(--g)' : 'var(--mut)', letterSpacing: '.08em' }}>DRAG & DROP OR CLICK</div>
              <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mut)', marginTop: 4 }}>PDF, PNG, JPG · Max 5 MB each</div>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleFileInput} />
            </div>

            {/* File list */}
            {upload.entries.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {upload.entries.map((entry, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surf2)', border: '1px solid var(--bd-str)', borderRadius: 7, padding: '9px 12px' }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: entry.status === 'done' ? 'var(--g)' : entry.status === 'error' ? '#ff6b5b' : 'var(--ink)' }}>{entry.file.name}</div>
                      {entry.uri && <div style={{ fontFamily: MONO, fontSize: 7, color: 'var(--mut)', marginTop: 2 }}>IPFS: {entry.uri.slice(0, 40)}…</div>}
                    </div>
                    <button onClick={() => upload.removeFile(i)} style={{ background: 'none', border: 'none', color: 'var(--mut)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {upload.oversizedFileNames.length > 0 && (
              <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 8, color: '#ff6b5b' }}>
                FILES TOO LARGE: {upload.oversizedFileNames.join(', ')}
              </div>
            )}

            {upload.entries.length === 0 && (
              <p style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)', marginTop: 14, letterSpacing: '.06em', textAlign: 'center' }}>
                AT LEAST ONE DOCUMENT REQUIRED TO CONTINUE
              </p>
            )}

            <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
              <button
                onClick={handleStep1}
                disabled={upload.isUploading || upload.oversizedFileNames.length > 0 || upload.entries.length === 0}
                style={{ flex: 1, background: 'var(--g)', border: '1px solid var(--g)', borderRadius: 8, padding: '11px 0', fontFamily: MONO, fontSize: 9, letterSpacing: '.11em', fontWeight: 700, color: '#06110b', cursor: (upload.isUploading || upload.entries.length === 0) ? 'not-allowed' : 'pointer', opacity: (upload.isUploading || upload.entries.length === 0) ? .45 : 1, transition: 'opacity .15s' }}
              >
                {upload.isUploading ? 'UPLOADING…' : upload.entries.length > 0 ? 'UPLOAD TO IPFS →' : 'SKIP & CONTINUE →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: PROJECT INFO ── */}
        {wizStep === 2 && (
          <form onSubmit={handleStep2}>
            <div style={{ background: 'var(--surf)', border: '1px solid var(--bd-str)', borderRadius: 12, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)' }}>PROJECT DETAILS</span>

              {/* Full-width: Project Name */}
              <FieldGroup label="Project Name *">
                <input style={INPUT} type="text" placeholder="e.g. Cần Giờ Mangrove Restoration Phase III" value={submit.form.projectName} onChange={e => submit.setField('projectName', e.target.value)} required />
              </FieldGroup>

              {/* 2-col row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <FieldGroup label="Project Type *">
                  <select style={INPUT} value={submit.form.projectType} onChange={e => submit.setField('projectType', e.target.value)} required>
                    <option value="">Select type…</option>
                    {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FieldGroup>
                <FieldGroup label="Location *">
                  <input style={INPUT} type="text" placeholder="e.g. Ho Chi Minh City, Vietnam" value={submit.form.location} onChange={e => submit.setField('location', e.target.value)} required />
                </FieldGroup>
                <FieldGroup label="Proposed CO₂ (kg) *">
                  <input style={INPUT} type="number" min="1" placeholder="e.g. 50000" value={submit.form.proposedCO2Kg} onChange={e => submit.setField('proposedCO2Kg', e.target.value)} required />
                </FieldGroup>
                <FieldGroup label="Methodology">
                  <input style={INPUT} type="text" placeholder="e.g. VCS VM0033" value={submit.form.methodology} onChange={e => submit.setField('methodology', e.target.value)} />
                </FieldGroup>
                <FieldGroup label="Monitoring Start">
                  <input style={INPUT} type="date" value={submit.form.monitoringStart} onChange={e => submit.setField('monitoringStart', e.target.value)} />
                </FieldGroup>
                <FieldGroup label="Monitoring End">
                  <input style={INPUT} type="date" value={submit.form.monitoringEnd} onChange={e => submit.setField('monitoringEnd', e.target.value)} />
                </FieldGroup>
                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldGroup label="Carbon Standard">
                    <select style={INPUT} value={submit.form.carbonStandard} onChange={e => submit.setField('carbonStandard', e.target.value)}>
                      <option value="">Select standard…</option>
                      {CARBON_STANDARDS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </FieldGroup>
                </div>
              </div>

              <FieldGroup label="Description *">
                <textarea style={{ ...INPUT, minHeight: 90, resize: 'vertical' }} placeholder="Describe the project, methodology, and expected impact…" value={submit.form.description} onChange={e => submit.setField('description', e.target.value)} required />
              </FieldGroup>

              {submit.error && <ErrorBar message={submit.error} />}

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => { submit.clearError(); setWizStep(1); }} style={{ background: 'var(--surf2)', border: '1px solid var(--bd-str)', borderRadius: 8, padding: '10px 18px', fontFamily: MONO, fontSize: 9, color: 'var(--mut)', cursor: 'pointer' }}>← BACK</button>
                <button
                  type="submit"
                  disabled={submit.busy}
                  style={{ flex: 1, background: 'var(--g)', border: '1px solid var(--g)', borderRadius: 8, padding: '11px 0', fontFamily: MONO, fontSize: 9, letterSpacing: '.11em', fontWeight: 700, color: '#06110b', cursor: submit.busy ? 'not-allowed' : 'pointer', opacity: submit.busy ? .45 : 1, transition: 'opacity .15s' }}
                >
                  {submit.busy ? 'GENERATING…' : wallet.address ? 'GENERATE METADATA & PREVIEW DEPOSIT →' : 'CONNECT WALLET TO CONTINUE'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── Step 3: REVIEW + ON-CHAIN SUBMIT ── */}
        {wizStep === 3 && submit.metadata && (
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bd-str)', borderRadius: 12, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)' }}>REVIEW & SUBMIT ON-CHAIN</span>

            {/* Review table */}
            <div style={{ background: 'var(--surf2)', border: '1px solid var(--bd-str)', borderRadius: 8, overflow: 'hidden' }}>
              {[
                { label: 'PROJECT', value: submit.form.projectName },
                { label: 'TYPE', value: submit.form.projectType || '—' },
                { label: 'STANDARD', value: submit.form.carbonStandard || '—' },
                { label: 'LOCATION', value: submit.form.location || '—' },
                { label: 'PROPOSED CO₂', value: `${submit.metadata.proposedCO2Kg} kg → ${Math.floor(submit.metadata.proposedCO2Kg / 10)} SAL` },
                { label: 'DOCUMENTS', value: `${upload.entries.filter(e => e.status === 'done').length} uploaded` },
                { label: 'PROJECT URI', value: submit.metadata.projectURI },
              ].map((row, i) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '11px 14px', borderBottom: i < 6 ? '1px solid var(--bd-str)' : 'none' }}>
                  <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', color: 'var(--mut)', flexShrink: 0 }}>{row.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--ink)', textAlign: 'right', wordBreak: 'break-all' }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Deposit box */}
            <div style={{ background: 'rgba(45,201,34,.07)', border: '1px solid rgba(45,201,34,.28)', borderRadius: 8, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: '.12em', color: 'var(--mut)', textTransform: 'uppercase', marginBottom: 4 }}>ESTIMATED DEPOSIT</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mut)' }}>
                  {Math.floor(submit.metadata.proposedCO2Kg / 10)} SAL × tokenization fee
                </div>
              </div>
              <strong style={{ fontFamily: MONO, fontSize: 17, color: 'var(--g)' }}>
                {submit.metadata.valueETH} {networkSymbol}
              </strong>
            </div>

            <div style={{ background: 'var(--surf2)', border: '1px solid var(--bd-str)', borderRadius: 8, padding: '12px 14px', fontFamily: MONO, fontSize: 8, color: 'var(--mut)', lineHeight: 1.7 }}>
              The deposit is proportional to the proposed SAL amount. It is refunded if the project is rejected. Validators must vote and admin must confirm before SAL is minted.
            </div>

            {submit.error && <ErrorBar message={submit.error} />}

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => { submit.clearError(); setWizStep(2); }} style={{ background: 'var(--surf2)', border: '1px solid var(--bd-str)', borderRadius: 8, padding: '10px 18px', fontFamily: MONO, fontSize: 9, color: 'var(--mut)', cursor: 'pointer' }}>← BACK</button>
              <button type="button" onClick={handleStep3} disabled={submit.busy} style={{ flex: 1, background: 'linear-gradient(90deg,#e8913c,#ff5a36)', border: 'none', borderRadius: 8, padding: '12px 0', fontFamily: MONO, fontSize: 9, letterSpacing: '.11em', fontWeight: 800, color: '#1a0d05', cursor: submit.busy ? 'not-allowed' : 'pointer', opacity: submit.busy ? .65 : 1, transition: 'opacity .15s' }}>
                {submit.busy ? 'SUBMITTING ON-CHAIN…' : wallet.address ? 'SUBMIT ON-CHAIN ↗' : 'CONNECT WALLET'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mut)' }}>{label}</span>
      {children}
    </label>
  );
}

function ErrorBar({ message }: { message: string }) {
  return (
    <div style={{ background: 'rgba(204,12,0,.08)', border: '1px solid rgba(204,12,0,.3)', borderRadius: 8, padding: '10px 14px', fontFamily: MONO, fontSize: 9, color: '#ff6b5b' }}>
      {message}
    </div>
  );
}

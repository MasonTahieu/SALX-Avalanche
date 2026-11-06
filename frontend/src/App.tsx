import { lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './pages/HomePage';

// The landing page ships in the main bundle; every other page is its own
// chunk, fetched the first time its route is opened.
const loadMarketplace = () => import('./pages/MarketplacePage');
const loadSubmit = () => import('./pages/SubmitProjectPage');
const loadPortfolio = () => import('./pages/PortfolioPage');
const loadAdmin = () => import('./pages/AdminPage');
const loadRetire = () => import('./pages/RetirePage');
const loadLeaderboard = () => import('./pages/LeaderboardPage');
const loadValidator = () => import('./pages/ValidatorPage');
const loadActivity = () => import('./pages/ActivityPage');

const MarketplacePage = lazy(() => loadMarketplace().then(m => ({ default: m.MarketplacePage })));
const SubmitProjectPage = lazy(() => loadSubmit().then(m => ({ default: m.SubmitProjectPage })));
const PortfolioPage = lazy(() => loadPortfolio().then(m => ({ default: m.PortfolioPage })));
const AdminPage = lazy(() => loadAdmin().then(m => ({ default: m.AdminPage })));
const RetirePage = lazy(() => loadRetire().then(m => ({ default: m.RetirePage })));
const LeaderboardPage = lazy(() => loadLeaderboard().then(m => ({ default: m.LeaderboardPage })));
const ValidatorPage = lazy(() => loadValidator().then(m => ({ default: m.ValidatorPage })));
const ActivityPage = lazy(() => loadActivity().then(m => ({ default: m.ActivityPage })));

// Pages in the main navigation, fetched in the background once the first page
// has settled, so opening them later shows no blank loading gap.
const PREFETCH = [loadMarketplace, loadRetire, loadPortfolio, loadLeaderboard, loadSubmit];

function usePrefetchPages() {
  useEffect(() => {
    // Respect data-saver and very slow connections.
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) return;

    let cancelled = false;
    const prefetch = () => {
      if (cancelled) return;
      PREFETCH.forEach(load => { load().catch(() => {}); });
    };
    const idle = window.requestIdleCallback?.bind(window);
    const timer = window.setTimeout(() => {
      if (idle) idle(prefetch, { timeout: 3000 });
      else prefetch();
    }, 1500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
}

export default function App() {
  usePrefetchPages();

  return <Routes>
    <Route element={<AppShell />}>
      <Route path="/"            element={<HomePage />} />
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/retire"      element={<RetirePage />} />
      <Route path="/submit"      element={<SubmitProjectPage />} />
      <Route path="/dashboard"   element={<PortfolioPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/activity"    element={<ActivityPage />} />
      <Route path="/validator"   element={<ValidatorPage />} />
      <Route path="/admin"       element={<AdminPage />} />
      {/* Legacy redirects */}
      <Route path="/certificates"   element={<Navigate to="/dashboard?tab=certificates" replace />} />
      <Route path="/submit-project" element={<Navigate to="/submit" replace />} />
      <Route path="/portfolio"      element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<div style={{ padding: '60px 34px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--mut)' }}><h1 style={{ fontSize: 48, fontFamily: "'Syne', sans-serif", fontWeight: 800, color: 'var(--ink)', margin: '0 0 12px' }}>404</h1><p style={{ fontSize: 12 }}>Page not found.</p></div>} />
    </Route>
  </Routes>;
}

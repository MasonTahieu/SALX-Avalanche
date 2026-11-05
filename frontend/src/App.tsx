import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './pages/HomePage';

// The landing page ships in the main bundle; every other page is its own
// chunk, fetched the first time its route is opened.
const MarketplacePage = lazy(() => import('./pages/MarketplacePage').then(m => ({ default: m.MarketplacePage })));
const SubmitProjectPage = lazy(() => import('./pages/SubmitProjectPage').then(m => ({ default: m.SubmitProjectPage })));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const RetirePage = lazy(() => import('./pages/RetirePage').then(m => ({ default: m.RetirePage })));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const ValidatorPage = lazy(() => import('./pages/ValidatorPage').then(m => ({ default: m.ValidatorPage })));
const ActivityPage = lazy(() => import('./pages/ActivityPage').then(m => ({ default: m.ActivityPage })));

export default function App() {
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

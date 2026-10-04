import { HashRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DataProvider } from './data/DataContext';
import { OperationsPage } from './pages/OperationsPage';
import { OverviewPage } from './pages/OverviewPage';
import { RegionPage } from './pages/RegionPage';

// Hash routing works on any static host. Embedded previews that cannot change their
// own URL build with VITE_MEMORY_ROUTER=true instead.
const Router = import.meta.env.VITE_MEMORY_ROUTER === 'true' ? MemoryRouter : HashRouter;

export default function App() {
  return (
    <Router>
      <DataProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/region/:regionName" element={<RegionPage />} />
            <Route path="/operations" element={<OperationsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </DataProvider>
    </Router>
  );
}

import { useState } from 'react';
import { RegionSidebar } from '../components/RegionSidebar';
import { WorldMap } from '../components/WorldMap';
import { useReadyDashboard } from '../data/DataContext';

export function OverviewPage() {
  const { data, summaries, national } = useReadyDashboard();
  const [selected, setSelected] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ region: string; n: number } | null>(null);

  const selectFromList = (region: string) => {
    setSelected(region);
    setFlyTo((prev) => ({ region, n: (prev?.n ?? 0) + 1 }));
  };

  return (
    <div className="overview">
      <section className="map-panel" aria-labelledby="map-title">
        <div className="map-panel-head">
          <div>
            <h1 id="map-title">Regions of concern</h1>
            <p className="muted">Select a marker to see why a region was flagged. Drag to pan, scroll to zoom.</p>
          </div>
        </div>
        <WorldMap summaries={summaries} selected={selected} onSelect={setSelected} flyTo={flyTo} />
      </section>
      <RegionSidebar
        summaries={summaries}
        national={national}
        selected={selected}
        onSelect={selectFromList}
        demo={data.source === 'demo'}
      />
    </div>
  );
}

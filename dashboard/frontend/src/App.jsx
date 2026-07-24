import { useCallback, useEffect, useState } from 'react';

const FLOW_ID = 'login-happy-path';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes, per DASH-004 spec

const STATUS_COLOR = { pass: '#2e7d32', fail: '#c62828' };
const STATUS_DOT = { pass: '●', fail: '✕' };

function Sparkline({ results }) {
  // recent_results arrives newest-first; render oldest -> newest, per DASH-001 mockup.
  const ordered = [...results].reverse();
  return (
    <span style={{ letterSpacing: '3px' }}>
      {ordered.map((r, i) => (
        <span key={i} style={{ color: STATUS_COLOR[r.status] || '#999' }}>
          {STATUS_DOT[r.status] || '?'}
        </span>
      ))}
    </span>
  );
}

function LayerRow({ layer }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid #ddd' }}>
      <div>
        <strong>{layer.layer}</strong>
        {layer.region && <span style={{ color: '#666', marginLeft: 8 }}>{layer.region}</span>}
        <span style={{ color: STATUS_COLOR[layer.last_status] || '#999', marginLeft: 12 }}>
          {STATUS_DOT[layer.last_status] || '?'} {(layer.last_status || '').toUpperCase()}
        </span>
        <span style={{ color: '#666', marginLeft: 12 }}>
          {layer.last_executed_at && new Date(layer.last_executed_at).toLocaleString()}
        </span>
        {/* Link target TBD per DASH-004 spec — console.log placeholder for now */}
        <a
          href="#"
          style={{ marginLeft: 12 }}
          onClick={(e) => {
            e.preventDefault();
            console.log('execution_id:', layer.last_execution_id);
          }}
        >
          {layer.last_execution_id}
        </a>
      </div>
      <div style={{ marginTop: 4 }}>
        <Sparkline results={layer.recent_results} />
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/flow-status?flow_id=${FLOW_ID}`);
      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
      console.log(`[${new Date().toISOString()}] flow-status polled`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: STATUS_COLOR.fail }}>Error fetching status: {error}</p>;

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 600, margin: '40px auto' }}>
      <h1>{data.flow_id} — Flow Status</h1>
      {data.layers.map((layer) => (
        <LayerRow key={layer.layer} layer={layer} />
      ))}
    </div>
  );
}

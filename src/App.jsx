import { useMemo, useState } from 'react'
import './App.css'
import { Player } from './Player'
import { usePerformances } from './usePerformances'

const tuneMode = new URLSearchParams(window.location.search).has('tune')

function App() {
  const { status, performances, error } = usePerformances()

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">OFAB Marching Band</p>
          <h1>Competition <span>Portal</span></h1>
        </div>
      </header>

      {status === 'loading' && <p className="notice">Loading performances…</p>}
      {status === 'error' && (
        <p className="notice error" role="alert">
          Couldn’t load performances. Try refreshing in a minute. ({error})
        </p>
      )}
      {status === 'ready' && performances.length === 0 && <p className="notice">No performances yet. Check back soon.</p>}
      {status === 'ready' && performances.length > 0 && <Performances performances={performances} />}
    </div>
  )
}

function Performances({ performances }) {
  const [performanceId, setPerformanceId] = useState(performances[0].id)
  const performance = performances.find((p) => p.id === performanceId) ?? performances[0]

  return (
    <main className={performances.length > 1 ? 'layout-grid' : 'layout-single'}>
      {performances.length > 1 && (
        <aside className="sidebar-panel">
          <div className="panel-heading">
            <h2>Performances</h2>
          </div>
          <div className="performance-list">
            {performances.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`performance-card ${p.id === performanceId ? 'active' : ''}`}
                onClick={() => setPerformanceId(p.id)}
              >
                <span className="performance-number">{p.date}</span>
                <h3>{p.title}</h3>
                <p>{p.ensemble}</p>
              </button>
            ))}
          </div>
        </aside>
      )}

      {tuneMode ? (
        <TunablePlayer key={performance.id} performance={performance} />
      ) : (
        <Player key={performance.id} performance={performance} />
      )}
    </main>
  )
}

// ?tune: nudge offsets and gains by ear, then copy the entry into performances.json.
function TunablePlayer({ performance }) {
  const [judges, setJudges] = useState(() => performance.judges.map((j) => ({ ...j, gainDb: j.gainDb ?? 0 })))
  const tuned = useMemo(() => ({ ...performance, judges }), [performance, judges])

  const nudge = (id, field, delta) =>
    setJudges((prev) =>
      prev.map((j) => (j.id === id ? { ...j, [field]: Math.round(((j[field] ?? 0) + delta) * 100) / 100 } : j)),
    )

  return (
    <Player performance={tuned} onNudge={nudge}>
      <textarea className="tune-json" readOnly value={JSON.stringify(tuned, null, 2)} rows={16} aria-label="Performance JSON" />
    </Player>
  )
}

export default App

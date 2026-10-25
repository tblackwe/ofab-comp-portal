import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { performances } from './data/performances'
import { loadPerformanceById } from './lib/media'

function App() {
  const [selectedId, setSelectedId] = useState(performances[0].id)
  const [selectedPerformance, setSelectedPerformance] = useState(performances[0])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadPerformance() {
      setIsLoading(true)

      try {
        const performance = await loadPerformanceById(selectedId)

        if (isMounted) {
          setSelectedPerformance(performance)
        }
      } catch (error) {
        console.error(error)

        if (isMounted) {
          setSelectedPerformance(performances[0])
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadPerformance()

    return () => {
      isMounted = false
    }
  }, [selectedId])

  const selectedVideos = useMemo(
    () => selectedPerformance.videos || [],
    [selectedPerformance],
  )

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Competition parent hub</p>
          <h1>Judge Tape <span>Portal</span></h1>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button">
            Protected Drive
          </button>
          <button type="button" className="primary-button">
            View all entries
          </button>
        </div>
      </header>

      <main className="layout-grid">
        <aside className="sidebar-panel">
          <div className="panel-heading">
            <h2>Performances</h2>
            <span>{performances.length} ready</span>
          </div>

          <div className="performance-list">
            {performances.map((performance) => (
              <button
                key={performance.id}
                type="button"
                className={`performance-card ${selectedId === performance.id ? 'active' : ''}`}
                onClick={() => setSelectedId(performance.id)}
              >
                <div className="card-topline">
                  <span className="performance-number">{performance.title}</span>
                  <span className="status-pill">{performance.status}</span>
                </div>
                <h3>{performance.subtitle}</h3>
                <p>{performance.location}</p>
                <div className="card-meta">
                  <span>{performance.date}</span>
                  <span>{performance.videos.length} videos</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="detail-panel">
          <div className="detail-header">
            <div>
              <p className="eyebrow small">{selectedPerformance.date}</p>
              <h2>{selectedPerformance.title}</h2>
            </div>
            <a href={selectedPerformance.driveUrl} target="_blank" rel="noreferrer" className="drive-link">
              Open protected drive
            </a>
          </div>

          <div className="detail-summary">
            <div className="summary-copy">
              <p>{selectedPerformance.description}</p>
            </div>
            <div className="summary-badges">
              <span>{selectedPerformance.location}</span>
              <span>Auto-synced</span>
              <span>Google Auth</span>
            </div>
          </div>

          {isLoading ? (
            <div className="loading-state">Loading media…</div>
          ) : (
            <>
              <div className="featured-video-wrap">
                <video controls src={selectedVideos[0]?.src || ''} poster="" />
              </div>

              <div className="video-grid">
                {selectedVideos.map((video, index) => (
                  <article key={`${video.title}-${index}`} className="video-card">
                    <div className="video-label-row">
                      <span className="kind-tag">{video.kind}</span>
                      {video.synced ? <span className="sync-tag">Synced</span> : <span className="sync-tag muted">Waiting</span>}
                    </div>
                    <video controls src={video.src} />
                    <div className="video-copy">
                      <h3>{video.title}</h3>
                      <p>{video.note}</p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

export default App

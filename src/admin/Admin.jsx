import { useCallback, useEffect, useState } from 'react'
import '../App.css'
import './admin.css'
import { listPerformances } from './api'
import { Editor } from './Editor'

export default function Admin() {
  const [performances, setPerformances] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(
    () =>
      listPerformances().then(
        (list) => {
          setPerformances([...list].sort((a, b) => b.date.localeCompare(a.date)))
          setError(null)
        },
        (e) => setError(e.message),
      ),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="page-shell admin">
      <header className="topbar">
        <div>
          <p className="eyebrow">OFAB Marching Band</p>
          <h1>
            Competition <span>Admin</span>
          </h1>
        </div>
        <a className="secondary-button" href="/">
          View parent site
        </a>
      </header>

      {editing ? (
        <Editor
          key={editing.id ?? 'new'}
          initial={editing.id ? editing : null}
          performances={performances ?? []}
          onClose={() => {
            setEditing(null)
            load()
          }}
        />
      ) : (
        <PerformanceList performances={performances} error={error} onEdit={setEditing} onRetry={load} />
      )}
    </div>
  )
}

function PerformanceList({ performances, error, onEdit, onRetry }) {
  if (error) {
    return (
      <div className="notice error" role="alert">
        Couldn’t load performances: {error}{' '}
        <button type="button" className="link-button" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }
  if (!performances) return <p className="notice">Loading performances…</p>

  return (
    <section className="detail-panel admin-panel">
      <div className="admin-row-head">
        <h2>Performances</h2>
        <button type="button" className="primary-button" onClick={() => onEdit({})}>
          New performance
        </button>
      </div>
      {performances.length === 0 ? (
        <p className="muted">No performances yet.</p>
      ) : (
        <ul className="admin-list">
          {performances.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.title}</strong>
                <span className="muted">
                  {' '}
                  · {p.date} · {p.judges.length} judge{p.judges.length === 1 ? '' : 's'}
                </span>
              </div>
              <span className={`status-chip ${p.published ? 'published' : 'draft'}`}>{p.published ? 'Published' : 'Draft'}</span>
              <button type="button" className="secondary-button" onClick={() => onEdit(p)} aria-label={`Edit ${p.title}`}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import { useMemo, useRef, useState } from 'react'
import './App.css'
import { mediaUrl, performances } from './data/performances'
import { dbToGain, resumeAudio, useJudgeVolume } from './judgeAudio'
import { useSyncedAudio } from './useSyncedAudio'

const tuneMode = new URLSearchParams(window.location.search).has('tune')
const VOLUME_KEY = 'jt.commentaryVolume'

function storedVolume() {
  const v = Number(localStorage.getItem(VOLUME_KEY))
  return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null ? Math.min(1, Math.max(0, v)) : 1
}

function App() {
  const [performanceId, setPerformanceId] = useState(performances[0].id)
  const performance = performances.find((p) => p.id === performanceId) ?? performances[0]

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Competition parent hub</p>
          <h1>Judge Tape <span>Portal</span></h1>
        </div>
      </header>

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

        <Player key={performance.id} performance={performance} />
      </main>
    </div>
  )
}

function Player({ performance }) {
  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const [judgeId, setJudgeId] = useState(performance.judges[0]?.id ?? null)
  const [bandMuted, setBandMuted] = useState(true)
  const [volume, setVolume] = useState(storedVolume)
  const [tuning, setTuning] = useState(() =>
    Object.fromEntries(performance.judges.map((j) => [j.id, { offset: j.offset, gainDb: j.gainDb ?? 0 }])),
  )

  const judge = performance.judges.find((j) => j.id === judgeId) ?? null
  const { offset, gainDb } = judge ? tuning[judge.id] : { offset: 0, gainDb: 0 }

  useSyncedAudio(videoRef, audioRef, offset, judge?.key)
  useJudgeVolume(audioRef, judge?.key, volume * dbToGain(gainDb))

  const changeVolume = (value) => {
    setVolume(value)
    localStorage.setItem(VOLUME_KEY, String(value))
  }

  const nudge = (field, delta) =>
    setTuning((prev) => ({
      ...prev,
      [judge.id]: { ...prev[judge.id], [field]: Math.round((prev[judge.id][field] + delta) * 100) / 100 },
    }))

  const tuningJson = useMemo(() => JSON.stringify(tuning, null, 2), [tuning])

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow small">{performance.date}</p>
          <h2>{performance.title}</h2>
          <p className="subtitle">{performance.ensemble}</p>
        </div>
      </div>

      <div className="featured-video-wrap">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          muted={Boolean(judge) && bandMuted}
          onPlay={resumeAudio}
          src={mediaUrl(performance.video.key)}
        />
        {judge && <audio key={judge.id} ref={audioRef} preload="auto" src={mediaUrl(judge.key)} />}
      </div>

      <div className="controls-row">
        <div className="judge-picker" role="radiogroup" aria-label="Judge commentary">
          <button
            type="button"
            role="radio"
            aria-checked={!judge}
            className={`judge-chip ${!judge ? 'active' : ''}`}
            onClick={() => setJudgeId(null)}
          >
            <strong>Band</strong>
            <span>No commentary</span>
          </button>
          {performance.judges.map((j) => (
            <button
              key={j.id}
              type="button"
              role="radio"
              aria-checked={j.id === judgeId}
              className={`judge-chip ${j.id === judgeId ? 'active' : ''}`}
              onClick={() => setJudgeId(j.id)}
            >
              <strong>{j.code}</strong>
              <span>{j.name}</span>
            </button>
          ))}
        </div>

        {judge && (
          <div className="audio-options">
            <label className="volume">
              <span>Commentary volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                aria-valuetext={`${Math.round(volume * 100)}%`}
              />
              <output>{Math.round(volume * 100)}%</output>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={!bandMuted} onChange={(e) => setBandMuted(!e.target.checked)} />
              Play band audio under commentary
            </label>
          </div>
        )}
      </div>

      {tuneMode && judge && (
        <div className="tune-panel">
          <p>
            <strong>{judge.code}</strong> offset: <code>{offset.toFixed(2)}s</code> · gain:{' '}
            <code>{gainDb > 0 ? '+' : ''}{gainDb.toFixed(1)} dB</code>
          </p>
          <div className="tune-buttons">
            {[-1, -0.1, 0.1, 1].map((d) => (
              <button key={d} type="button" className="secondary-button" onClick={() => nudge('offset', d)}>
                {d > 0 ? '+' : ''}
                {d}s
              </button>
            ))}
            {[-1, 1].map((d) => (
              <button key={`g${d}`} type="button" className="secondary-button" onClick={() => nudge('gainDb', d)}>
                {d > 0 ? '+' : ''}
                {d} dB
              </button>
            ))}
          </div>
          <textarea readOnly value={tuningJson} rows={performance.judges.length * 4 + 2} />
        </div>
      )}
    </section>
  )
}

export default App

import { useRef, useState } from 'react'
import { dbToGain, resumeAudio, useJudgeVolume } from './judgeAudio'
import { mediaUrl } from './lib/media'
import { useSyncedAudio } from './useSyncedAudio'

const VOLUME_KEY = 'jt.commentaryVolume'

// localStorage throws when storage is blocked (some privacy modes); the slider still works for the visit.
function storedVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    const v = Number(raw)
    return raw !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
  } catch {
    return 1
  }
}

function saveVolume(value) {
  try {
    localStorage.setItem(VOLUME_KEY, String(value))
  } catch {
    // Not persisted; fine.
  }
}

// The video + judge commentary player. Offsets and gains come from `performance`;
// pass onNudge to show tuning buttons (admin page and ?tune).
export function Player({ performance, srcFor = mediaUrl, onNudge, children }) {
  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const [judgeId, setJudgeId] = useState(performance.judges[0]?.id ?? null)
  const [bandMuted, setBandMuted] = useState(true)
  const [volume, setVolume] = useState(storedVolume)

  const judge = performance.judges.find((j) => j.id === judgeId) ?? null
  const offset = judge?.offset ?? 0
  const gainDb = judge?.gainDb ?? 0

  useSyncedAudio(videoRef, audioRef, offset, judge?.key)
  useJudgeVolume(audioRef, judge?.key, volume * dbToGain(gainDb))

  const changeVolume = (value) => {
    setVolume(value)
    saveVolume(value)
  }

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
          src={srcFor(performance.video.key)}
        />
        {judge && <audio key={judge.id} ref={audioRef} preload="auto" src={srcFor(judge.key)} />}
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

      {onNudge && judge && (
        <div className="tune-panel">
          <p>
            <strong>{judge.code}</strong> offset: <code>{offset.toFixed(2)}s</code> · gain:{' '}
            <code>{gainDb > 0 ? '+' : ''}{gainDb.toFixed(1)} dB</code>
          </p>
          <div className="tune-buttons">
            {[-1, -0.1, 0.1, 1].map((d) => (
              <button key={d} type="button" className="secondary-button" onClick={() => onNudge(judge.id, 'offset', d)}>
                {d > 0 ? '+' : ''}
                {d}s
              </button>
            ))}
            {[-1, 1].map((d) => (
              <button key={`g${d}`} type="button" className="secondary-button" onClick={() => onNudge(judge.id, 'gainDb', d)}>
                {d > 0 ? '+' : ''}
                {d} dB
              </button>
            ))}
          </div>
        </div>
      )}
      {children}
    </section>
  )
}

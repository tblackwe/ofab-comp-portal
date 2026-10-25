import { useEffect, useMemo, useRef, useState } from 'react'
import { mediaUrl } from '../lib/media'
import { Player } from '../Player'
import { deletePerformance, savePerformance } from './api'
import { autoAlign } from './autoAlign'
import { byJudgeOrder, guessCode, judgeId, judgeNames, slug } from './judges'
import { uploadFile } from './upload'

let rowSeq = 0
const newRowId = () => `row-${++rowSeq}`
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places
const isNumberText = (v) => String(v).trim() !== '' && Number.isFinite(Number(v))
const toNumber = (v) => (isNumberText(v) ? Number(v) : 0)

export function Editor({ initial, performances, onClose }) {
  const names = useMemo(() => judgeNames(performances), [performances])
  const [saved, setSaved] = useState(initial)
  const [details, setDetails] = useState({
    title: initial?.title ?? '',
    date: initial?.date ?? '',
    ensemble: initial?.ensemble ?? performances[0]?.ensemble ?? '',
  })
  const [lockedId, setLockedId] = useState(initial?.id ?? null)
  const [video, setVideo] = useState(initial?.video ?? null)
  const [judges, setJudges] = useState(() => (initial?.judges ?? []).map((j) => ({ ...j, rowId: newRowId() })))
  const [uploads, setUploads] = useState({})
  const [alignState, setAlignState] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(true)

  const files = useRef(new Map())
  const blobUrls = useRef(new Map())
  const queue = useRef(Promise.resolve())
  const abort = useRef(null)
  const keysInUse = useRef(new Set())

  const id = lockedId ?? slug(`${details.date} ${details.title}`)
  const isNew = !saved
  const year = details.date.slice(0, 4)
  const uploading = Object.values(uploads).some((u) => u.status === 'uploading' || u.status === 'queued')

  const keys = useMemo(() => new Set([video?.key, ...judges.map((j) => j.key)].filter(Boolean)), [video, judges])
  useEffect(() => {
    keysInUse.current = keys
  }, [keys])

  useEffect(() => {
    const controller = new AbortController()
    abort.current = controller
    const urls = blobUrls.current
    return () => {
      controller.abort()
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  useEffect(() => {
    if (!uploading && !dirty) return
    const warn = (e) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading, dirty])

  const change = (setter) => (value) => {
    setter(value)
    setDirty(true)
    setMessage(null)
  }
  const updateDetails = change(setDetails)
  const updateJudges = change(setJudges)
  const updateVideo = change(setVideo)

  const setUpload = (key, value) => setUploads((u) => ({ ...u, [key]: { ...u[key], ...value } }))

  function startUpload(key, file) {
    files.current.set(key, file)
    const old = blobUrls.current.get(key)
    if (old) URL.revokeObjectURL(old)
    blobUrls.current.delete(key)
    setUpload(key, { status: 'queued', progress: 0, error: null })
    queue.current = queue.current.then(async () => {
      if (!keysInUse.current.has(key) || abort.current?.signal.aborted) {
        setUpload(key, { status: 'skipped' })
        return
      }
      setUpload(key, { status: 'uploading' })
      try {
        await uploadFile(file, key, {
          signal: abort.current.signal,
          onProgress: (progress) => setUpload(key, { progress }),
        })
        setUpload(key, { status: 'done', progress: 1 })
      } catch (e) {
        if (e.name !== 'AbortError') setUpload(key, { status: 'error', error: e.message })
      }
    })
  }

  const srcFor = (key) => {
    const file = files.current.get(key)
    if (!file) return mediaUrl(key)
    if (!blobUrls.current.has(key)) blobUrls.current.set(key, URL.createObjectURL(file))
    return blobUrls.current.get(key)
  }

  const canPickFiles = details.title.trim() && details.date && (!isNew || lockedId || !performances.some((p) => p.id === id))
  const keyFor = (file) => `${year}/${id}/${file.name}`

  function pickVideo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLockedId(id)
    const key = keyFor(file)
    updateVideo({ key })
    startUpload(key, file)
  }

  function pickTapes(e) {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!picked.length) return
    setLockedId(id)
    const rows = [...judges]
    for (const file of picked) {
      const key = keyFor(file)
      if (!rows.some((j) => j.key === key)) {
        const code = guessCode(file.name, names)
        rows.push({ rowId: newRowId(), id: judgeId(code), code, name: names.get(code) ?? '', key, offset: 0, gainDb: 0 })
      }
      startUpload(key, file)
    }
    updateJudges(rows.sort(byJudgeOrder))
  }

  function editJudge(rowId, field, value) {
    updateJudges((rows) =>
      rows.map((j) => {
        if (j.rowId !== rowId) return j
        if (field !== 'code') return { ...j, [field]: value }
        const code = value.toUpperCase()
        const autoName = !j.name || j.name === names.get(j.code)
        return { ...j, code, id: judgeId(code), name: autoName ? (names.get(code) ?? '') : j.name }
      }),
    )
  }

  const nudge = (jid, field, delta) =>
    updateJudges((rows) => rows.map((j) => (j.id === jid ? { ...j, [field]: round(toNumber(j[field]) + delta, 2) } : j)))

  async function runAutoAlign() {
    setAlignState({ running: true, status: 'Starting…' })
    try {
      await autoAlign(
        { key: video.key, file: files.current.get(video.key) },
        judges.map((j) => ({ rowId: j.rowId, key: j.key, file: files.current.get(j.key) })),
        {
          onStatus: (status) => setAlignState({ running: true, status }),
          onResult: (rowId, r) =>
            updateJudges((rows) =>
              rows.map((j) =>
                j.rowId !== rowId
                  ? j
                  : r.error
                    ? { ...j, alignError: r.error }
                    : { ...j, offset: r.offset, gainDb: r.gainDb, agree: r.agree, total: r.total, alignError: null },
              ),
            ),
        },
      )
      setAlignState({ running: false, status: 'Done. Spot-check each judge in the preview before publishing.' })
    } catch (e) {
      setAlignState({ running: false, error: `Auto-align failed: ${e.message}` })
    }
  }

  const problems = []
  if (!details.title.trim() || !details.date) problems.push('Add a title and date.')
  if (isNew && !lockedId && performances.some((p) => p.id === id)) problems.push('A performance with this title and date already exists.')
  if (!video) problems.push('Add the video.')
  if (judges.some((j) => !j.code.trim() || !j.name.trim())) problems.push('Every judge needs a code and a name.')
  const ids = judges.map((j) => j.id)
  if (new Set(ids).size !== ids.length) problems.push('Two judges have the same code.')
  if (judges.some((j) => !isNumberText(j.offset) || !isNumberText(j.gainDb ?? 0))) problems.push('Offsets and gains must be numbers.')
  for (const key of keys) {
    const u = uploads[key]
    if (u && u.status !== 'done') {
      problems.push(u.status === 'error' ? 'An upload failed; retry it or remove that file.' : 'Wait for uploads to finish.')
      break
    }
  }

  function build(published) {
    const p = {
      ...saved,
      id,
      title: details.title.trim(),
      date: details.date,
      ensemble: details.ensemble.trim(),
      published,
      video: { key: video.key },
      judges: [...judges].sort(byJudgeOrder).map((j) => ({
        id: j.id,
        code: j.code.trim(),
        name: j.name.trim(),
        key: j.key,
        offset: round(toNumber(j.offset), 2),
        gainDb: round(toNumber(j.gainDb ?? 0), 1),
      })),
    }
    if (!p.ensemble) delete p.ensemble
    return p
  }

  async function save(published) {
    setBusy(true)
    setMessage(null)
    try {
      const { performance } = await savePerformance(build(published))
      setSaved(performance)
      setLockedId(performance.id)
      setDirty(false)
      setMessage({ kind: 'ok', text: published ? 'Published. Parents can see it now.' : 'Saved as a draft. Parents can’t see it yet.' })
    } catch (e) {
      setMessage({ kind: 'error', text: e.message, problems: e.problems })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await deletePerformance(saved.id, deleteFiles)
      onClose()
    } catch (e) {
      setMessage({ kind: 'error', text: e.message })
      setBusy(false)
    }
  }

  function back() {
    if ((uploading || dirty) && !window.confirm('Leave without saving? Unsaved changes and running uploads will be lost.')) return
    onClose()
  }

  const preview = useMemo(() => {
    if (!video) return null
    const seen = new Set()
    const playable = judges
      .filter((j) => j.id && !seen.has(j.id) && seen.add(j.id))
      .sort(byJudgeOrder)
      .map((j) => ({ ...j, name: j.name || j.code, offset: toNumber(j.offset), gainDb: toNumber(j.gainDb ?? 0) }))
    return { id, title: details.title || 'Untitled', date: details.date, ensemble: details.ensemble, video, judges: playable }
  }, [id, details, video, judges])

  const canSave = problems.length === 0 && !busy && !alignState?.running
  const published = saved?.published === true

  return (
    <section className="detail-panel admin-panel">
      <div className="admin-row-head">
        <button type="button" className="link-button" onClick={back}>
          ← All performances
        </button>
        {saved && <span className={`status-chip ${published ? 'published' : 'draft'}`}>{published ? 'Published' : 'Draft'}</span>}
      </div>
      <h2>{isNew ? 'New performance' : saved.title}</h2>

      <fieldset className="admin-fields">
        <label>
          Title
          <input value={details.title} onChange={(e) => updateDetails({ ...details, title: e.target.value })} placeholder="Region Championship" />
        </label>
        <label>
          Date
          <input type="date" value={details.date} onChange={(e) => updateDetails({ ...details, date: e.target.value })} />
        </label>
        <label>
          Ensemble
          <input value={details.ensemble} onChange={(e) => updateDetails({ ...details, ensemble: e.target.value })} placeholder="Odessa HS Band" />
        </label>
      </fieldset>
      {details.title && details.date && <p className="muted small">Files are stored under {`${year}/${id}/`}</p>}

      <h3>Video</h3>
      <div className="file-row">
        <span className="file-name">{video ? fileName(video.key) : 'No video yet'}</span>
        <UploadStatus upload={video && uploads[video.key]} onRetry={() => startUpload(video.key, files.current.get(video.key))} />
        <label className={`secondary-button file-button ${canPickFiles ? '' : 'disabled'}`}>
          {video ? 'Replace video' : 'Choose video'}
          <input type="file" accept="video/*" onChange={pickVideo} disabled={!canPickFiles} aria-label="Choose video" />
        </label>
      </div>

      <h3>Judge tapes</h3>
      {judges.length > 0 && (
        <div className="judge-table" role="table" aria-label="Judges">
          <div className="judge-table-head" role="row">
            <span role="columnheader">Code</span>
            <span role="columnheader">Name</span>
            <span role="columnheader">Offset (s)</span>
            <span role="columnheader">Gain (dB)</span>
            <span role="columnheader">File</span>
            <span role="columnheader" />
          </div>
          {judges.map((j) => (
            <div className="judge-table-row" role="row" key={j.rowId}>
              <input aria-label="Code" value={j.code} onChange={(e) => editJudge(j.rowId, 'code', e.target.value)} />
              <input aria-label={`Name for ${j.code}`} value={j.name} onChange={(e) => editJudge(j.rowId, 'name', e.target.value)} />
              <input aria-label={`Offset for ${j.code}`} type="number" step="0.01" value={j.offset} onChange={(e) => editJudge(j.rowId, 'offset', e.target.value)} />
              <input aria-label={`Gain for ${j.code}`} type="number" step="0.1" value={j.gainDb ?? 0} onChange={(e) => editJudge(j.rowId, 'gainDb', e.target.value)} />
              <div className="judge-file">
                <span className="file-name" title={j.key}>
                  {fileName(j.key)}
                </span>
                <UploadStatus upload={uploads[j.key]} onRetry={() => startUpload(j.key, files.current.get(j.key))} />
                <AlignNote judge={j} />
              </div>
              <button type="button" className="link-button" aria-label={`Remove ${j.code}`} onClick={() => updateJudges((rows) => rows.filter((r) => r.rowId !== j.rowId))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="file-row">
        <label className={`secondary-button file-button ${canPickFiles ? '' : 'disabled'}`}>
          Add judge tapes
          <input type="file" accept="audio/*,.m4a" multiple onChange={pickTapes} disabled={!canPickFiles} aria-label="Add judge tapes" />
        </label>
        <button type="button" className="secondary-button" onClick={runAutoAlign} disabled={!video || !judges.length || alignState?.running}>
          {alignState?.running ? 'Aligning…' : 'Auto-align'}
        </button>
        {alignState && (
          <span className={alignState.error ? 'error-text' : 'muted'} role="status">
            {alignState.error ?? alignState.status}
          </span>
        )}
      </div>
      {!canPickFiles && <p className="muted small">Enter a title and date before adding files.</p>}

      {preview && (
        <>
          <h3>Preview</h3>
          <p className="muted small">Pick a judge, play, and nudge until the commentary lines up. Changes apply to the rows above.</p>
          <Player key={video.key} performance={preview} srcFor={srcFor} onNudge={nudge} />
        </>
      )}

      <div className="admin-actions">
        {problems.length > 0 && (
          <ul className="problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {message && (
          <div className={`notice ${message.kind === 'error' ? 'error' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>
            {message.text}
            {message.problems?.length > 0 && (
              <ul>
                {message.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="action-buttons">
          {published ? (
            <>
              <button type="button" className="primary-button" disabled={!canSave} onClick={() => save(true)}>
                Save changes
              </button>
              <button type="button" className="secondary-button" disabled={!canSave} onClick={() => save(false)}>
                Unpublish
              </button>
            </>
          ) : (
            <>
              <button type="button" className="primary-button" disabled={!canSave} onClick={() => save(true)}>
                Publish
              </button>
              <button type="button" className="secondary-button" disabled={!canSave} onClick={() => save(false)}>
                Save draft
              </button>
            </>
          )}
          {saved && !confirmingDelete && (
            <button type="button" className="link-button danger" onClick={() => setConfirmingDelete(true)}>
              Delete…
            </button>
          )}
        </div>
        {confirmingDelete && (
          <div className="confirm-delete" role="group" aria-label="Confirm delete">
            <p>Delete “{saved.title}”? Parents will no longer see it.</p>
            <label className="toggle">
              <input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} />
              Also delete its video and tapes from storage
            </label>
            <div className="action-buttons">
              <button type="button" className="danger-button" disabled={busy} onClick={remove}>
                Delete permanently
              </button>
              <button type="button" className="secondary-button" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function fileName(key) {
  return key.split('/').at(-1)
}

function UploadStatus({ upload, onRetry }) {
  if (!upload || upload.status === 'skipped') return null
  if (upload.status === 'done') return <span className="upload-status done">Uploaded</span>
  if (upload.status === 'error') {
    return (
      <span className="upload-status error">
        Upload failed: {upload.error}{' '}
        <button type="button" className="link-button" onClick={onRetry}>
          Retry
        </button>
      </span>
    )
  }
  const pct = Math.round((upload.progress ?? 0) * 100)
  return (
    <span className="upload-status">
      {upload.status === 'queued' ? 'Waiting…' : `Uploading ${pct}%`}
      <progress max="100" value={pct} aria-label="Upload progress" />
    </span>
  )
}

function AlignNote({ judge }) {
  if (judge.alignError) return <span className="upload-status error">Couldn’t align: {judge.alignError}</span>
  if (!judge.total) return null
  const confident = judge.agree / judge.total >= 0.5
  return (
    <span className={`upload-status ${confident ? 'done' : 'warn'}`} title="How many one-minute slices of the video agree with this offset">
      {confident ? 'Matched' : 'Weak match – check by ear'} ({judge.agree}/{judge.total})
    </span>
  )
}

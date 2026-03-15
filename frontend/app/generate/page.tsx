'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { ChapterRenderer, AudioPlayer, type Block } from '@/components/ChapterRenderer'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

function GeneratePageInner() {
  const searchParams = useSearchParams()
  const prompt = searchParams.get('prompt') ?? ''

  const [blocks, setBlocks] = useState<Block[]>([])
  const [storyId, setStoryId] = useState<string>()
  const [generating, setGenerating] = useState(true)
  const [copied, setCopied] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showToast, setShowToast] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [initError, setInitError] = useState<string>()

  const bottomRef = useRef<HTMLDivElement>(null)
  const chapterCount = useRef(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const doneRef = useRef(false)
  const startedRef = useRef(false)   // guards against StrictMode double-mount
  const sessionIdRef = useRef<string>('')

  // Save story to Firestore
  const handleSave = async () => {
    if (!storyId || saveState === 'saving' || saveState === 'saved') return
    setSaveState('saving')
    try {
      const title = blocks.find(b => b.type === 'CHAPTER')?.content ?? 'Untitled Story'
      const res = await fetch(`${API_BASE}/api/story/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story_id: storyId,
          prompt,
          title,
          audio_url: audioUrl,
          blocks,
        }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
    } catch {
      setSaveState('error')
    }
  }

  useEffect(() => {
    if (!prompt || startedRef.current) return
    startedRef.current = true   // set synchronously so StrictMode second run is blocked

    let es: EventSource

    // Step 1: create session, then open SSE stream
    fetch(`${API_BASE}/api/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`Failed to start: ${r.statusText}`)
        return r.json()
      })
      .then(({ session_id }: { session_id: string }) => {
        sessionIdRef.current = session_id

        // Step 2: open SSE stream
        es = new EventSource(`${API_BASE}/api/generate/${session_id}`)

        es.onmessage = (e) => {
          if (doneRef.current) { es.close(); return }

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw: any = JSON.parse(e.data)

            if (raw.type === 'COMPLETE') {
              doneRef.current = true
              if (raw.story_id) setStoryId(raw.story_id as string)
              setGenerating(false)
              setProgress(100)
              es.close()
              setShowToast(true)
              toastTimer.current = setTimeout(() => setShowToast(false), 5000)
            } else {
              if (raw.type === 'CHAPTER') {
                chapterCount.current += 1
                setProgress(Math.min(90, 10 + chapterCount.current * 20))
              }
              if (raw.type === 'AUDIO') {
                if (raw.url) setAudioUrl(raw.url as string)
              } else if (raw.type === 'GENERATED_IMAGE') {
                setBlocks((prev) => {
                  const idx = [...prev].map((b, i) => b.type === 'IMAGE' ? i : -1).filter(i => i !== -1).pop()
                  if (idx !== undefined) {
                    const updated = [...prev]
                    updated[idx] = raw as Block
                    return updated
                  }
                  return [...prev, raw as Block]
                })
              } else {
                setBlocks((prev) => [...prev, raw as Block])
              }
              setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100)
            }
          } catch {
            // ignore parse errors
          }
        }

        es.onerror = () => {
          if (!doneRef.current) setGenerating(false)
          es.close()
        }
      })
      .catch(err => {
        setInitError(err.message)
        setGenerating(false)
      })

    return () => {
      es?.close()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt])

  const shareUrl =
    typeof window !== 'undefined' && storyId
      ? `${window.location.origin}/story/${storyId}`
      : null

  const handleCopy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!prompt) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0908' }}>
        <div className="grain-overlay" />
        <div className="text-center relative z-10">
          <p className="text-[#7c746d] text-sm font-mono mb-4">No prompt provided.</p>
          <Link href="/" className="text-[#d97706] hover:text-[#f59e0b] transition-colors text-sm">
            ← Back to StoryForge
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[#f0ebe4]" style={{ background: '#0a0908' }}>
      <div className="grain-overlay" />

      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b px-6 py-3 flex items-center justify-between backdrop-blur-xl"
        style={{ background: 'rgba(10,9,8,0.85)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-5">
          <Link href="/" className="font-serif text-[#fde68a] text-lg hover:text-[#f0ebe4] transition-colors tracking-tight">
            StoryForge
          </Link>
          <Link href="/stories" className="text-[#7c746d] hover:text-[#f0ebe4] text-xs font-mono tracking-widest uppercase transition-colors">
            Saved Stories
          </Link>
        </div>

        {/* Progress indicator */}
        <div className="flex-1 mx-8 max-w-xs">
          <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: generating
                  ? 'linear-gradient(90deg, #d97706, #f59e0b, #d97706)'
                  : '#f59e0b',
                backgroundSize: generating ? '200% 100%' : undefined,
                animation: generating && progress > 0 && progress < 100
                  ? 'shimmer-bar 2s linear infinite'
                  : undefined,
              }}
            />
          </div>
          <p className="text-[#7c746d] text-xs font-mono mt-1.5 text-center">
            {generating
              ? chapterCount.current === 0
                ? 'StoryForge is writing…'
                : `Scene ${chapterCount.current} of 4…`
              : 'Story complete'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveState === 'saved' && shareUrl && (
            <button
              onClick={handleCopy}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all duration-200
                ${copied ? 'bg-green-700 text-white' : 'text-[#0a0908] font-semibold'}`}
              style={!copied ? { background: 'linear-gradient(135deg, #d97706, #f59e0b)' } : {}}
            >
              {copied ? 'Copied!' : 'Share'}
            </button>
          )}
        </div>
      </header>

      {/* Init error */}
      {initError && (
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-red-400 text-sm mb-4">{initError}</p>
          <Link href="/" className="text-[#d97706] hover:text-[#f59e0b] transition-colors text-sm">← Try again</Link>
        </div>
      )}

      {/* Loading state */}
      {blocks.length === 0 && generating && !initError && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
          <div className="w-full max-w-2xl px-8 space-y-4">
            <div className="shimmer-skeleton h-8 w-2/3 rounded-lg" />
            <div className="shimmer-skeleton h-4 w-full rounded" />
            <div className="shimmer-skeleton h-4 w-5/6 rounded" />
            <div className="shimmer-skeleton h-4 w-4/5 rounded" />
            <div className="shimmer-skeleton h-48 w-full rounded-2xl mt-6" />
          </div>
          <p className="text-[#7c746d] text-sm font-mono tracking-widest">
            StoryForge is writing your story…
          </p>
        </div>
      )}

      <ChapterRenderer blocks={blocks} done={!generating} />

      {/* Whole-story audio player */}
      {audioUrl && (
        <div className="max-w-2xl mx-auto px-4 mb-8">
          <p className="text-[#7c746d] text-xs font-mono tracking-[0.2em] uppercase mb-3">
            Listen to the full story
          </p>
          <AudioPlayer url={audioUrl} />
        </div>
      )}

      {/* Done banner */}
      {!generating && !initError && storyId && (
        <div className="max-w-2xl mx-auto px-4 pb-20">
          <div className="rounded-2xl p-8 text-center border"
            style={{ background: 'rgba(20,18,16,0.8)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="w-8 h-0.5 mx-auto mb-6 rounded" style={{ background: '#d97706' }} />
            <h3 className="text-xl font-serif text-[#fde68a] mb-2">Your story is ready.</h3>
            <p className="text-[#7c746d] text-sm mb-7">
              Save it to Firestore, share the link, or start a new story.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={handleSave}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-60"
                style={
                  saveState === 'saved'
                    ? { background: 'rgba(34,197,94,0.15)', color: '#86efac', border: '1px solid rgba(34,197,94,0.3)' }
                    : saveState === 'error'
                    ? { background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }
                    : { background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#0a0908' }
                }
              >
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : saveState === 'error' ? 'Save failed — retry' : 'Save Story'}
              </button>

              {saveState === 'saved' && shareUrl && (
                <button
                  onClick={handleCopy}
                  className="border px-6 py-2.5 rounded-xl text-sm text-[#d97706] hover:text-[#f59e0b] transition-colors"
                  style={{ borderColor: 'rgba(217,119,6,0.3)' }}
                >
                  {copied ? 'Copied!' : 'Copy Share Link'}
                </button>
              )}

              <Link
                href="/"
                className="border px-6 py-2.5 rounded-xl text-sm text-[#7c746d] hover:text-[#f0ebe4] transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.1)' }}
              >
                New Story
              </Link>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />

      {/* Completion toast */}
      <div
        className="fixed top-6 left-1/2 z-50 transition-all duration-500"
        style={{
          transform: showToast ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(-120%)',
          opacity: showToast ? 1 : 0,
          pointerEvents: showToast ? 'auto' : 'none',
        }}
      >
        <div
          className="flex items-center gap-4 px-5 py-3.5 rounded-2xl shadow-2xl border"
          style={{
            background: 'rgba(20,18,16,0.97)',
            borderColor: 'rgba(217,119,6,0.35)',
            backdropFilter: 'blur(16px)',
            minWidth: '260px',
          }}
        >
          <span className="relative flex-shrink-0 w-2.5 h-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
              style={{ background: '#d97706' }} />
            <span className="relative inline-flex rounded-full w-2.5 h-2.5"
              style={{ background: '#f59e0b' }} />
          </span>
          <div className="flex-1">
            <p className="text-[#fde68a] text-sm font-medium">Your story is ready</p>
            <p className="text-[#7c746d] text-xs mt-0.5">Save it, then share or read aloud.</p>
          </div>
          <button
            onClick={() => setShowToast(false)}
            className="text-[#7c746d] hover:text-[#f0ebe4] transition-colors flex-shrink-0 text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GeneratePage() {
  return (
    <Suspense>
      <GeneratePageInner />
    </Suspense>
  )
}

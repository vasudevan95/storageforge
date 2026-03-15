'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'

export interface Block {
  type: 'PLANNING' | 'CHAPTER' | 'PROSE' | 'IMAGE' | 'GENERATED_IMAGE' | 'ANNOTATION' | 'AUDIO' | 'ERROR'
  content?: string
  url?: string
  mime_type?: string
  message?: string
}

// ─── Ornamental divider ──────────────────────────────────────────────────────
function OrnamentalRule() {
  return (
    <div className="flex items-center gap-4 my-6">
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2" fill="#d97706" fillOpacity="0.6" />
        <circle cx="9" cy="9" r="5" stroke="#d97706" strokeOpacity="0.2" strokeWidth="1" />
        <line x1="0" y1="9" x2="4" y2="9" stroke="#d97706" strokeOpacity="0.3" strokeWidth="1" />
        <line x1="14" y1="9" x2="18" y2="9" stroke="#d97706" strokeOpacity="0.3" strokeWidth="1" />
      </svg>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
    </div>
  )
}

// ─── Custom audio player ─────────────────────────────────────────────────────
export function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setProgress(audio.currentTime)
    const onDuration = () => setDuration(audio.duration)
    const onEnded = () => setPlaying(false)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onDuration)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onDuration)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play()
      setPlaying(true)
    }
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    audio.currentTime = ratio * duration
  }

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl px-5 py-4 border"
      style={{ background: 'rgba(20,18,16,0.9)', borderColor: 'rgba(255,255,255,0.08)' }}>

      {/* Play/pause */}
      <button
        onClick={toggle}
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200"
        style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="#0a0908">
            <rect x="2" y="1" width="3.5" height="12" rx="1" />
            <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="#0a0908">
            <path d="M3 2l9 5-9 5V2z" />
          </svg>
        )}
      </button>

      {/* Waveform bars */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {[4, 7, 5, 9, 6, 8, 4, 6, 7, 5].map((h, i) => (
          <div
            key={i}
            className="w-0.5 rounded-full"
            style={{
              height: `${h * 2}px`,
              background: playing ? '#d97706' : 'rgba(217,119,6,0.35)',
              animationName: playing ? 'wave-bar' : 'none',
              animationDuration: `${0.4 + (i % 3) * 0.15}s`,
              animationTimingFunction: 'ease-in-out',
              animationIterationCount: 'infinite',
              animationDirection: 'alternate',
              animationDelay: `${i * 0.05}s`,
            }}
          />
        ))}
      </div>

      {/* Progress track */}
      <div className="flex-1 flex flex-col gap-1.5">
        <div
          className="h-1 rounded-full cursor-pointer overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          onClick={seek}
        >
          <div
            className="h-full rounded-full transition-all duration-100"
            style={{
              width: duration ? `${(progress / duration) * 100}%` : '0%',
              background: 'linear-gradient(90deg, #d97706, #f59e0b)',
            }}
          />
        </div>
        <div className="flex justify-between">
          <span className="text-[#7c746d] text-xs font-mono">{fmt(progress)}</span>
          <span className="text-[#7c746d] text-xs font-mono">{fmt(duration)}</span>
        </div>
      </div>

      <span className="text-[#d97706] text-xs font-mono tracking-widest uppercase flex-shrink-0">
        Listen
      </span>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
    </div>
  )
}

// ─── Cinematic scene card (shown while image generates or as permanent fallback) ──
function ImageSkeleton({ prompt, loading = true }: { prompt?: string; loading?: boolean }) {
  return (
    <div className="rounded-3xl overflow-hidden relative"
      style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(14,12,10,0.95)', minHeight: '14rem' }}>
      {/* Grain texture */}
      <div className="absolute inset-0 opacity-30 pointer-events-none"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23n)\' opacity=\'0.4\'/%3E%3C/svg%3E")', backgroundSize: '200px' }} />
      {/* Amber vignette glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(217,119,6,0.06) 0%, transparent 70%)' }} />
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center px-8 py-12 text-center gap-4"
        style={{ minHeight: '14rem' }}>
        {loading ? (
          <div className="flex gap-1 items-end">
            {[3,5,4,6,4,5,3].map((h, i) => (
              <div key={i} className="w-0.5 rounded-full"
                style={{ height: `${h * 3}px`, background: 'rgba(217,119,6,0.4)',
                  animation: `wave-bar ${0.4 + (i % 3) * 0.15}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.07}s` }} />
            ))}
          </div>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="3" fill="#d97706" fillOpacity="0.6" />
            <circle cx="10" cy="10" r="7" stroke="#d97706" strokeOpacity="0.2" strokeWidth="1" />
          </svg>
        )}
        {prompt && (
          <p className="text-[#7c746d] text-xs italic font-mono leading-relaxed max-w-sm">
            {prompt}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main renderer ───────────────────────────────────────────────────────────
export function ChapterRenderer({ blocks, done = false }: { blocks: Block[]; done?: boolean }) {
  // Track which PROSE blocks are "first in chapter" for drop cap
  const firstProseInChapter = new Set<number>()
  let lastChapterIdx = -1
  blocks.forEach((b, i) => {
    if (b.type === 'CHAPTER') lastChapterIdx = i
    if (b.type === 'PROSE' && lastChapterIdx !== -1) {
      firstProseInChapter.add(i)
      lastChapterIdx = -1
    }
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-14">
      <AnimatePresence initial={false}>
        {blocks.map((block, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* PLANNING — Creative Director's plan card */}
            {block.type === 'PLANNING' && (
              <div className="mb-12 mt-4 rounded-2xl border overflow-hidden"
                style={{ background: 'rgba(20,18,16,0.9)', borderColor: 'rgba(217,119,6,0.3)' }}>
                <div className="px-5 py-3 flex items-center gap-3 border-b"
                  style={{ background: 'rgba(217,119,6,0.08)', borderColor: 'rgba(217,119,6,0.15)' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="3" fill="#d97706" fillOpacity="0.8" />
                    <circle cx="8" cy="8" r="6" stroke="#d97706" strokeOpacity="0.3" strokeWidth="1" />
                  </svg>
                  <span className="text-[#d97706] text-xs font-mono tracking-[0.2em] uppercase font-medium">
                    Creative Director
                  </span>
                </div>
                <div className="px-5 py-4">
                  {block.content?.split('\n').map((line, li) => {
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return (
                        <h3 key={li} className="font-serif text-xl text-[#fde68a] mb-3">
                          {line.replace(/\*\*/g, '')}
                        </h3>
                      )
                    }
                    if (line.trim() === '') return <div key={li} className="h-2" />
                    return (
                      <p key={li} className="text-[#a89880] text-sm leading-relaxed font-mono">
                        {line}
                      </p>
                    )
                  })}
                </div>
              </div>
            )}

            {/* CHAPTER */}
            {block.type === 'CHAPTER' && (
              <div className="mt-16 mb-2 first:mt-0">
                <h2 className="font-serif text-3xl font-bold text-[#fde68a] leading-tight mb-1"
                  style={{ letterSpacing: '-0.01em' }}>
                  {block.content}
                </h2>
                <OrnamentalRule />
              </div>
            )}

            {/* PROSE */}
            {block.type === 'PROSE' && (
              <div className="mb-6 space-y-5">
                {block.content?.split('\n\n').filter(Boolean).map((para, pi) => (
                  <p
                    key={pi}
                    className={`text-[#e8e1d9] leading-[1.9] text-[1.05rem] font-light
                      ${firstProseInChapter.has(i) && pi === 0 ? 'drop-cap' : ''}`}
                  >
                    {para}
                  </p>
                ))}
              </div>
            )}

            {/* IMAGE placeholder (animates while generating; static card if done with no image) */}
            {block.type === 'IMAGE' && (
              <div className="my-8">
                <ImageSkeleton prompt={block.content} loading={!done} />
              </div>
            )}

            {/* GENERATED_IMAGE (AI illustration) */}
            {block.type === 'GENERATED_IMAGE' && (block.url || block.content) && (
              <motion.div
                className="my-8 rounded-3xl overflow-hidden shadow-2xl relative"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{ border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={block.url || `data:${block.mime_type || 'image/png'};base64,${block.content}`}
                  alt="AI-generated illustration"
                  className="w-full object-cover block"
                />
                {/* Vignette */}
                <div className="absolute inset-0 pointer-events-none rounded-3xl"
                  style={{ boxShadow: 'inset 0 0 60px rgba(10,9,8,0.5)' }} />
              </motion.div>
            )}

            {/* ANNOTATION */}
            {block.type === 'ANNOTATION' && (
              <div className="my-5 flex gap-3 items-start pl-1">
                <div className="w-0.5 flex-shrink-0 rounded-full mt-0.5 self-stretch"
                  style={{ background: 'rgba(217,119,6,0.5)', minHeight: '1.2rem' }} />
                <p className="text-[#7c746d] text-sm italic leading-relaxed"
                  style={{ color: '#a89880' }}>
                  {block.content}
                </p>
              </div>
            )}

            {/* ERROR */}
            {block.type === 'ERROR' && (
              <div className="my-4 rounded-xl p-4 text-red-400 text-sm border"
                style={{ background: 'rgba(127,29,29,0.15)', borderColor: 'rgba(239,68,68,0.2)' }}>
                Error: {block.message}
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

const STORY_SEEDS = [
  'A lighthouse keeper on the Konkan coast, 1960s',
  'Three generations of a Rajasthani weaver family',
  'A jazz musician in Bombay\'s golden age',
  'A woman who crossed the partition, 1947',
  'A cartographer mapping the Himalayan passes',
]

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  const handleSubmit = () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    setLoading(true)
    router.push(`/generate?prompt=${encodeURIComponent(trimmed)}`)
  }

  const handleSeed = (seed: string) => {
    setPrompt(seed)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20 overflow-hidden"
      style={{ background: '#0a0908' }}>

      {/* Grain overlay */}
      <div className="grain-overlay" />

      {/* Ambient glow */}
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(217,119,6,0.07) 0%, transparent 70%)' }} />

      {/* Hero */}
      <div className="relative z-10 mb-14 text-center">
        <h1 className="display-title mb-5">
          StoryForge
        </h1>
        <p className="text-[#7c746d] text-xl font-light tracking-wide">
          Every story begins with a single sentence.
        </p>
      </div>

      {/* Prompt card */}
      <div className="relative z-10 w-full max-w-2xl">
        <div className="glass-card rounded-2xl p-6">
          <div className="relative">
            <label
              htmlFor="story-prompt"
              className={`absolute left-4 transition-all duration-200 pointer-events-none font-light
                ${prompt ? 'top-2 text-xs text-[#d97706]' : 'top-4 text-base text-[#7c746d]'}`}
            >
              Your story premise
            </label>
            <textarea
              ref={textareaRef}
              id="story-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={4}
              className="w-full bg-transparent resize-none outline-none pt-7 pb-3 px-4
                         text-[#f0ebe4] text-base leading-relaxed
                         placeholder-transparent border-0"
              placeholder="Your story premise"
              style={{ minHeight: '7rem' }}
            />
          </div>

          <div className="border-t mt-1 pt-4 flex items-center justify-between"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="text-[#7c746d] text-xs font-mono">⌘↵ to forge</span>
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || loading}
              className="forge-btn px-7 py-2.5 rounded-xl text-sm font-medium tracking-wide
                         disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Forging…
                </span>
              ) : (
                'Forge Your Story →'
              )}
            </button>
          </div>
        </div>

        {/* Story seed chips */}
        <div className="mt-6">
          <p className="text-[#7c746d] text-xs font-mono mb-3 tracking-widest uppercase">
            Story seeds
          </p>
          <div className="flex flex-wrap gap-2">
            {STORY_SEEDS.map((seed) => (
              <button
                key={seed}
                onClick={() => handleSeed(seed)}
                disabled={loading}
                className="seed-chip px-3.5 py-1.5 rounded-full text-sm text-[#7c746d]
                           border transition-all duration-200
                           hover:text-[#f0ebe4] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: 'rgba(255,255,255,0.08)' }}
              >
                {seed}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 mt-16 flex items-center justify-center gap-6">
        <Link href="/stories" className="text-[#3a3530] hover:text-[#7c746d] text-xs font-mono tracking-wider transition-colors">
          Saved Stories
        </Link>
        <span className="text-[#3a3530] text-xs">·</span>
        <p className="text-[#3a3530] text-xs font-mono tracking-wider">
          Powered by Gemini · Google Cloud
        </p>
      </div>
    </main>
  )
}

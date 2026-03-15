import type { Metadata } from 'next'
import { ChapterRenderer, AudioPlayer, type Block } from '@/components/ChapterRenderer'
import Link from 'next/link'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface StoryData {
  title?: string
  prompt?: string
  audio_url?: string
  blocks?: Block[]
  // legacy shape (auto-save before explicit save was added)
  chapters?: Array<{ title: string; blocks: Block[] }>
  created_at?: string
}

async function getStory(id: string): Promise<StoryData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/story/${id}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const story = await getStory(id)
  const firstChapter = story?.title ?? story?.chapters?.[0]?.title ?? 'A story forged by Gemini'

  return {
    title: `${firstChapter} — StoryForge`,
    description: 'Read this story on StoryForge, powered by Gemini.',
    openGraph: {
      title: `${firstChapter} — StoryForge`,
      description: 'An AI-illustrated story, forged from a single sentence.',
      siteName: 'StoryForge',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${firstChapter} — StoryForge`,
      description: 'An AI-illustrated story, forged from a single sentence.',
    },
  }
}

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const story = await getStory(id)

  if (!story) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0908' }}>
        <div className="grain-overlay" />
        <div className="relative z-10 text-center">
          <p className="text-[#7c746d] text-xs font-mono tracking-widest uppercase mb-4">404</p>
          <h1 className="font-serif text-2xl text-[#fde68a] mb-6">Story not found.</h1>
          <Link href="/" className="text-[#d97706] hover:text-[#f59e0b] transition-colors text-sm">
            Forge your own story →
          </Link>
        </div>
      </div>
    )
  }

  // Support both the new flat `blocks` shape and the legacy `chapters` shape
  const allBlocks: Block[] = story.blocks
    ? story.blocks
    : (story.chapters ?? []).flatMap((chapter) => [
        { type: 'CHAPTER' as const, content: chapter.title },
        ...chapter.blocks,
      ])

  return (
    <div className="min-h-screen text-[#f0ebe4]" style={{ background: '#0a0908' }}>
      <div className="grain-overlay" />

      <header className="relative z-10 border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(10,9,8,0.8)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-5">
          <Link href="/" className="font-serif text-[#fde68a] text-lg hover:text-[#f0ebe4] transition-colors tracking-tight">
            StoryForge
          </Link>
          <Link href="/stories" className="text-[#7c746d] hover:text-[#f0ebe4] text-xs font-mono tracking-widest uppercase transition-colors">
            Saved Stories
          </Link>
        </div>
        <Link href="/" className="text-sm transition-colors font-light" style={{ color: '#7c746d' }}>
          Forge your own →
        </Link>
      </header>

      <div className="relative z-10">
        <ChapterRenderer blocks={allBlocks} done={true} />
      </div>

      {story.audio_url && (
        <div className="relative z-10 max-w-2xl mx-auto px-4 mb-10">
          <p className="text-[#7c746d] text-xs font-mono tracking-[0.2em] uppercase mb-3">
            Listen to the full story
          </p>
          <AudioPlayer url={story.audio_url} />
        </div>
      )}

      <footer className="relative z-10 max-w-2xl mx-auto px-4 pb-20 text-center">
        <div className="w-8 h-px mx-auto mb-5 rounded" style={{ background: 'rgba(217,119,6,0.3)' }} />
        <p className="text-[#3a3530] text-xs font-mono tracking-widest">
          Read on StoryForge · Powered by Gemini · Google Cloud
        </p>
      </footer>
    </div>
  )
}

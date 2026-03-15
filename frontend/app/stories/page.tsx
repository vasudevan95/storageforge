import Link from 'next/link'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

interface StorySummary {
  id: string
  title: string
  prompt: string
  created_at: string
}

async function getStories(): Promise<StorySummary[]> {
  try {
    const res = await fetch(`${API_BASE}/api/stories`, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return data.stories ?? []
  } catch {
    return []
  }
}

export default async function StoriesPage() {
  const stories = await getStories()

  return (
    <div className="min-h-screen text-[#f0ebe4]" style={{ background: '#0a0908' }}>
      <div className="grain-overlay" />

      <header className="relative z-10 border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(10,9,8,0.8)', backdropFilter: 'blur(20px)' }}>
        <Link href="/" className="font-serif text-[#fde68a] text-lg hover:text-[#f0ebe4] transition-colors tracking-tight">
          StoryForge
        </Link>
        <Link href="/" className="text-sm text-[#7c746d] hover:text-[#f0ebe4] transition-colors">
          Forge a new story →
        </Link>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 py-14">
        <div className="mb-10">
          <p className="text-[#d97706] text-xs font-mono tracking-[0.25em] uppercase mb-3">Archive</p>
          <h1 className="font-serif text-3xl text-[#fde68a]">Saved Stories</h1>
        </div>

        {stories.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#7c746d] text-sm font-mono mb-6">No stories saved yet.</p>
            <Link href="/" className="text-[#d97706] hover:text-[#f59e0b] transition-colors text-sm">
              Forge your first story →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {stories.map((story) => (
              <Link
                key={story.id}
                href={`/story/${story.id}`}
                className="block rounded-2xl border px-6 py-5 transition-all duration-200 hover:border-[rgba(217,119,6,0.4)] group"
                style={{ background: 'rgba(20,18,16,0.8)', borderColor: 'rgba(255,255,255,0.07)' }}
              >
                <h2 className="font-serif text-lg text-[#fde68a] group-hover:text-[#f59e0b] transition-colors mb-1">
                  {story.title}
                </h2>
                {story.prompt && (
                  <p className="text-[#7c746d] text-sm font-mono truncate mb-2">
                    &ldquo;{story.prompt}&rdquo;
                  </p>
                )}
                {story.created_at && story.created_at !== 'None' && (
                  <p className="text-[#3a3530] text-xs font-mono">
                    {new Date(story.created_at).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

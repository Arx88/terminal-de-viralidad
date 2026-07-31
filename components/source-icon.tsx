import type { SourceKey } from '@/lib/virahub-data'
import {
  BlueskyIcon,
  CryptoIcon,
  GdeltIcon,
  GithubIcon,
  HnIcon,
  NvidiaIcon,
  RedditIcon,
  RssIcon,
  XIcon,
} from '@/components/brand-icons'
import { cn } from '@/lib/utils'

const MAP = {
  reddit: { Icon: RedditIcon, tile: 'bg-[#ff4500] text-white', solo: 'text-[#ff4500]' },
  bluesky: { Icon: BlueskyIcon, tile: 'bg-[#0a7aff] text-white', solo: 'text-[#4a9df8]' },
  x: { Icon: XIcon, tile: 'bg-black text-white', solo: 'text-foreground' },
  hn: { Icon: HnIcon, tile: 'bg-[#ff6600] text-white', solo: 'text-[#ff6600]' },
  rss: { Icon: RssIcon, tile: 'bg-[#f26522] text-white', solo: 'text-[#f26522]' },
  gdelt: { Icon: GdeltIcon, tile: 'bg-[#3b4ee0] text-white', solo: 'text-[#5c6ff0]' },
  github: { Icon: GithubIcon, tile: 'bg-[#1c1c22] text-white', solo: 'text-foreground/80' },
  nvidia: { Icon: NvidiaIcon, tile: 'bg-[#76b900] text-black', solo: 'text-[#76b900]' },
  crypto: {
    Icon: CryptoIcon,
    tile: 'bg-[oklch(0.45_0.12_165)] text-white',
    solo: 'text-[var(--mint)]',
  },
} satisfies Record<SourceKey, { Icon: typeof RedditIcon; tile: string; solo: string }>

export function SourceGlyph({
  source,
  className,
}: {
  source: SourceKey
  className?: string
}) {
  const { Icon, solo } = MAP[source]
  return <Icon className={cn('size-4', solo, className)} />
}

export function SourceTile({
  source,
  className,
  iconClassName,
}: {
  source: SourceKey
  className?: string
  iconClassName?: string
}) {
  const { Icon, tile } = MAP[source]
  return (
    <span
      className={cn('flex size-8 items-center justify-center rounded-lg', tile, className)}
    >
      <Icon className={cn('size-4.5', iconClassName)} />
    </span>
  )
}

import { AnalysisPanel } from '@/components/analysis-panel'
import { HeroCard } from '@/components/hero-card'
import { LeftRail } from '@/components/left-rail'
import { LiveScan } from '@/components/live-scan'
import { TopBar } from '@/components/top-bar'
import { TrendTimeline } from '@/components/trend-timeline'

export default function Page() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      {/* ambient glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/3 size-[620px] rounded-full bg-[oklch(0.45_0.2_300)]/12 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -right-40 size-[520px] rounded-full bg-[oklch(0.45_0.2_270)]/10 blur-[140px]"
      />

      <div className="relative">
        <TopBar />
        <div className="flex items-stretch gap-2 px-4 pb-6 lg:px-6">
          <LeftRail />
          <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row">
            <main className="flex min-w-0 flex-1 flex-col gap-4">
              <HeroCard />
              <LiveScan />
              <TrendTimeline />
            </main>
            <AnalysisPanel />
          </div>
        </div>
      </div>
    </div>
  )
}

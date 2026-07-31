'use client'

import { AnalysisPanel } from '@/components/analysis-panel'
import { HeroCard } from '@/components/hero-card'
import { LeftRail } from '@/components/left-rail'
import { LiveScan } from '@/components/live-scan'
import { TopBar } from '@/components/top-bar'
import { TrendTimeline } from '@/components/trend-timeline'
import { ExploreScreen } from '@/components/screens/explore-screen'
import { AlertsScreen } from '@/components/screens/alerts-screen'
import { SavedScreen } from '@/components/screens/saved-screen'
import { useVirahub } from '@/components/virahub-provider'

function ScreenRouter() {
  const { screen } = useVirahub()

  if (screen === 'explorar') return <ExploreScreen />
  if (screen === 'alertas') return <AlertsScreen />
  if (screen === 'guardados') return <SavedScreen />

  // radar (default)
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <HeroCard />
      <LiveScan />
      <TrendTimeline />
    </main>
  )
}

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
            <ScreenRouter />
            <AnalysisPanel />
          </div>
        </div>
      </div>
    </div>
  )
}

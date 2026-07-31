'use client'

import { AnalysisPanel } from '@/components/analysis-panel'
import { HeroCard } from '@/components/hero-card'
import { LeftRail } from '@/components/left-rail'
import { LiveScan } from '@/components/live-scan'
import { Toast } from '@/components/toast'
import { TopBar } from '@/components/top-bar'
import { TrendTimeline } from '@/components/trend-timeline'
import { AlertsScreen } from '@/components/screens/alerts-screen'
import { EnginesScreen } from '@/components/screens/engines-screen'
import { ExploreScreen } from '@/components/screens/explore-screen'
import { ReportsScreen } from '@/components/screens/reports-screen'
import { SavedScreen } from '@/components/screens/saved-screen'
import { SettingsScreen } from '@/components/screens/settings-screen'
import { useVirahub } from '@/components/virahub-provider'

function ScreenRouter() {
  const { screen } = useVirahub()

  if (screen === 'explorar') return <ExploreScreen />
  if (screen === 'alertas') return <AlertsScreen />
  if (screen === 'guardados') return <SavedScreen />
  if (screen === 'motores') return <EnginesScreen />
  if (screen === 'informes') return <ReportsScreen />
  if (screen === 'ajustes') return <SettingsScreen />

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
    <div className="flex h-svh flex-col bg-background">
      {/* TopBar fijo arriba */}
      <TopBar />

      {/* Contenido: sidebar fijo + scroll principal */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar FIJO — no scrollea con el contenido */}
        <LeftRail />

        {/* Área de contenido con scroll independiente */}
        <div className="relative flex min-w-0 flex-1 overflow-hidden">
          {/* ambient glows */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 left-1/3 size-[620px] rounded-full bg-[oklch(0.45_0.2_300)]/12 blur-[140px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 -right-40 size-[520px] rounded-full bg-[oklch(0.45_0.2_270)]/10 blur-[140px]"
          />

          {/* Contenido scrolleable */}
          <div className="relative flex min-w-0 flex-1 gap-4 overflow-y-auto px-3 pb-6 sm:px-4 lg:px-6 lg:flex-row lg:gap-4">
            <ScreenRouter />
            <AnalysisPanel />
          </div>
        </div>
      </div>

      <Toast />
    </div>
  )
}

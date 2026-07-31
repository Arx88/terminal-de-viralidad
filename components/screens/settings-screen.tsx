'use client'

import { useState } from 'react'
import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  Hash,
  Info,
  Key,
  Languages,
  Mail,
  Moon,
  Palette,
  RefreshCw,
  Save,
  Settings,
  Shield,
  Sun,
  User,
  Zap,
} from 'lucide-react'
import { ScreenShell, Toggle } from '@/components/screens/screen-shell'
import { SourceTile } from '@/components/source-icon'
import { useVirahub } from '@/components/virahub-provider'
import { ENGINES } from '@/lib/virahub-data'
import { cn } from '@/lib/utils'

type TabKey = 'profile' | 'notifications' | 'apikeys' | 'about'

const TABS: { key: TabKey; label: string; Icon: typeof User }[] = [
  { key: 'profile', label: 'Perfil', Icon: User },
  { key: 'notifications', label: 'Notificaciones', Icon: Bell },
  { key: 'apikeys', label: 'API Keys', Icon: Key },
  { key: 'about', label: 'Acerca de', Icon: Info },
]

const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
]

const TIMEZONES = [
  'Europe/Madrid',
  'Europe/London',
  'America/New_York',
  'America/Sao_Paulo',
  'Asia/Tokyo',
  'UTC',
]

const THEMES = [
  { key: 'dark', label: 'Oscuro', Icon: Moon },
  { key: 'light', label: 'Claro', Icon: Sun },
  { key: 'system', label: 'Sistema', Icon: Palette },
] as const

type ApiKeyState = {
  key: string
  masked: string
  visible: boolean
  status: 'unset' | 'valid' | 'invalid'
}

const INITIAL_API_KEYS: Record<string, ApiKeyState> = {
  nvidia: {
    key: 'nvapi-3f2a8b9c1e7d4a5f6c8b2a9e7d4f1c3b',
    masked: 'nvapi-3f2a••••••••••••••••••••1c3b',
    visible: false,
    status: 'valid',
  },
  upstash: {
    key: 'AyAXe2kWZm5tQr9bNp7sHv3Ld6Kj0FgC',
    masked: 'AyAXe•••••••••••••••••••••••0FgC',
    visible: false,
    status: 'valid',
  },
  reddit: {
    key: '',
    masked: '',
    visible: false,
    status: 'unset',
  },
  gdelt: {
    key: '',
    masked: '',
    visible: false,
    status: 'unset',
  },
}

const API_KEY_META: {
  id: keyof typeof INITIAL_API_KEYS
  label: string
  description: string
  placeholder: string
  docsUrl: string
}[] = [
  {
    id: 'nvidia',
    label: 'NVIDIA Nemotron',
    description: 'Modelo LLM para análisis IA. Requerido para resúmenes y análisis avanzado.',
    placeholder: 'nvapi-XXXXXXXXXXXXXXXXXXXXXXXX',
    docsUrl: 'build.nvidia.com',
  },
  {
    id: 'upstash',
    label: 'Upstash Redis',
    description: 'Cache y rate limiting. Mejora la latencia de las consultas frecuentes.',
    placeholder: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    docsUrl: 'upstash.com',
  },
  {
    id: 'reddit',
    label: 'Reddit OAuth',
    description: 'Credenciales de Reddit para el motor Reddit. Sin esto, el motor usa anónimo.',
    placeholder: 'client_id:client_secret',
    docsUrl: 'reddit.com/prefs/apps',
  },
  {
    id: 'gdelt',
    label: 'GDELT API Key',
    description: 'Clave de GDELT para consultas avanzadas. Opcional pero recomendado.',
    placeholder: 'XXXXXXXXXXXXXXXX',
    docsUrl: 'gdeltproject.org',
  },
]

const ABOUT_STATS = [
  { label: 'Versión', value: '1.4.2' },
  { label: 'Build', value: '2024.12.18' },
  { label: 'Modelo IA', value: 'Nemotron-3-Ultra' },
  { label: 'Fuentes activas', value: '6 motores' },
  { label: 'Latencia media', value: '1.2s' },
  { label: 'Uptime 30d', value: '99.94%' },
]

export function SettingsScreen() {
  const { notify, engines, toggleEngine, live } = useVirahub()
  const [tab, setTab] = useState<TabKey>('profile')

  // Profile
  const [lang, setLang] = useState('es')
  const [timezone, setTimezone] = useState('Europe/Madrid')
  const [theme, setTheme] = useState<(typeof THEMES)[number]['key']>('dark')
  const [displayName, setDisplayName] = useState('Usuario Virahub')
  const [email, setEmail] = useState('user@virahub.io')

  // Notifications
  const [notifPrefs, setNotifPrefs] = useState({
    emailEnabled: true,
    pushEnabled: true,
    slackEnabled: false,
    slackWebhook: '',
    dailyDigest: true,
    weeklyDigest: false,
    mentionThreshold: 50,
    velocityThreshold: 100,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  })

  // API keys
  const [apiKeys, setApiKeys] = useState(INITIAL_API_KEYS)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  function saveProfile() {
    notify('Perfil guardado correctamente')
  }
  function saveNotifications() {
    notify('Preferencias de notificación guardadas')
  }
  function saveApiKey(id: string) {
    const draft = drafts[id]
    if (!draft || !draft.trim()) return
    const masked = draft.length > 8 ? `${draft.slice(0, 5)}••••••••••••••••${draft.slice(-4)}` : '••••••••'
    setApiKeys((prev) => ({
      ...prev,
      [id]: { key: draft, masked, visible: false, status: 'valid' },
    }))
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    notify(`API Key guardada para ${API_KEY_META.find((m) => m.id === id)?.label}`)
  }

  function toggleKeyVisibility(id: string) {
    setApiKeys((prev) => ({
      ...prev,
      [id]: { ...prev[id], visible: !prev[id].visible },
    }))
  }

  function removeApiKey(id: string) {
    setApiKeys((prev) => ({
      ...prev,
      [id]: { key: '', masked: '', visible: false, status: 'unset' },
    }))
    notify('API Key eliminada')
  }

  return (
    <ScreenShell
      eyebrow="Ajustes"
      title="Configuración de VIRAHUB"
      description="Personaliza tu cuenta, notificaciones, integraciones y revisa el estado del sistema. Todo en un solo lugar."
      actions={
        <span className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] text-muted-foreground">
          <Shield
            className={cn('size-3.5', live ? 'text-[var(--mint)]' : 'text-muted-foreground')}
            strokeWidth={2}
          />
          Cifrado E2E · datos en EU
        </span>
      }
    >
      {/* TABS */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border scrollbar-thin">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'relative flex shrink-0 cursor-pointer items-center gap-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors',
              tab === key ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" strokeWidth={2} />
            {label}
            {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {/* PROFILE */}
      {tab === 'profile' && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionTitle Icon={User} title="Datos de cuenta" />

            <FormField label="Nombre para mostrar" hint="Aparece en tu perfil y comentarios.">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-[13px] outline-none transition-colors focus:border-primary/40"
              />
            </FormField>

            <FormField label="Email" hint="Para notificaciones y recuperación de cuenta.">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2">
                <Mail className="size-4 text-muted-foreground" strokeWidth={2} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] outline-none"
                />
                {email.includes('@') && (
                  <CheckCircle2 className="size-4 text-[var(--mint)]" strokeWidth={2} />
                )}
              </div>
            </FormField>

            <FormField label="Idioma" hint="Idioma de la interfaz y notificaciones.">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code)}
                    className={cn(
                      'flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-2.5 py-2 text-[12.5px] font-medium transition-all',
                      lang === l.code
                        ? 'border-primary/50 bg-primary/12 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    <span>{l.flag}</span>
                    {l.label}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Zona horaria" hint="Afecta horas en informes y logs.">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2">
                <Globe className="size-4 text-muted-foreground" strokeWidth={2} />
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="flex-1 cursor-pointer bg-transparent text-[13px] outline-none"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} className="bg-card text-foreground">
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </FormField>

            <FormField label="Tema" hint="Apariencia visual de la aplicación.">
              <div className="grid grid-cols-3 gap-1.5">
                {THEMES.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTheme(key)}
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-[12px] font-medium transition-all',
                      theme === key
                        ? 'border-primary/50 bg-primary/12 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" strokeWidth={2} />
                    {label}
                  </button>
                ))}
              </div>
            </FormField>

            <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={saveProfile}
                className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-all hover:shadow-[0_0_20px_-4px_var(--primary)]"
              >
                <Save className="size-4" strokeWidth={2} /> Guardar cambios
              </button>
              <button
                type="button"
                onClick={() => {
                  setLang('es')
                  setTimezone('Europe/Madrid')
                  setTheme('dark')
                  setDisplayName('Usuario Virahub')
                  setEmail('user@virahub.io')
                  notify('Cambios descartados')
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-white/[0.06]"
              >
                <RefreshCw className="size-4" strokeWidth={2} /> Descartar
              </button>
            </div>
          </section>

          {/* PREVIEW */}
          <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/8 to-transparent p-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">Vista previa</p>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-[16px] font-bold text-primary">
                {displayName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-semibold">{displayName}</h3>
                <p className="truncate text-[12px] text-muted-foreground">{email}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2.5 text-[12.5px]">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Languages className="size-3.5" strokeWidth={2} />
                  Idioma
                </dt>
                <dd className="font-medium">{LANGUAGES.find((l) => l.code === lang)?.label}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Globe className="size-3.5" strokeWidth={2} />
                  Zona horaria
                </dt>
                <dd className="font-medium">{timezone}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Palette className="size-3.5" strokeWidth={2} />
                  Tema
                </dt>
                <dd className="font-medium capitalize">{theme}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}

      {/* NOTIFICATIONS */}
      {tab === 'notifications' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* CHANNELS */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionTitle Icon={Bell} title="Canales de notificación" />

            <ToggleRow
              Icon={Mail}
              title="Email"
              description="Recibe alertas en tu buzón."
              detail={email}
              on={notifPrefs.emailEnabled}
              onChange={(v) => setNotifPrefs((p) => ({ ...p, emailEnabled: v }))}
            />
            <ToggleRow
              Icon={BellRing}
              title="Push"
              description="Notificaciones push en tu navegador."
              detail={notifPrefs.pushEnabled ? 'Activas' : 'Inactivas'}
              on={notifPrefs.pushEnabled}
              onChange={(v) => setNotifPrefs((p) => ({ ...p, pushEnabled: v }))}
            />
            <ToggleRow
              Icon={Hash}
              title="Slack"
              description="Envía alertas a un canal de Slack vía webhook."
              detail={notifPrefs.slackEnabled ? (notifPrefs.slackWebhook ? 'Configurado' : 'Pendiente') : 'Inactivo'}
              on={notifPrefs.slackEnabled}
              onChange={(v) => setNotifPrefs((p) => ({ ...p, slackEnabled: v }))}
            />

            {notifPrefs.slackEnabled && (
              <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-300">
                <FormField label="Webhook URL" hint="https://hooks.slack.com/services/…">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2">
                    <Hash className="size-4 text-muted-foreground" strokeWidth={2} />
                    <input
                      value={notifPrefs.slackWebhook}
                      onChange={(e) =>
                        setNotifPrefs((p) => ({ ...p, slackWebhook: e.target.value }))
                      }
                      placeholder="https://hooks.slack.com/services/T0000/B0000/XXXX"
                      className="flex-1 bg-transparent font-mono text-[12px] outline-none"
                    />
                  </div>
                </FormField>
              </div>
            )}

            <div className="mt-4 border-t border-border pt-4">
              <SectionTitle Icon={Info} title="Digestos" size="sm" />
              <ToggleRow
                Icon={Mail}
                title="Digest diario"
                description="Resumen del día a las 09:00."
                on={notifPrefs.dailyDigest}
                onChange={(v) => setNotifPrefs((p) => ({ ...p, dailyDigest: v }))}
              />
              <ToggleRow
                Icon={Mail}
                title="Digest semanal"
                description="Resumen de la semana los lunes."
                on={notifPrefs.weeklyDigest}
                onChange={(v) => setNotifPrefs((p) => ({ ...p, weeklyDigest: v }))}
              />
            </div>
          </section>

          {/* THRESHOLDS + QUIET HOURS */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionTitle Icon={Zap} title="Umbrales por defecto" />

            <FormField
              label={`Umbral de menciones: ${notifPrefs.mentionThreshold} menc/h`}
              hint="Dispara cuando una tendencia supera este valor."
            >
              <input
                type="range"
                min={10}
                max={200}
                step={5}
                value={notifPrefs.mentionThreshold}
                onChange={(e) =>
                  setNotifPrefs((p) => ({ ...p, mentionThreshold: Number(e.target.value) }))
                }
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-primary"
              />
            </FormField>

            <FormField
              label={`Umbral de aceleración: ${notifPrefs.velocityThreshold}%`}
              hint="Dispara cuando la velocidad crece más de X% en 1h."
            >
              <input
                type="range"
                min={20}
                max={300}
                step={10}
                value={notifPrefs.velocityThreshold}
                onChange={(e) =>
                  setNotifPrefs((p) => ({ ...p, velocityThreshold: Number(e.target.value) }))
                }
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-primary"
              />
            </FormField>

            <div className="mt-5 border-t border-border pt-4">
              <SectionTitle Icon={Moon} title="Horas tranquilas" size="sm" />
              <p className="mt-1 mb-3 text-[12px] text-muted-foreground">
                No se enviarán notificaciones push en este intervalo.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Desde">
                  <input
                    type="time"
                    value={notifPrefs.quietHoursStart}
                    onChange={(e) =>
                      setNotifPrefs((p) => ({ ...p, quietHoursStart: e.target.value }))
                    }
                    className="w-full cursor-pointer rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-[13px] outline-none focus:border-primary/40"
                  />
                </FormField>
                <FormField label="Hasta">
                  <input
                    type="time"
                    value={notifPrefs.quietHoursEnd}
                    onChange={(e) =>
                      setNotifPrefs((p) => ({ ...p, quietHoursEnd: e.target.value }))
                    }
                    className="w-full cursor-pointer rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-[13px] outline-none focus:border-primary/40"
                  />
                </FormField>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={saveNotifications}
                className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-all hover:shadow-[0_0_20px_-4px_var(--primary)]"
              >
                <Save className="size-4" strokeWidth={2} /> Guardar
              </button>
            </div>
          </section>
        </div>
      )}

      {/* API KEYS */}
      {tab === 'apikeys' && (
        <div className="flex flex-col gap-3">
          {API_KEY_META.map((meta) => {
            const state = apiKeys[meta.id]
            const draft = drafts[meta.id] ?? ''
            return (
              <article
                key={meta.id}
                className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex flex-wrap items-start gap-4">
                  <span
                    className={cn(
                      'flex size-10 items-center justify-center rounded-lg',
                      meta.id === 'nvidia' && 'bg-[var(--mint)]/15 text-[var(--mint)]',
                      meta.id === 'upstash' && 'bg-[var(--cool)]/15 text-[var(--cool)]',
                      meta.id === 'reddit' && 'bg-[#ff4500]/15 text-[#ff4500]',
                      meta.id === 'gdelt' && 'bg-primary/15 text-primary',
                    )}
                  >
                    <Key className="size-4" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14.5px] font-semibold">{meta.label}</h3>
                      <StatusBadge status={state.status} />
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{meta.description}</p>
                  </div>
                  <a
                    href={`https://${meta.docsUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer text-[11.5px] text-primary transition-opacity hover:underline hover:opacity-80"
                  >
                    Docs ↗
                  </a>
                </div>

                {/* CURRENT KEY */}
                {state.key && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-white/[0.02] px-3 py-2">
                    <span className="font-mono text-[12px] text-foreground/85">
                      {state.visible ? state.key : state.masked}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(meta.id)}
                        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                        aria-label={state.visible ? 'Ocultar' : 'Mostrar'}
                      >
                        {state.visible ? <EyeOff className="size-3.5" strokeWidth={2} /> : <Eye className="size-3.5" strokeWidth={2} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeApiKey(meta.id)}
                        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Eliminar"
                      >
                        <RefreshCw className="size-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                )}

                {/* INPUT */}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [meta.id]: e.target.value }))}
                    placeholder={meta.placeholder}
                    className="flex-1 rounded-lg border border-border bg-white/[0.03] px-3 py-2 font-mono text-[12px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/40"
                    type={meta.id === 'reddit' ? 'text' : 'password'}
                  />
                  <button
                    type="button"
                    onClick={() => saveApiKey(meta.id)}
                    disabled={!draft.trim()}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-[12.5px] font-medium transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="size-3.5" strokeWidth={2} /> Guardar
                  </button>
                </div>
              </article>
            )
          })}

          <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <Shield className="size-3.5 text-[var(--mint)]" strokeWidth={2} />
            Las claves se cifran en reposo y nunca se exponen al cliente. Solo se usan server-side.
          </p>
        </div>
      )}

      {/* ABOUT */}
      {tab === 'about' && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <section className="rounded-2xl border border-border bg-card p-5">
            <SectionTitle Icon={Info} title="Información del sistema" />
            <dl className="grid grid-cols-2 gap-3">
              {ABOUT_STATS.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-border bg-white/[0.02] p-3"
                >
                  <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
                  <dd className="mt-1 text-[14.5px] font-semibold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 border-t border-border pt-4">
              <SectionTitle Icon={Cpu} title="Fuentes activas" size="sm" />
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ENGINES.map((e) => {
                  const isActive = engines.includes(e.id)
                  return (
                    <li
                      key={e.id}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border p-2 transition-colors',
                        isActive ? 'border-border bg-white/[0.02]' : 'border-border/60 opacity-60',
                      )}
                    >
                      <SourceTile source={e.id} className={cn('size-7', !isActive && 'opacity-50')} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium">{e.name}</p>
                        <p
                          className={cn(
                            'flex items-center gap-1 text-[10.5px]',
                            isActive ? 'text-[var(--mint)]' : 'text-muted-foreground',
                          )}
                        >
                          <span
                            className={cn('size-1.5 rounded-full', isActive ? 'bg-[var(--mint)]' : 'bg-muted-foreground')}
                            style={isActive && live ? { animation: 'vh-pulse 1.6s ease-in-out infinite' } : undefined}
                          />
                          {isActive ? 'Activo' : 'Pausado'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleEngine(e.id)}
                        className="cursor-pointer text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {isActive ? 'Pausar' : 'Activar'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>

          <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/8 to-transparent p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Settings className="size-5" strokeWidth={2} />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold">VIRAHUB</h3>
                <p className="text-[11.5px] text-muted-foreground">Detector de tendencias virales</p>
              </div>
            </div>
            <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground text-pretty">
              Plataforma de detección temprana de tendencias que analiza millones de conversaciones
              diarias en 6 fuentes. Modelo Nemotron-3-Ultra para análisis semántico y scoring de
              velocidad. Construido con Next.js 16, Tailwind CSS 4 y arquitectura serverless.
            </p>
            <ul className="mt-4 space-y-2 text-[12px]">
              {[
                { label: 'Repositorio', value: 'github.com/virahub/app' },
                { label: 'Status', value: 'status.virahub.io' },
                { label: 'Soporte', value: 'support@virahub.io' },
                { label: 'Licencia', value: 'MIT' },
              ].map((row) => (
                <li key={row.label} className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-mono text-[11.5px] text-foreground/85">{row.value}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => notify('Buscando actualizaciones…')}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <RefreshCw className="size-3.5" strokeWidth={2} /> Buscar actualizaciones
              </button>
              <button
                type="button"
                onClick={() => notify('Logs de diagnóstico abiertos')}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white/[0.04] px-3 py-2 text-[12.5px] font-medium transition-colors hover:bg-white/[0.08]"
              >
                <Info className="size-3.5" strokeWidth={2} /> Diagnóstico
              </button>
            </div>
          </section>
        </div>
      )}
    </ScreenShell>
  )
}

/* ═══════ HELPERS ═══════ */
function SectionTitle({
  Icon,
  title,
  size = 'md',
}: {
  Icon: typeof User
  title: string
  size?: 'sm' | 'md'
}) {
  return (
    <h2
      className={cn(
        'flex items-center gap-2 font-semibold',
        size === 'md' ? 'mb-4 text-[15px]' : 'mb-2 text-[13px]',
      )}
    >
      <Icon className={cn('text-muted-foreground', size === 'md' ? 'size-4' : 'size-3.5')} strokeWidth={2} />
      {title}
    </h2>
  )
}

function FormField({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-[12px] font-semibold text-foreground">{label}</label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function ToggleRow({
  Icon,
  title,
  description,
  detail,
  on,
  onChange,
}: {
  Icon: typeof Bell
  title: string
  description: string
  detail?: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-lg transition-colors',
          on ? 'bg-primary/12 text-primary' : 'bg-white/[0.04] text-muted-foreground',
        )}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">
          {description}
          {detail && <span className="ml-1 text-foreground/60">· {detail}</span>}
        </p>
      </div>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  )
}

function StatusBadge({ status }: { status: ApiKeyState['status'] }) {
  const cfg = {
    valid: { label: 'Válida', className: 'border-[var(--mint)]/40 bg-[var(--mint)]/12 text-[var(--mint)]' },
    invalid: { label: 'Inválida', className: 'border-destructive/40 bg-destructive/12 text-destructive' },
    unset: { label: 'Sin configurar', className: 'border-border bg-white/[0.04] text-muted-foreground' },
  } as const
  const c = cfg[status]
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
        c.className,
      )}
    >
      {status === 'valid' && <Check className="size-2.5" strokeWidth={3} />}
      {c.label}
    </span>
  )
}

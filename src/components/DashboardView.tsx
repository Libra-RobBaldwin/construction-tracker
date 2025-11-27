'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import type {
  Plot,
  ConstructionStage as Stage,
  ConstructionProgress,
} from '@/types/plot'

const MAP_SLUG = 'welbourne'

type TimelineCell = {
  plotId: string
  stageId: string
  stageName: string
  stageColor: string
  plannedStart?: Date | null
  plannedEnd?: Date | null
  actualStart?: Date | null
  actualEnd?: Date | null
  status: 'not-started' | 'on-time' | 'delayed' | 'overdue' | 'completed'
  progress?: ConstructionProgress
}

type TimelineWeek = {
  weekStart: Date
  weekEnd: Date
  weekLabel: string
}

type EditingCell = {
  plotId: string
  stageId: string
  field: 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd'
}

type StageProgress = ConstructionProgress

type StageDraft = {
  completionPercentage: number
  recordedAt: string
}

type StageDraftMap = Record<string, Record<string, StageDraft>>

type StageKey = string

const toInputDate = (date: Date | null | undefined): string => {
  if (!date) return ''
  const iso = date.toISOString()
  return iso.slice(0, 10)
}

const parseDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const dt = new Date(value)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  return null
}

const shadeFromHex = (hex: string, alpha = 0.2) => {
  if (!hex) return `rgba(59, 130, 246, ${alpha})`
  const sanitized = hex.replace('#', '')
  if (sanitized.length !== 6) return `rgba(59, 130, 246, ${alpha})`
  const r = parseInt(sanitized.slice(0, 2), 16)
  const g = parseInt(sanitized.slice(2, 4), 16)
  const b = parseInt(sanitized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const normaliseStageProgress = (progress: StageProgress[]): StageProgress[] => {
  return progress.map((item) => ({
    ...item,
    createdAt: parseDate(item.createdAt) ?? new Date(),
    updatedAt: parseDate(item.updatedAt) ?? new Date(),
    constructionStage: item.constructionStage
      ? {
          ...item.constructionStage,
          createdAt: parseDate(item.constructionStage.createdAt) ?? new Date(),
          updatedAt: parseDate(item.constructionStage.updatedAt) ?? new Date(),
        }
      : undefined,
  }))
}

const buildStageDraftState = (plots: Plot[]): StageDraftMap => {
  return plots.reduce<StageDraftMap>((acc, plot) => {
    const stageDrafts: Record<string, StageDraft> = {}
    const stages = plot.constructionType?.constructionStages ?? []

    stages
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((stage) => {
        const latest = plot.constructionProgress
          ?.filter((progress) => progress.constructionStageId === stage.id)
          ?.sort((a, b) => {
            const aTime = parseDate(a.updatedAt)?.getTime() ?? 0
            const bTime = parseDate(b.updatedAt)?.getTime() ?? 0
            return bTime - aTime
          })[0]

        stageDrafts[stage.id] = {
          completionPercentage: latest?.completionPercentage ?? 0,
          recordedAt: toInputDate(parseDate(latest?.updatedAt)),
        }
      })

    acc[plot.id] = stageDrafts
    return acc
  }, {})
}

const sortStages = (stages: Stage[] = []) => {
  return stages.slice().sort((a, b) => a.sortOrder - b.sortOrder)
}

const formatRecordedAt = (value: string | null | undefined) => {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString()
}

export default function DashboardView() {
  const [plots, setPlots] = useState<Plot[]>([])
  const [stageDrafts, setStageDrafts] = useState<StageDraftMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingStageKey, setSavingStageKey] = useState<StageKey | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const fetchPlots = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/plots?map=${MAP_SLUG}`)
      if (!response.ok) throw new Error('Failed to load plots')

      const data = (await response.json()) as Plot[]

      const normalised = data.map((plot) => ({
        ...plot,
        createdAt: parseDate(plot.createdAt) ?? new Date(),
        updatedAt: parseDate(plot.updatedAt) ?? new Date(),
        constructionProgress: plot.constructionProgress
          ? normaliseStageProgress(plot.constructionProgress)
          : [],
        constructionType: plot.constructionType
          ? {
              ...plot.constructionType,
              createdAt: parseDate(plot.constructionType.createdAt) ?? new Date(),
              updatedAt: parseDate(plot.constructionType.updatedAt) ?? new Date(),
              constructionStages:
                plot.constructionType.constructionStages?.map((stage) => ({
                  ...stage,
                  createdAt: parseDate(stage.createdAt) ?? new Date(),
                  updatedAt: parseDate(stage.updatedAt) ?? new Date(),
                })) ?? [],
            }
          : null,
      }))

      setPlots(normalised)
      setStageDrafts(buildStageDraftState(normalised))
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to load plots')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlots()
  }, [fetchPlots])

  const allStagesPresent = useMemo(() => {
    const hasStages = plots.every((plot) => (plot.constructionType?.constructionStages?.length ?? 0) > 0)
    return hasStages
  }, [plots])

  const handleStageDraftChange = (plotId: string, stageId: string, update: Partial<StageDraft>) => {
    setStageDrafts((prev) => {
      const prevForPlot = prev[plotId] ?? {}
      const prevForStage = prevForPlot[stageId] ?? { completionPercentage: 0, recordedAt: '' }

      return {
        ...prev,
        [plotId]: {
          ...prevForPlot,
          [stageId]: {
            completionPercentage: update.completionPercentage ?? prevForStage.completionPercentage,
            recordedAt: update.recordedAt ?? prevForStage.recordedAt,
          },
        },
      }
    })
  }

  const handleSaveStage = async (plot: Plot, stage: Stage) => {
    const draft = stageDrafts[plot.id]?.[stage.id]
    if (!draft) return

    const key: StageKey = `${plot.id}:${stage.id}`
    setSavingStageKey(key)
    setStatusMessage(null)

    try {
      const payload = {
        plotId: plot.id,
        stageId: stage.id,
        completionPercentage: draft.completionPercentage,
        recordedAt: draft.recordedAt || undefined,
      }

      const response = await fetch('/api/construction-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error('Failed to record stage progress')

      setStatusMessage(`Updated ${stage.name} for ${plot.name}`)
      await fetchPlots()
    } catch (err) {
      console.error(err)
      setStatusMessage(err instanceof Error ? err.message : 'Failed to update stage progress')
    } finally {
      setSavingStageKey(null)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  // Debounced save functionality
  const saveTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map())
  
  const debouncedSaveStage = useCallback((plot: Plot, stage: Stage, delay: number = 2000) => {
    const key = `${plot.id}:${stage.id}`
    
    // Clear existing timeout for this plot-stage combination
    const existingTimeout = saveTimeouts.current.get(key)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      handleSaveStage(plot, stage)
      saveTimeouts.current.delete(key)
    }, delay)
    
    saveTimeouts.current.set(key, timeout)
  }, [])

  // Handle completion percentage change with debounced save
  const handleCompletionPercentageChange = useCallback((plot: Plot, stage: Stage, value: number) => {
    // Update draft immediately for UI responsiveness
    handleStageDraftChange(plot.id, stage.id, {
      completionPercentage: value,
    })
    
    // Schedule debounced save
    debouncedSaveStage(plot, stage)
  }, [debouncedSaveStage])

  // Handle Enter key press for immediate save
  const handleCompletionKeyDown = useCallback((e: React.KeyboardEvent, plot: Plot, stage: Stage) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      
      // Cancel any pending debounced save
      const key = `${plot.id}:${stage.id}`
      const existingTimeout = saveTimeouts.current.get(key)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
        saveTimeouts.current.delete(key)
      }
      
      // Save immediately
      handleSaveStage(plot, stage)
    }
  }, [])

  if (loading) {
    return (
      <div className="p-10">
        <div className="text-center text-gray-500">Loading project plan...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-10 space-y-4">
        <div className="text-center text-red-500">{error}</div>
        <div className="flex justify-center">
          <button
            onClick={fetchPlots}
            className="inline-flex items-center px-4 py-2 rounded bg-gray-900 text-white hover:bg-gray-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!allStagesPresent) {
    return (
      <div className="p-10">
        <div className="max-w-2xl mx-auto rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow">
          <h2 className="text-lg font-semibold text-gray-900">Construction stages not configured</h2>
          <p className="mt-3 text-sm text-gray-600">
            Each plot must be linked to a construction type with defined stages before the project plan can be displayed.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Construction Stages</h1>
          <p className="text-sm text-gray-600">
            Track each plot through the configured construction stages. Update completion levels and capture recorded dates as work progresses.
          </p>
        </div>
        {statusMessage && (
          <div className="px-4 py-2 rounded bg-gray-900 text-white text-sm shadow">
            {statusMessage}
          </div>
        )}
      </div>

      <div className="space-y-5">
        {plots.map((plot) => {
          const stages = sortStages(plot.constructionType?.constructionStages)
          const stageDraft = stageDrafts[plot.id] ?? {}

          return (
            <div key={plot.id} className="bg-white border border-gray-200 shadow-sm rounded-xl">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-5 py-4 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{plot.name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                    {plot.constructionType?.name && (
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-gray-700">Type:</span>
                        {plot.constructionType.name}
                      </span>
                    )}
                    {plot.homebuilder?.name && (
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-gray-700">Builder:</span>
                        {plot.homebuilder.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  Overall progress <span className="font-semibold text-gray-900">
                    {Math.round(
                      (plot.constructionProgress?.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) ?? 0) /
                      Math.max(1, stages.length)
                    )}%
                  </span>
                </div>
              </div>

              <div className="p-4 overflow-x-auto">
                <div className="min-w-max flex gap-4">
                  {stages.map((stage) => {
                    const latest = plot.constructionProgress
                      ?.filter((item) => item.constructionStageId === stage.id)
                      ?.sort((a, b) => {
                        const aTime = parseDate(a.updatedAt)?.getTime() ?? 0
                        const bTime = parseDate(b.updatedAt)?.getTime() ?? 0
                        return bTime - aTime
                      })?.[0]

                    const draft = stageDraft[stage.id] ?? {
                      completionPercentage: latest?.completionPercentage ?? 0,
                      recordedAt: toInputDate(parseDate(latest?.updatedAt)),
                    }

                    const color = stage.color || '#3b82f6'
                    const accent = shadeFromHex(color, 0.25)
                    const border = shadeFromHex(color, 0.55)
                    const barWidth = Math.max(2, Math.min(100, draft.completionPercentage))
                    const stageKey: StageKey = `${plot.id}:${stage.id}`

                    return (
                      <div key={stage.id} className="min-w-[230px] max-w-[250px] flex-1 rounded-lg border border-gray-200 bg-gray-50">
                        <div className="px-4 py-3 border-b border-gray-200">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{stage.name}</div>
                              {stage.description && (
                                <div className="mt-1 text-xs text-gray-500 line-clamp-2">{stage.description}</div>
                              )}
                            </div>
                            <span className="text-sm font-semibold text-gray-900">{draft.completionPercentage}%</span>
                          </div>
                          <div className="mt-3 h-2.5 w-full rounded-full bg-gray-200">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${barWidth}%`, backgroundColor: accent, border: `1px solid ${border}` }}
                            />
                          </div>
                          <div className="mt-2 text-xs text-gray-500">
                            Last recorded: {formatRecordedAt(draft.recordedAt || toInputDate(parseDate(latest?.updatedAt)))}
                          </div>
                        </div>

                        <div className="px-4 py-3 space-y-3 bg-white rounded-b-lg">
                          <div className="flex items-center gap-3">
                            <label htmlFor={`${stageKey}-range`} className="text-xs font-medium text-gray-600 w-16">
                              Progress
                            </label>
                            <input
                              id={`${stageKey}-range`}
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={draft.completionPercentage}
                              onChange={(e) => handleCompletionPercentageChange(plot, stage, Number(e.target.value))}
                              onKeyDown={(e) => handleCompletionKeyDown(e, plot, stage)}
                              className="flex-1"
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <label htmlFor={`${stageKey}-date`} className="text-xs font-medium text-gray-600 w-16">
                              Recorded
                            </label>
                            <input
                              id={`${stageKey}-date`}
                              type="date"
                              value={draft.recordedAt}
                              onChange={(e) =>
                                handleStageDraftChange(plot.id, stage.id, {
                                  recordedAt: e.target.value,
                                })
                              }
                              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                          </div>

                          <button
                            onClick={() => handleSaveStage(plot, stage)}
                            className={`w-full rounded px-3 py-2 text-sm font-medium shadow-sm transition-colors ${
                              savingStageKey === stageKey
                                ? 'bg-gray-300 text-gray-600 cursor-progress'
                                : 'bg-gray-900 text-white hover:bg-gray-700'
                            }`}
                            disabled={savingStageKey === stageKey}
                          >
                            {savingStageKey === stageKey ? 'Saving...' : 'Save Stage Progress'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


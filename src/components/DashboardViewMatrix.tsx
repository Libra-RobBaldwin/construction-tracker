'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import type {
  Plot,
  ConstructionStage as Stage,
  ConstructionProgress,
} from '@/types/plot'
import TimelineCard from './TimelineCard'
import TimelineCardHover from './TimelineCardHover'

type Homebuilder = {
  id: string
  name: string
  contactEmail?: string | null
  contactPhone?: string | null
  address?: string | null
  website?: string | null
  createdAt: Date
  updatedAt: Date
}

const MAP_SLUG = 'welbourne'

type TimelineCell = {
  plotId: string
  stageId: string
  stageName: string
  stageColor: string
  programmeStart?: Date | null
  programmeEnd?: Date | null
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
  weekNumber: number
  year: number
  weekLabel: string
  dateLabel: string
}

type HomebuilderGroup = {
  homebuilder: Homebuilder
  plots: Plot[]
  isExpanded: boolean
}

type PlotGroup = {
  plot: Plot
  stages: Stage[]
  isExpanded: boolean
}

type EditingCell = {
  plotId: string
  stageId: string
  field: 'programmeStart' | 'programmeEnd' | 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd'
}

// Helper functions
const parseDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const dt = new Date(value)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  return null
}

const formatDateForInput = (date: Date | null | undefined): string => {
  if (!date) return ''
  const dt = date instanceof Date ? date : new Date(date)
  return dt.toISOString().slice(0, 10)
}

const formatDateForDisplay = (date: Date | null | undefined): string => {
  if (!date) return ''
  const dt = date instanceof Date ? date : new Date(date)
  const day = dt.getDate().toString().padStart(2, '0')
  const month = (dt.getMonth() + 1).toString().padStart(2, '0')
  const year = dt.getFullYear()
  return `${day}/${month}/${year}`
}

const parseDateFromDDMMYY = (dateStr: string): string => {
  if (!dateStr) return ''
  const parts = dateStr.split('/')
  if (parts.length !== 3) return ''
  
  const day = parts[0].padStart(2, '0')
  const month = parts[1].padStart(2, '0')
  let year = parts[2]
  
  // Convert 2-digit year to 4-digit
  if (year.length === 2) {
    const currentYear = new Date().getFullYear()
    const currentCentury = Math.floor(currentYear / 100) * 100
    const twoDigitYear = parseInt(year)
    year = (currentCentury + twoDigitYear).toString()
  }
  
  return `${year}-${month}-${day}`
}

const getWeekStart = (date: Date): Date => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  return new Date(d.setDate(diff))
}

const addWeeks = (date: Date, weeks: number): Date => {
  const result = new Date(date)
  result.setDate(result.getDate() + (weeks * 7))
  return result
}

const getWeekNumber = (date: Date): number => {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}

const generateTimelineWeeks = (startDate: Date, weekCount: number): TimelineWeek[] => {
  const weeks: TimelineWeek[] = []
  
  for (let i = 0; i < weekCount; i++) {
    const weekStart = addWeeks(startDate, i)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    
    const year = weekStart.getFullYear()
    const weekNumber = getWeekNumber(weekStart)
    const weekLabel = `W${weekNumber}`
    const dateLabel = `${weekStart.getDate().toString().padStart(2, '0')}/${(weekStart.getMonth() + 1).toString().padStart(2, '0')}`
    
    weeks.push({
      weekStart,
      weekEnd,
      weekNumber,
      year,
      weekLabel,
      dateLabel
    })
  }
  
  return weeks
}

const getStageStatus = (
  plannedStart?: Date | null,
  plannedEnd?: Date | null,
  actualStart?: Date | null,
  actualEnd?: Date | null
): 'not-started' | 'on-time' | 'delayed' | 'overdue' | 'completed' => {
  const now = new Date()
  
  if (actualEnd) return 'completed'
  if (!plannedStart) return 'not-started'
  
  if (actualStart) {
    // Started
    if (plannedEnd && now > plannedEnd) {
      return 'overdue'
    }
    if (plannedEnd && now > new Date(plannedEnd.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      return 'delayed' // Within a week of planned end
    }
    return 'on-time'
  } else {
    // Not started
    if (now > plannedStart) {
      return 'overdue'
    }
    return 'not-started'
  }
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'not-started': return 'bg-gray-100 text-gray-600'
    case 'on-time': return 'bg-gray-200 text-gray-700'
    case 'delayed': return 'bg-amber-100 text-amber-700'
    case 'overdue': return 'bg-red-100 text-red-700'
    case 'completed': return 'bg-blue-100 text-blue-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export default function DashboardView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [plots, setPlots] = useState<Plot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [expandedHomebuilders, setExpandedHomebuilders] = useState<Set<string>>(new Set())
  const [expandedPlots, setExpandedPlots] = useState<Set<string>>(new Set())
  const [timelineRef, setTimelineRef] = useState<HTMLDivElement | null>(null)
  const [initialScrollSet, setInitialScrollSet] = useState(false)

  // Save and restore view state
  const saveViewState = useCallback((scrollPosition?: number) => {
    const viewState = {
      expandedHomebuilders: Array.from(expandedHomebuilders),
      expandedPlots: Array.from(expandedPlots),
      scrollPosition: scrollPosition ?? timelineRef?.scrollLeft ?? 0,
      timestamp: Date.now()
    }
    localStorage.setItem('dashboard-view-state', JSON.stringify(viewState))
  }, [expandedHomebuilders, expandedPlots, timelineRef])

  const restoreViewState = useCallback(() => {
    try {
      const saved = localStorage.getItem('dashboard-view-state')
      if (saved) {
        const viewState = JSON.parse(saved)
        // Only restore if saved within last 24 hours
        if (Date.now() - viewState.timestamp < 24 * 60 * 60 * 1000) {
          setExpandedHomebuilders(new Set(viewState.expandedHomebuilders || []))
          setExpandedPlots(new Set(viewState.expandedPlots || []))
          return viewState.scrollPosition || 0
        }
      }
    } catch (err) {
      console.error('Failed to restore view state:', err)
    }
    return null
  }, [])

  const updateURL = useCallback((params: Record<string, string>) => {
    const current = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        current.set(key, value)
      } else {
        current.delete(key)
      }
    })
    router.replace(`?${current.toString()}`, { scroll: false })
  }, [router, searchParams])

  const fetchPlots = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/plots?map=${MAP_SLUG}`)
      if (!response.ok) throw new Error('Failed to load plots')

      const data = await response.json()
      setPlots(data)
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

  // Initialize view state from URL and localStorage
  useEffect(() => {
    // Set URL parameter to indicate dashboard view
    updateURL({ view: 'dashboard' })

    // Restore expanded state from localStorage
    restoreViewState()
  }, [updateURL, restoreViewState])

  // Generate timeline weeks (Jan 2025 to end of 2028 = ~4 years)
  const timelineWeeks = useMemo(() => {
    const startDate = new Date('2025-01-01')
    const startOfWeek = getWeekStart(startDate)
    return generateTimelineWeeks(startOfWeek, 208) // ~4 years of weeks
  }, [])

  // Scroll positioning with state restoration
  useEffect(() => {
    if (timelineRef && timelineWeeks.length > 0 && !initialScrollSet) {
      // Default to current week -2 on first load
      const now = new Date()
      console.log('Current date:', now)
      console.log('Timeline weeks length:', timelineWeeks.length)
      console.log('First week:', timelineWeeks[0])
      console.log('Last week:', timelineWeeks[timelineWeeks.length - 1])
      
      const currentWeekIndex = timelineWeeks.findIndex(week => 
        now >= week.weekStart && now <= week.weekEnd
      )
      
      console.log('Current week index:', currentWeekIndex)
      
      if (currentWeekIndex >= 0) {
        const targetWeekIndex = Math.max(0, currentWeekIndex - 2)
        const scrollLeft = targetWeekIndex * 48
        console.log('Target week index:', targetWeekIndex)
        console.log('Scroll left:', scrollLeft)
        timelineRef.scrollLeft = scrollLeft
      } else {
        console.log('Current week not found in timeline')
        // Fallback: scroll to a reasonable position (week 40 for October)
        const fallbackWeekIndex = 40 // Roughly October
        const scrollLeft = fallbackWeekIndex * 48
        timelineRef.scrollLeft = scrollLeft
      }
      
      setInitialScrollSet(true)
    }
  }, [timelineRef, timelineWeeks, initialScrollSet])

  // Group plots by homebuilder
  const homebuilderGroups = useMemo((): HomebuilderGroup[] => {
    const groups: Map<string, HomebuilderGroup> = new Map()
    
    plots.forEach(plot => {
      if (!plot.homebuilder) return
      
      const key = plot.homebuilder.id
      if (!groups.has(key)) {
        groups.set(key, {
          homebuilder: plot.homebuilder,
          plots: [],
          isExpanded: expandedHomebuilders.has(key)
        })
      }
      
      groups.get(key)!.plots.push(plot)
    })
    
    return Array.from(groups.values()).sort((a, b) => a.homebuilder.name.localeCompare(b.homebuilder.name))
  }, [plots, expandedHomebuilders])

  // Build timeline cells data
  const timelineCells = useMemo(() => {
    const cells: TimelineCell[] = []
    
    plots.forEach(plot => {
      if (!plot.constructionType?.constructionStages) return
      
      const sortedStages = [...plot.constructionType.constructionStages]
        .sort((a, b) => a.sortOrder - b.sortOrder)
      
      sortedStages.forEach(stage => {
        const progress = plot.constructionProgress?.find(
          p => p.constructionStageId === stage.id
        )
        
        const programmeStart = parseDate(progress?.programmeStartDate)
        const programmeEnd = parseDate(progress?.programmeEndDate)
        const plannedStart = parseDate(progress?.plannedStartDate)
        const plannedEnd = parseDate(progress?.plannedEndDate)
        const actualStart = parseDate(progress?.actualStartDate)
        const actualEnd = parseDate(progress?.actualEndDate)
        
        const status = getStageStatus(plannedStart, plannedEnd, actualStart, actualEnd)
        
        cells.push({
          plotId: plot.id,
          stageId: stage.id,
          stageName: stage.name,
          stageColor: stage.color,
          programmeStart,
          programmeEnd,
          plannedStart,
          plannedEnd,
          actualStart,
          actualEnd,
          status,
          progress
        })
      })
    })
    
    return cells
  }, [plots])

  // Calculate current date position
  const currentDatePosition = useMemo(() => {
    const now = new Date()
    const currentWeek = timelineWeeks.find(week => 
      now >= week.weekStart && now <= week.weekEnd
    )
    
    if (!currentWeek) return null
    
    const weekIndex = timelineWeeks.indexOf(currentWeek)
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay() // Sunday = 7, Monday = 1
    const dayProgress = (dayOfWeek - 1) / 7 // 0 = Monday, 1 = Sunday
    
    return {
      weekIndex,
      offsetPixels: weekIndex * 48 + (dayProgress * 48)
    }
  }, [timelineWeeks])

  // Check if cell overlaps with week
  const isCellInWeek = (cell: TimelineCell, week: TimelineWeek): boolean => {
    const { plannedStart, plannedEnd, actualStart, actualEnd } = cell
    
    // Use actual dates if available, otherwise planned dates
    const startDate = actualStart || plannedStart
    const endDate = actualEnd || plannedEnd
    
    if (!startDate) return false
    
    const cellEnd = endDate || startDate
    
    return (
      (startDate >= week.weekStart && startDate <= week.weekEnd) ||
      (cellEnd >= week.weekStart && cellEnd <= week.weekEnd) ||
      (startDate <= week.weekStart && cellEnd >= week.weekEnd)
    )
  }

  const toggleHomebuilder = (homebuilderId: string) => {
    setExpandedHomebuilders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(homebuilderId)) {
        newSet.delete(homebuilderId)
      } else {
        newSet.add(homebuilderId)
      }
      // Save state after change
      setTimeout(() => saveViewState(), 0)
      return newSet
    })
  }

  const togglePlot = (plotId: string) => {
    setExpandedPlots(prev => {
      const newSet = new Set(prev)
      if (newSet.has(plotId)) {
        newSet.delete(plotId)
      } else {
        newSet.add(plotId)
      }
      // Save state after change
      setTimeout(() => saveViewState(), 0)
      return newSet
    })
  }

  // Save scroll position periodically
  useEffect(() => {
    if (!timelineRef) return

    const handleScroll = () => {
      saveViewState(timelineRef.scrollLeft)
    }

    // Throttle scroll events
    let timeoutId: NodeJS.Timeout
    const throttledScroll = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(handleScroll, 500) // Save scroll position 500ms after stopping
    }

    timelineRef.addEventListener('scroll', throttledScroll)
    
    return () => {
      timelineRef.removeEventListener('scroll', throttledScroll)
      clearTimeout(timeoutId)
    }
  }, [timelineRef, saveViewState])

  const handleDateUpdate = async (
    plotId: string,
    stageId: string,
    field: 'programmeStart' | 'programmeEnd' | 'plannedStart' | 'plannedEnd' | 'actualStart' | 'actualEnd',
    value: string,
    reason?: string
  ) => {
    try {
      const date = value ? new Date(value) : null
      
      const payload: any = {
        plotId,
        stageId,
        [field === 'programmeStart' ? 'programmeStartDate' : 
         field === 'programmeEnd' ? 'programmeEndDate' :
         field === 'plannedStart' ? 'plannedStartDate' : 
         field === 'plannedEnd' ? 'plannedEndDate' :
         field === 'actualStart' ? 'actualStartDate' : 'actualEndDate']: date?.toISOString()
      }

      // Add plan change tracking for planned date changes
      if (field === 'plannedStart' || field === 'plannedEnd') {
        payload.planChangeReason = reason || 'Plan date updated'
        payload.recordedBy = 'User' // In a real app, this would be the logged-in user
      }

      const response = await fetch('/api/construction-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error('Failed to update date')

      const updatedProgress = await response.json()
      
      // Update local state instead of refetching all plots
      setPlots(prevPlots => 
        prevPlots.map(plot => {
          if (plot.id === plotId) {
            return {
              ...plot,
              constructionProgress: plot.constructionProgress?.map(progress => 
                progress.constructionStageId === stageId 
                  ? { ...progress, ...updatedProgress }
                  : progress
              ) || []
            }
          }
          return plot
        })
      )

      toast.success(`Updated ${field} date`)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to update date')
    } finally {
      setEditingCell(null)
    }
  }

  const updateCompletionPercentage = async (plotId: string, stageId: string, percentage: number) => {
    try {
      const response = await fetch('/api/construction-progress', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plotId,
          stageId,
          completionPercentage: percentage,
        }),
      })

      if (!response.ok) throw new Error('Failed to update completion percentage')

      // Update local state instead of refetching all plots
      setPlots(prevPlots => 
        prevPlots.map(plot => {
          if (plot.id === plotId) {
            return {
              ...plot,
              constructionProgress: plot.constructionProgress?.map(progress => 
                progress.constructionStageId === stageId 
                  ? { ...progress, completionPercentage: percentage }
                  : progress
              ) || []
            }
          }
          return plot
        })
      )

      toast.success(`Updated completion to ${percentage}%`)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to update completion percentage')
    }
  }

  if (loading) {
    return (
      <div className="p-10">
        <div className="text-center text-gray-500">Loading project timeline...</div>
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

  if (plots.length === 0) {
    return (
      <div className="p-10">
        <div className="max-w-2xl mx-auto rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow">
          <h2 className="text-lg font-semibold text-gray-900">No plots found</h2>
          <p className="mt-3 text-sm text-gray-600">
            No construction plots are available for the project timeline.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-85px)] bg-gray-50">
  {/* Timeline Grid - Single scrollable container for both sides */}
  <div className="flex-1 overflow-y-auto overflow-x-auto" ref={setTimelineRef}>
    <div className="flex min-h-full min-w-max relative">
        {/* Sticky Left Panel - Hierarchy & Date Inputs */}
        <div className="sticky left-0 flex-shrink-0 w-[460px] bg-white border-r-2 border-gray-300 flex flex-col z-40">
          {/* Master Header Container - Empty to match timeline */}
          <div className="sticky top-0 bg-white border-b border-gray-200 z-30">
            <div className="master-header-container">
              {/* Year header equivalent - matches timeline exactly */}
              <div className="flex border-b border-gray-100">
                <div className="py-1 bg-white w-full">
                  <div className="text-sm font-bold text-transparent select-none">2025</div>
                </div>
              </div>
              {/* Month header equivalent - matches timeline exactly */}
              <div className="flex border-b border-gray-100">
                <div className="py-1 bg-white w-full">
                  <div className="text-xs font-semibold text-transparent select-none">Jan</div>
                </div>
              </div>
              {/* Week header equivalent - matches timeline exactly */}
              <div className="flex">
                <div className="px-0.5 py-1 bg-white w-full">
                  <div className="text-xs font-medium text-transparent select-none">W01</div>
                  <div className="text-xs text-transparent leading-tight select-none" style={{ fontSize: '10px' }}>
                    1/1/25
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Scrollable Hierarchy */}
          <div>
            {homebuilderGroups.map(group => (
              <div key={group.homebuilder.id}>
                    {/* Homebuilder Header */}
                <div 
                  className="bg-blue-50 px-3 cursor-pointer hover:bg-blue-100 transition-colors border-b border-gray-200 h-12 flex items-center box-border"
                  onClick={() => toggleHomebuilder(group.homebuilder.id)}
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-blue-700">
                      {expandedHomebuilders.has(group.homebuilder.id) ? '▼' : '▶'}
                    </span>
                    <span className="text-sm font-semibold text-blue-900">
                      {group.homebuilder.name}
                    </span>
                    <span className="text-xs text-blue-600">
                      ({group.plots.length} plots)
                    </span>
                  </div>
                </div>                {/* Expanded Plots */}
                {expandedHomebuilders.has(group.homebuilder.id) && group.plots.map(plot => (
                  <div key={plot.id} className="ml-4 border-l-2 border-blue-200">
                    {/* Plot Header */}
                    <div 
                      className="bg-white px-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-200 h-16 flex items-center box-border"
                      onClick={() => togglePlot(plot.id)}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-green-900">
                          {expandedPlots.has(plot.id) ? '▼' : '▶'}
                        </span>
                        <span className="text-sm font-medium text-green-900">
                          {plot.name}
                        </span>
                        <span className="text-xs text-green-600">
                          {plot.constructionType?.name}
                        </span>
                      </div>
                    </div>

                    {/* Date Column Headers for this Plot - Compact */}
                    {expandedPlots.has(plot.id) && (
                      <div className="bg-gray-100 border-b border-gray-200 h-8 box-border">
                        <div className="grid gap-3 text-xs font-medium text-gray-700 ml-4 h-full items-center" style={{ gridTemplateColumns: '4px 90px 90px 90px 90px' }}>
                          <div></div>
                          <div className="text-left">Stage</div>
                          <div className="text-left">Programme</div>
                          <div className="text-left">Planned</div>
                          <div className="text-left">Actual</div>
                        </div>
                      </div>
                    )}

                    {/* Expanded Construction Stages */}
                    {expandedPlots.has(plot.id) && plot.constructionType?.constructionStages
                      ?.sort((a, b) => a.sortOrder - b.sortOrder)
                      .map(stage => {
                        const cell = timelineCells.find(
                          c => c.plotId === plot.id && c.stageId === stage.id
                        )
                        
                        return (
                          <div key={stage.id} className="ml-4 bg-white h-16 flex items-center border-b border-gray-200 box-border" style={{ borderLeft: '2px solid #bbf7d0' }}>
                            <div className="grid gap-3 pr-2 text-xs w-full h-full" style={{ gridTemplateColumns: '4px 90px 90px 90px 90px' }}>
                              {/* Rectangle Column */}
                              <div className="h-full" style={{ backgroundColor: stage.color }}></div>
                              
                              {/* Stage Column */}
                              <div className="space-y-1 flex flex-col justify-center h-full">
                                <div className="w-full px-1 py-0.5 flex items-center text-xs bg-white text-gray-700" style={{ fontSize: '12px', height: '24px' }}>
                                  <span className="text-gray-800 font-medium leading-tight text-left">{stage.name.replace(/\s*(Complete|Completion)\s*$/i, '')}</span>
                                </div>
                                <div className="relative w-12">
                                  <input
                                    type="number"
                                    value={cell?.progress?.completionPercentage || 0}
                                    onChange={(e) => {
                                      // Handle completion percentage update with validation
                                      let percentage = parseInt(e.target.value) || 0;
                                      percentage = Math.max(0, Math.min(100, percentage)); // Clamp between 0-100
                                      updateCompletionPercentage(plot.id, stage.id, percentage);
                                    }}
                                    min="0"
                                    max="100"
                                    className="w-full pl-1 pr-4 py-0.5 border border-gray-300 rounded text-xs bg-white text-gray-700 text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    style={{ fontSize: '10px' }}
                                    placeholder="0"
                                  />
                                  <span className="absolute right-1 top-0.5 text-xs text-gray-500 pointer-events-none">%</span>
                                </div>
                              </div>
                              
                              {/* Programme Column */}
                              <div className="space-y-1 flex flex-col justify-center h-full">
                                <input
                                  type="date"
                                  value={formatDateForInput(cell?.programmeStart)}
                                  onChange={(e) => handleDateUpdate(plot.id, stage.id, 'programmeStart', e.target.value)}
                                  className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs bg-white text-gray-700"
                                  style={{ fontSize: '10px' }}
                                />
                                <input
                                  type="date"
                                  value={formatDateForInput(cell?.programmeEnd)}
                                  onChange={(e) => handleDateUpdate(plot.id, stage.id, 'programmeEnd', e.target.value)}
                                  className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs bg-white text-gray-700"
                                  style={{ fontSize: '10px' }}
                                />
                              </div>

                              {/* Planned Column */}
                              <div className="space-y-1 flex flex-col justify-center h-full">
                                <input
                                  type="date"
                                  value={formatDateForInput(cell?.plannedStart)}
                                  onChange={(e) => handleDateUpdate(plot.id, stage.id, 'plannedStart', e.target.value)}
                                  className="w-full px-1 py-0.5 border border-blue-300 rounded text-xs bg-blue-50 text-blue-800"
                                  style={{ fontSize: '10px' }}
                                />
                                <input
                                  type="date"
                                  value={formatDateForInput(cell?.plannedEnd)}
                                  onChange={(e) => handleDateUpdate(plot.id, stage.id, 'plannedEnd', e.target.value)}
                                  className="w-full px-1 py-0.5 border border-blue-300 rounded text-xs bg-blue-50 text-blue-800"
                                  style={{ fontSize: '10px' }}
                                />
                              </div>

                              {/* Actual Column */}
                              <div className="space-y-1 flex flex-col justify-center h-full">
                                <input
                                  type="date"
                                  value={formatDateForInput(cell?.actualStart)}
                                  onChange={(e) => handleDateUpdate(plot.id, stage.id, 'actualStart', e.target.value)}
                                  className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs bg-gray-100 text-gray-700"
                                  style={{ fontSize: '10px' }}
                                />
                                <input
                                  type="date"
                                  value={formatDateForInput(cell?.actualEnd)}
                                  onChange={(e) => handleDateUpdate(plot.id, stage.id, 'actualEnd', e.target.value)}
                                  className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs bg-gray-100 text-gray-700"
                                  style={{ fontSize: '10px' }}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Current Date Indicator */}
        {currentDatePosition && (
          <div 
            className="absolute top-0 bottom-0 z-10 pointer-events-none"
            style={{ left: `${currentDatePosition.offsetPixels + 440}px` }} // 440px = left panel width
          >
            {/* Triangle at top */}
            <div className="absolute top-0 left-0 transform -translate-x-1/2">
              <div className="w-0 h-0 border-l-4 border-r-4 border-b-6 border-transparent border-b-blue-600"></div>
            </div>
            {/* Vertical line */}
            <div className="w-0.5 h-full bg-blue-600 transform -translate-x-1/2"></div>
          </div>
        )}

        {/* Scrollable Timeline Chart */}
        <div className="flex-1 flex flex-col">
          {/* Master Timeline Header Container - Outside scroll area */}
          <div className="sticky top-0 bg-white border-b border-gray-200 z-40 overflow-x-auto">
            <div className="min-w-max">
              <div className="master-header-container">
                {/* Year Header */}
                <div className="flex border-b border-gray-100">
                  {(() => {
                    const yearGroups: { year: number; weekCount: number }[] = []
                    let currentYear = timelineWeeks[0]?.year
                    let weekCount = 0
                    
                    timelineWeeks.forEach((week, index) => {
                      if (week.year !== currentYear) {
                        yearGroups.push({ year: currentYear, weekCount })
                        currentYear = week.year
                        weekCount = 1
                      } else {
                        weekCount++
                      }
                      
                      if (index === timelineWeeks.length - 1) {
                        yearGroups.push({ year: currentYear, weekCount })
                      }
                    })
                    
                    return yearGroups.map(group => (
                      <div
                        key={group.year}
                        className="border-r border-gray-200 bg-blue-50 text-center py-1"
                        style={{ width: `${group.weekCount * 48}px` }}
                      >
                        <div className="text-sm font-bold text-blue-900">{group.year}</div>
                      </div>
                    ))
                  })()}
                </div>
                
                {/* Month Header */}
                <div className="flex border-b border-gray-100">
                  {(() => {
                    const monthGroups: { month: number; year: number; weekCount: number }[] = []
                    let currentMonth = timelineWeeks[0]?.weekStart.getMonth()
                    let currentYear = timelineWeeks[0]?.year
                    let weekCount = 0
                    
                    timelineWeeks.forEach((week, index) => {
                      const weekMonth = week.weekStart.getMonth()
                      const weekYear = week.year
                      
                      if (weekMonth !== currentMonth || weekYear !== currentYear) {
                        monthGroups.push({ month: currentMonth, year: currentYear, weekCount })
                        currentMonth = weekMonth
                        currentYear = weekYear
                        weekCount = 1
                      } else {
                        weekCount++
                      }
                      
                      if (index === timelineWeeks.length - 1) {
                        monthGroups.push({ month: currentMonth, year: currentYear, weekCount })
                      }
                    })
                    
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                    
                    return monthGroups.map((group, index) => (
                      <div
                        key={`${group.year}-${group.month}`}
                        className="border-r border-gray-200 bg-gray-100 text-center py-1"
                        style={{ width: `${group.weekCount * 48}px` }}
                      >
                        <div className="text-xs font-semibold text-gray-700">{monthNames[group.month]}</div>
                      </div>
                    ))
                  })()}
                </div>
                
                {/* Week Header */}
                <div className="flex">
                  {timelineWeeks.map(week => (
                    <div
                      key={`${week.year}-${week.weekNumber}`}
                      className="w-12 px-0.5 py-1 border-r border-gray-200 text-center"
                    >
                      <div className="text-xs font-medium text-gray-900">{week.weekLabel}</div>
                      <div className="text-xs text-gray-500 leading-tight" style={{ fontSize: '9px' }}>
                        {week.dateLabel}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Body - In its own scroll area */}
          <div className="flex-1 overflow-x-auto">
            <div className="min-w-max">
              {homebuilderGroups.map(group => (
                <div key={group.homebuilder.id}>
                  {/* Homebuilder Timeline Row */}
                  <div className="flex border-b border-gray-200 h-12">
                    {timelineWeeks.map(week => (
                      <div
                        key={`${group.homebuilder.id}-${week.year}-${week.weekNumber}`}
                        className="w-12 h-full border-r border-gray-300 bg-blue-50 box-border"
                      />
                    ))}
                  </div>

                  {/* Plot and Stage Timeline Rows - Only show when homebuilder is expanded */}
                  {expandedHomebuilders.has(group.homebuilder.id) && group.plots.map(plot => (
                    <div key={plot.id}>
                      {/* Plot Timeline Row with Programme Cards */}
                      <div className="relative h-16">
                        {/* Programme cards for all stages in this plot */}
                        {plot.constructionType?.constructionStages
                          ?.sort((a, b) => a.sortOrder - b.sortOrder)
                          .map(stage => {
                            const cell = timelineCells.find(
                              c => c.plotId === plot.id && c.stageId === stage.id
                            )
                            
                            return cell?.programmeStart && cell?.programmeEnd ? (
                              <TimelineCardHover
                                key={stage.id}
                                cardType="programme"
                                stageName={cell.stageName}
                                startDate={cell.programmeStart}
                                endDate={cell.programmeEnd}
                                stageColor={cell.stageColor}
                              >
                                <TimelineCard
                                  startDate={cell.programmeStart}
                                  endDate={cell.programmeEnd}
                                  color={`${cell.stageColor}80`}
                                  opacity={1}
                                  timelineWeeks={timelineWeeks}
                                  zIndex={1}
                                >
                                  <div className="w-full h-full flex items-start justify-start p-1">
                                    <div className="text-left text-white text-[10px] font-medium leading-tight max-w-full">
                                      <div className="truncate max-w-full">{cell.stageName}</div>
                                    </div>
                                  </div>
                                </TimelineCard>
                              </TimelineCardHover>
                            ) : null
                          })}

                        {/* Planned date cards for all stages in this plot - on top of actual cards */}
                        {plot.constructionType?.constructionStages
                          ?.sort((a, b) => a.sortOrder - b.sortOrder)
                          .map(stage => {
                            const cell = timelineCells.find(
                              c => c.plotId === plot.id && c.stageId === stage.id
                            )
                            
                            // Find the most recent plan version for this stage
                            if (cell?.progress?.planHistory && cell.progress.planHistory.length > 0) {
                              const mostRecentPlan = cell.progress.planHistory.reduce((latest, current) => 
                                current.versionNumber > latest.versionNumber ? current : latest
                              )
                              
                              return (
                                <TimelineCardHover
                                  key={`planned-${stage.id}`}
                                  cardType="planned"
                                  stageName={cell.stageName}
                                  startDate={mostRecentPlan.plannedStartDate ? new Date(mostRecentPlan.plannedStartDate) : null}
                                  endDate={mostRecentPlan.plannedEndDate ? new Date(mostRecentPlan.plannedEndDate) : null}
                                  stageColor={cell.stageColor}
                                  version={mostRecentPlan.versionNumber}
                                  planHistory={cell.progress.planHistory}
                                >
                                  <TimelineCard
                                    startDate={mostRecentPlan.plannedStartDate ? new Date(mostRecentPlan.plannedStartDate) : null}
                                    endDate={mostRecentPlan.plannedEndDate ? new Date(mostRecentPlan.plannedEndDate) : null}
                                    color="transparent"
                                    opacity={1}
                                    timelineWeeks={timelineWeeks}
                                    zIndex={20}
                                    height="h-4"
                                    className="top-7"
                                  >
                                    <div 
                                      className="w-full h-full flex items-center justify-start p-1 border-2 rounded"
                                      style={{ borderColor: cell.stageColor }}
                                    >
                                      <div className="text-left text-[10px] font-medium leading-tight" style={{ color: cell.stageColor }}>
                                        v{mostRecentPlan.versionNumber}
                                      </div>
                                    </div>
                                  </TimelineCard>
                                </TimelineCardHover>
                              )
                            }
                            return null
                          })}

                        {/* Actual date cards for all stages in this plot - at bottom */}
                        {plot.constructionType?.constructionStages
                          ?.sort((a, b) => a.sortOrder - b.sortOrder)
                          .map(stage => {
                            const cell = timelineCells.find(
                              c => c.plotId === plot.id && c.stageId === stage.id
                            )
                            
                            // Handle completed actual work (both start and end dates)
                            if (cell?.progress?.actualStartDate && cell.progress.actualEndDate) {
                              return (
                                <TimelineCardHover
                                  key={`actual-${stage.id}`}
                                  cardType="actual"
                                  stageName={cell.stageName}
                                  startDate={new Date(cell.progress.actualStartDate)}
                                  endDate={new Date(cell.progress.actualEndDate)}
                                  stageColor={cell.stageColor}
                                >
                                  <TimelineCard
                                    startDate={new Date(cell.progress.actualStartDate)}
                                    endDate={new Date(cell.progress.actualEndDate)}
                                    color={cell.stageColor}
                                    opacity={1}
                                    timelineWeeks={timelineWeeks}
                                    zIndex={15}
                                    height="h-4"
                                    className="top-11"
                                  />
                                </TimelineCardHover>
                              )
                            }
                            
                            // Handle started but unfinished actual work (only start date)
                            if (cell?.progress?.actualStartDate && !cell.progress.actualEndDate) {
                              return (
                                <TimelineCardHover
                                  key={`actual-started-${stage.id}`}
                                  cardType="actual"
                                  stageName={cell.stageName}
                                  startDate={new Date(cell.progress.actualStartDate)}
                                  endDate={null}
                                  stageColor={cell.stageColor}
                                >
                                  <div 
                                    className="absolute h-4 top-11 flex items-center"
                                    style={{
                                      left: `${timelineWeeks.findIndex(week => {
                                        const startDate = new Date(cell.progress!.actualStartDate!)
                                        return startDate >= week.weekStart && startDate < week.weekEnd
                                      }) * 48}px`,
                                      zIndex: 15
                                    }}
                                  >
                                    <div 
                                      className="w-0 h-0"
                                      style={{
                                        borderLeft: `12px solid ${cell.stageColor}`,
                                        borderTop: '8px solid transparent',
                                        borderBottom: '8px solid transparent'
                                      }}
                                    />
                                  </div>
                                </TimelineCardHover>
                              )
                            }
                            
                            return null
                          })}
                        
                        {/* Timeline week cells - background grid */}
                        <div className="flex h-16">
                          {timelineWeeks.map(week => (
                            <div
                              key={`${plot.id}-${week.year}-${week.weekNumber}`}
                              className="w-12 h-full border-r border-gray-300 bg-white box-border"
                            />
                          ))}
                        </div>
                      </div>

                      {/* Plot Date Headers Timeline Row */}
                      {expandedPlots.has(plot.id) && (
                        <div className="flex border-b border-gray-200 h-8">
                          {timelineWeeks.map(week => (
                            <div
                              key={`${plot.id}-headers-${week.year}-${week.weekNumber}`}
                              className="w-12 h-8 border-r border-gray-300 bg-gray-100 box-border"
                            />
                          ))}
                        </div>
                      )}

                      {/* Stage Timeline Rows - Only show when plot is expanded */}
                      {expandedPlots.has(plot.id) && plot.constructionType?.constructionStages
                        ?.sort((a, b) => a.sortOrder - b.sortOrder)
                        .map(stage => {
                          const cell = timelineCells.find(
                            c => c.plotId === plot.id && c.stageId === stage.id
                          )
                          
                          return (
                            <div key={stage.id} className="relative h-16">
                              {/* Programme date background card with stage info */}
                              {cell?.programmeStart && cell?.programmeEnd && (
                                <TimelineCardHover
                                  cardType="programme"
                                  stageName={cell.stageName}
                                  startDate={cell.programmeStart}
                                  endDate={cell.programmeEnd}
                                  stageColor={cell.stageColor}
                                >
                                  <TimelineCard
                                    startDate={cell.programmeStart}
                                    endDate={cell.programmeEnd}
                                    color={`${cell.stageColor}80`}
                                    opacity={1}
                                    timelineWeeks={timelineWeeks}
                                    zIndex={1}
                                  >
                                    <div className="w-full h-full flex items-start justify-start p-1">
                                      <div className="text-left text-white text-[10px] font-medium leading-tight max-w-full">
                                        <div className="truncate max-w-full">{cell.stageName}</div>
                                      </div>
                                    </div>
                                  </TimelineCard>
                                </TimelineCardHover>
                              )}

                              {/* Planned date cards - show only the most recent version */}
                              {cell?.progress?.planHistory && cell.progress.planHistory.length > 0 && (() => {
                                // Find the most recent plan version (highest version number)
                                const mostRecentPlan = cell.progress.planHistory.reduce((latest, current) => 
                                  current.versionNumber > latest.versionNumber ? current : latest
                                )
                                
                                return (
                                  <TimelineCardHover
                                    key={`planned-${mostRecentPlan.versionNumber}`}
                                    cardType="planned"
                                    stageName={cell.stageName}
                                    startDate={mostRecentPlan.plannedStartDate ? new Date(mostRecentPlan.plannedStartDate) : null}
                                    endDate={mostRecentPlan.plannedEndDate ? new Date(mostRecentPlan.plannedEndDate) : null}
                                    stageColor={cell.stageColor}
                                    version={mostRecentPlan.versionNumber}
                                    planHistory={cell.progress.planHistory}
                                  >
                                    <TimelineCard
                                      startDate={mostRecentPlan.plannedStartDate ? new Date(mostRecentPlan.plannedStartDate) : null}
                                      endDate={mostRecentPlan.plannedEndDate ? new Date(mostRecentPlan.plannedEndDate) : null}
                                      color="transparent"
                                      opacity={1}
                                      timelineWeeks={timelineWeeks}
                                      zIndex={20}
                                      height="h-4"
                                      className="top-7"
                                    >
                                      <div 
                                        className="w-full h-full flex items-center justify-start p-1 border-2 rounded"
                                        style={{ borderColor: cell.stageColor }}
                                      >
                                        <div className="text-left text-[10px] font-medium leading-tight" style={{ color: cell.stageColor }}>
                                          v{mostRecentPlan.versionNumber}
                                        </div>
                                      </div>
                                    </TimelineCard>
                                  </TimelineCardHover>
                                )
                              })()}

                              {/* Actual date cards - at bottom of programme cards */}
                              {/* Completed actual work (both start and end dates) */}
                              {cell?.progress?.actualStartDate && cell.progress.actualEndDate && (
                                <TimelineCardHover
                                  cardType="actual"
                                  stageName={cell.stageName}
                                  startDate={new Date(cell.progress.actualStartDate)}
                                  endDate={new Date(cell.progress.actualEndDate)}
                                  stageColor={cell.stageColor}
                                >
                                  <TimelineCard
                                    startDate={new Date(cell.progress.actualStartDate)}
                                    endDate={new Date(cell.progress.actualEndDate)}
                                    color={cell.stageColor}
                                    opacity={1}
                                    timelineWeeks={timelineWeeks}
                                    zIndex={15}
                                    height="h-4"
                                    className="top-11"
                                  />
                                </TimelineCardHover>
                              )}
                              
                              {/* Started but unfinished actual work (only start date) */}
                              {cell?.progress?.actualStartDate && !cell.progress.actualEndDate && (
                                <TimelineCardHover
                                  cardType="actual"
                                  stageName={cell.stageName}
                                  startDate={new Date(cell.progress.actualStartDate)}
                                  endDate={null}
                                  stageColor={cell.stageColor}
                                >
                                  <div 
                                    className="absolute h-4 top-11 flex items-center"
                                    style={{
                                      left: `${timelineWeeks.findIndex(week => {
                                        const startDate = new Date(cell.progress!.actualStartDate!)
                                        return startDate >= week.weekStart && startDate < week.weekEnd
                                      }) * 48}px`,
                                      zIndex: 15
                                    }}
                                  >
                                    <div 
                                      className="w-0 h-0"
                                      style={{
                                        borderLeft: `12px solid ${cell.stageColor}`,
                                        borderTop: '8px solid transparent',
                                        borderBottom: '8px solid transparent'
                                      }}
                                    />
                                  </div>
                                </TimelineCardHover>
                              )}
                              
                              {/* Timeline week cells - now just grid background */}
                              <div className="flex h-16">
                                {timelineWeeks.map((week, weekIndex) => (
                                  <div
                                    key={`${stage.id}-${week.year}-${week.weekNumber}`}
                                    className="w-12 h-16 border-r border-b border-gray-200 bg-white hover:bg-gray-50 box-border"
                                  />
                                ))}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plot, Homebuilder, ConstructionType, UnitType, ConstructionStage } from '@/types/plot'

interface EnhancedPlotDialogProps {
  show: boolean
  onClose: () => void
  onSave: (plotData: PlotCreationData, plotId?: string) => void
  coordinates: [number, number][]
  saving: boolean
  existingPlotsWithoutPolygons: Plot[]
  viewingPlot?: Plot // Optional plot to view details
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

const parseDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const dt = new Date(value)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  return null
}

const toInputDate = (date: Date | null | undefined): string => {
  if (!date) return ''
  const iso = date.toISOString()
  return iso.slice(0, 10)
}

const formatRecordedAt = (dateStr: string): string => {
  if (!dateStr) return 'Not recorded'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

type StageDraft = {
  completionPercentage: number
  recordedAt: string
  programmeStartDate?: string
  programmeEndDate?: string
  plannedStartDate?: string
  plannedEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
}

type StageDraftMap = Record<string, StageDraft>
type StageKey = string

export interface PlotCreationData {
  // Required for new plot
  name?: string
  // Optional connection to existing plot
  existingPlotId?: string
  // Extended fields
  streetAddress?: string
  homebuilderId?: string
  constructionTypeId?: string
  unitTypeId?: string
  numberOfBeds?: number
  numberOfStoreys?: number
  squareFootage?: number
  minimumSalePrice?: number
  // Basic fields
  description?: string
  contractor?: string
  notes?: string
}

export default function EnhancedPlotDialog({ 
  show, 
  onClose, 
  onSave, 
  coordinates, 
  saving,
  existingPlotsWithoutPolygons,
  viewingPlot
}: EnhancedPlotDialogProps) {
  const [mode, setMode] = useState<'new' | 'connect' | 'view'>('new')
  const [formData, setFormData] = useState<PlotCreationData>({})
  
  // Master data
  const [homebuilders, setHomebuilders] = useState<Homebuilder[]>([])
  const [constructionTypes, setConstructionTypes] = useState<ConstructionType[]>([])
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([])
  
  // Loading states
  const [loadingMasterData, setLoadingMasterData] = useState(false)
  
  // Dashboard-style progress management
  const [stageDrafts, setStageDrafts] = useState<StageDraftMap>({})
  const [savingStageKey, setSavingStageKey] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const saveTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map())

  useEffect(() => {
    if (show) {
      loadMasterData()
      // Set mode based on whether we're viewing an existing plot
      if (viewingPlot) {
        setMode('view')
        // Populate form data with existing plot data for editing
        setFormData({
          name: viewingPlot.name,
          streetAddress: viewingPlot.streetAddress || '',
          homebuilderId: viewingPlot.homebuilderId || '',
          constructionTypeId: viewingPlot.constructionTypeId || '',
          unitTypeId: viewingPlot.unitTypeId || '',
          numberOfBeds: viewingPlot.numberOfBeds || undefined,
          numberOfStoreys: viewingPlot.numberOfStoreys || undefined,
          squareFootage: viewingPlot.squareFootage || undefined,
          minimumSalePrice: viewingPlot.minimumSalePrice || undefined,
          description: viewingPlot.description || '',
          contractor: viewingPlot.contractor || '',
          notes: viewingPlot.notes || ''
        })
      } else {
        setMode('new')
      }
      
      // Initialize stage drafts for viewing mode
      if (viewingPlot) {
        const stageDrafts: StageDraftMap = {}
        const stages = viewingPlot.constructionType?.constructionStages ?? []

        stages
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .forEach((stage) => {
            const latest = viewingPlot.constructionProgress
              ?.filter((item) => item.constructionStageId === stage.id)
              ?.sort((a, b) => {
                const aTime = parseDate(a.createdAt)?.getTime() ?? 0
                const bTime = parseDate(b.createdAt)?.getTime() ?? 0
                return bTime - aTime
              })?.[0]

            stageDrafts[stage.id] = {
              completionPercentage: latest?.completionPercentage ?? 0,
              recordedAt: toInputDate(parseDate(latest?.createdAt)),
              programmeStartDate: latest?.programmeStartDate ? 
                new Date(latest.programmeStartDate).toISOString().split('T')[0] : '',
              programmeEndDate: latest?.programmeEndDate ? 
                new Date(latest.programmeEndDate).toISOString().split('T')[0] : '',
              plannedStartDate: latest?.plannedStartDate ? 
                new Date(latest.plannedStartDate).toISOString().split('T')[0] : '',
              plannedEndDate: latest?.plannedEndDate ? 
                new Date(latest.plannedEndDate).toISOString().split('T')[0] : '',
              actualStartDate: latest?.actualStartDate ? 
                new Date(latest.actualStartDate).toISOString().split('T')[0] : '',
              actualEndDate: latest?.actualEndDate ? 
                new Date(latest.actualEndDate).toISOString().split('T')[0] : '',
            }
          })

        setStageDrafts(stageDrafts)
      }
    } else {
      // Reset form when dialog closes
      setFormData({})
      setMode('new')
      setStageDrafts({})
      setStatusMessage(null)
    }
  }, [show, viewingPlot])

  const loadMasterData = async () => {
    setLoadingMasterData(true)
    try {
      const [homebuildersRes, constructionTypesRes, unitTypesRes] = await Promise.all([
        fetch('/api/homebuilders'),
        fetch('/api/construction-types'),
        fetch('/api/unit-types')
      ])

      const [homebuildersData, constructionTypesData, unitTypesData] = await Promise.all([
        homebuildersRes.json(),
        constructionTypesRes.json(),
        unitTypesRes.json()
      ])

      setHomebuilders(homebuildersData)
      setConstructionTypes(constructionTypesData)
      setUnitTypes(unitTypesData)
    } catch (error) {
      console.error('Failed to load master data:', error)
    } finally {
      setLoadingMasterData(false)
    }
  }

  const handleSave = () => {
    if (mode === 'new' && !formData.name?.trim()) return
    if (mode === 'connect' && !formData.existingPlotId) return
    if (mode === 'view' && !formData.name?.trim()) return
    
    // Pass plot ID for updates in view mode
    const plotId = mode === 'view' ? viewingPlot?.id : undefined
    onSave(formData, plotId)
  }

  const updateFormData = (field: keyof PlotCreationData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Dashboard-style stage management functions
  const handleStageDraftChange = useCallback((stageId: string, update: Partial<StageDraft>) => {
    setStageDrafts(prev => {
      const defaultDraft: StageDraft = {
        completionPercentage: 0,
        recordedAt: '',
        programmeStartDate: '',
        programmeEndDate: '',
        plannedStartDate: '',
        plannedEndDate: '',
        actualStartDate: '',
        actualEndDate: '',
      }
      
      return {
        ...prev,
        [stageId]: {
          ...defaultDraft,
          ...prev[stageId],
          ...update,
        },
      }
    })
  }, [])

  const handleSaveStage = useCallback(async (stage: ConstructionStage) => {
    if (!viewingPlot) return
    const draft = stageDrafts[stage.id]
    if (!draft) return

    const key: StageKey = `${viewingPlot.id}:${stage.id}`
    setSavingStageKey(key)
    setStatusMessage(null)

    try {
      const payload = {
        plotId: viewingPlot.id,
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

      setStatusMessage(`Updated ${stage.name}`)
      // Refresh the plot data by calling onSave with current form data
      if (formData.name?.trim()) {
        onSave(formData, viewingPlot.id)
      }
    } catch (err) {
      console.error(err)
      setStatusMessage(err instanceof Error ? err.message : 'Failed to update stage progress')
    } finally {
      setSavingStageKey(null)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }, [viewingPlot, stageDrafts, formData, onSave])

  const debouncedSaveStage = useCallback((stage: ConstructionStage, delay = 2000) => {
    if (!viewingPlot) return
    const key = `${viewingPlot.id}:${stage.id}`
    
    // Clear existing timeout for this stage
    const existingTimeout = saveTimeouts.current.get(key)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      handleSaveStage(stage)
      saveTimeouts.current.delete(key)
    }, delay)

    saveTimeouts.current.set(key, timeout)
  }, [viewingPlot, handleSaveStage])

  const handleCompletionPercentageChange = useCallback((stage: ConstructionStage, value: number) => {
    handleStageDraftChange(stage.id, { completionPercentage: value })
    debouncedSaveStage(stage, 2000)
  }, [handleStageDraftChange, debouncedSaveStage])

  const handleCompletionKeyDown = useCallback((e: React.KeyboardEvent, stage: ConstructionStage) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveStage(stage)
    }
  }, [handleSaveStage])

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full max-h-[90vh] overflow-y-auto ${
        mode === 'view' ? 'max-w-[1150px]' : 'max-w-2xl'
      }`}>
        {mode === 'view' ? (
          <div className="flex">
            {/* Left Column - Editable Plot Form */}
            <div className="w-[480px] flex-shrink-0 p-6 border-r border-gray-200">
              <h3 className="text-lg font-bold mb-5 text-gray-900">Edit Plot Details</h3>
              
              {loadingMasterData ? (
                <div className="text-center py-4 text-gray-600">Loading...</div>
              ) : (
                <div className="space-y-4">
                  {/* Plot Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Plot Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name || viewingPlot?.name || ''}
                      onChange={(e) => updateFormData('name', e.target.value)}
                      placeholder="Enter plot name..."
                      className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                      disabled={saving}
                    />
                  </div>

                  {/* Extended Fields */}
                  <div className="space-y-4">
                    {/* First row: Homebuilder and Construction Type */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Homebuilder
                        </label>
                        <select
                          value={formData.homebuilderId || viewingPlot?.homebuilderId || ''}
                          onChange={(e) => updateFormData('homebuilderId', e.target.value)}
                          className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                          disabled={saving}
                        >
                          <option value="">Select homebuilder...</option>
                          {homebuilders.map(builder => (
                            <option key={builder.id} value={builder.id}>
                              {builder.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Construction Type
                        </label>
                        <select
                          value={formData.constructionTypeId || viewingPlot?.constructionTypeId || ''}
                          onChange={(e) => updateFormData('constructionTypeId', e.target.value)}
                          className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                          disabled={saving}
                        >
                          <option value="">Select construction type...</option>
                          {constructionTypes.map(type => (
                            <option key={type.id} value={type.id}>
                              {type.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Second row: Unit Type and Street Address */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Unit Type
                        </label>
                        <select
                          value={formData.unitTypeId || viewingPlot?.unitTypeId || ''}
                          onChange={(e) => updateFormData('unitTypeId', e.target.value)}
                          className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                          disabled={saving}
                        >
                          <option value="">Select unit type...</option>
                          {unitTypes.map(type => (
                            <option key={type.id} value={type.id}>
                              {type.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Street Address
                        </label>
                        <input
                          type="text"
                          value={formData.streetAddress || viewingPlot?.streetAddress || ''}
                          onChange={(e) => updateFormData('streetAddress', e.target.value)}
                          placeholder="Enter street address..."
                          className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                          disabled={saving}
                        />
                      </div>
                    </div>

                    {/* Third row: Beds, Storeys, Square Footage, Min Sale Price */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Beds
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formData.numberOfBeds || viewingPlot?.numberOfBeds || ''}
                          onChange={(e) => updateFormData('numberOfBeds', parseInt(e.target.value) || undefined)}
                          placeholder="0"
                          className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                          disabled={saving}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Storeys
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={formData.numberOfStoreys || viewingPlot?.numberOfStoreys || ''}
                          onChange={(e) => updateFormData('numberOfStoreys', parseInt(e.target.value) || undefined)}
                          placeholder="1"
                          className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                          disabled={saving}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sq Ft
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={formData.squareFootage || viewingPlot?.squareFootage || ''}
                          onChange={(e) => updateFormData('squareFootage', parseFloat(e.target.value) || undefined)}
                          placeholder="0.0"
                          className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                          disabled={saving}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Min Price (£)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          value={formData.minimumSalePrice || viewingPlot?.minimumSalePrice || ''}
                          onChange={(e) => updateFormData('minimumSalePrice', parseFloat(e.target.value) || undefined)}
                          placeholder="0"
                          className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                          disabled={saving}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Description Field */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description || viewingPlot?.description || ''}
                      onChange={(e) => updateFormData('description', e.target.value)}
                      placeholder="Enter description..."
                      className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors resize-none"
                      rows={3}
                      disabled={saving}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Construction Progress (Dashboard Style) */}
            <div className="flex-1 bg-gray-50">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white">
                <h5 className="text-lg font-bold text-gray-900">Construction Progress</h5>
                {statusMessage && (
                  <div className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                    ✓ {statusMessage}
                  </div>
                )}
              </div>
              
              {viewingPlot?.constructionType?.constructionStages && viewingPlot.constructionType.constructionStages.length > 0 ? (
                <div>
                  {/* Date Column Headers */}
                  <div className="bg-gray-100 border-b border-gray-200 h-10">
                    <div className="grid gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 h-full items-center" style={{ gridTemplateColumns: '4px 90px 1fr 1fr 1fr' }}>
                      <div></div>
                      <div className="text-left">Stage</div>
                      <div className="text-center">Programme</div>
                      <div className="text-center">Planned</div>
                      <div className="text-center">Actual</div>
                    </div>
                  </div>

                  {/* Construction Stages */}
                  <div className="max-h-[60vh] overflow-y-auto">
                    {viewingPlot.constructionType.constructionStages
                      .slice()
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((stage) => {
                        const progress = viewingPlot.constructionProgress?.find(
                          p => p.constructionStageId === stage.id
                        )
                        
                        const draft = stageDrafts[stage.id] ?? {
                          completionPercentage: progress?.completionPercentage ?? 0,
                          recordedAt: '',
                          programmeStartDate: progress?.programmeStartDate ? 
                            new Date(progress.programmeStartDate).toISOString().split('T')[0] : '',
                          programmeEndDate: progress?.programmeEndDate ? 
                            new Date(progress.programmeEndDate).toISOString().split('T')[0] : '',
                          plannedStartDate: progress?.plannedStartDate ? 
                            new Date(progress.plannedStartDate).toISOString().split('T')[0] : '',
                          plannedEndDate: progress?.plannedEndDate ? 
                            new Date(progress.plannedEndDate).toISOString().split('T')[0] : '',
                          actualStartDate: progress?.actualStartDate ? 
                            new Date(progress.actualStartDate).toISOString().split('T')[0] : '',
                          actualEndDate: progress?.actualEndDate ? 
                            new Date(progress.actualEndDate).toISOString().split('T')[0] : '',
                        }

                        const stageKey: StageKey = `${viewingPlot.id}:${stage.id}`

                        return (
                          <div key={stage.id} className="bg-white hover:bg-gray-50/50 transition-colors border-b border-gray-100">
                            <div className="grid gap-2 px-3 py-2.5 text-xs w-full items-center" style={{ gridTemplateColumns: '4px 90px 1fr 1fr 1fr' }}>
                              {/* Stage Color Bar */}
                              <div className="w-1 h-10 rounded-full" style={{ backgroundColor: stage.color || '#3b82f6' }}></div>
                              
                              {/* Stage Column */}
                              <div className="flex flex-col gap-1">
                                <span className="text-gray-900 font-medium text-xs leading-tight truncate">{stage.name.replace(/\s*(Complete|Completion)\s*$/i, '')}</span>
                                <div className="relative w-14">
                                  <input
                                    type="number"
                                    value={draft.completionPercentage || 0}
                                    onChange={(e) => {
                                      let percentage = parseInt(e.target.value) || 0
                                      percentage = Math.max(0, Math.min(100, percentage))
                                      handleCompletionPercentageChange(stage, percentage)
                                    }}
                                    min="0"
                                    max="100"
                                    className="w-full pl-1.5 pr-5 py-1 border border-gray-200 rounded text-xs bg-white text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0"
                                  />
                                  <span className="absolute right-1.5 top-1 text-xs text-gray-400 pointer-events-none">%</span>
                                </div>
                              </div>
                              
                              {/* Programme Column */}
                              <div className="flex flex-col gap-0.5">
                                <input
                                  type="date"
                                  value={draft.programmeStartDate}
                                  onChange={(e) => handleStageDraftChange(stage.id, { programmeStartDate: e.target.value })}
                                  className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs bg-white text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <input
                                  type="date"
                                  value={draft.programmeEndDate}
                                  onChange={(e) => handleStageDraftChange(stage.id, { programmeEndDate: e.target.value })}
                                  className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs bg-white text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>

                              {/* Planned Column */}
                              <div className="flex flex-col gap-0.5">
                                <input
                                  type="date"
                                  value={draft.plannedStartDate}
                                  onChange={(e) => handleStageDraftChange(stage.id, { plannedStartDate: e.target.value })}
                                  className="w-full px-1.5 py-1 border border-blue-200 rounded text-xs bg-blue-50 text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <input
                                  type="date"
                                  value={draft.plannedEndDate}
                                  onChange={(e) => handleStageDraftChange(stage.id, { plannedEndDate: e.target.value })}
                                  className="w-full px-1.5 py-1 border border-blue-200 rounded text-xs bg-blue-50 text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>

                              {/* Actual Column */}
                              <div className="flex flex-col gap-0.5">
                                <input
                                  type="date"
                                  value={draft.actualStartDate}
                                  onChange={(e) => handleStageDraftChange(stage.id, { actualStartDate: e.target.value })}
                                  className="w-full px-1.5 py-1 border border-emerald-200 rounded text-xs bg-emerald-50 text-gray-700 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                />
                                <input
                                  type="date"
                                  value={draft.actualEndDate}
                                  onChange={(e) => handleStageDraftChange(stage.id, { actualEndDate: e.target.value })}
                                  className="w-full px-1.5 py-1 border border-emerald-200 rounded text-xs bg-emerald-50 text-gray-700 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                  
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-500 text-sm text-center">No construction stages configured.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6">
            <h3 className="text-lg font-bold mb-2 text-gray-900">Create Plot Polygon</h3>
            <p className="text-sm text-gray-500 mb-5">
              Polygon with {coordinates.length} points drawn on the map
            </p>

            {/* Mode Selection */}
            <div className="mb-6">
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setMode('new')}
                className={`px-4 py-2.5 rounded-lg font-medium transition-all ${
                  mode === 'new' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                Create New Plot
              </button>
              <button
                onClick={() => setMode('connect')}
                className={`px-4 py-2.5 rounded-lg font-medium transition-all ${
                  mode === 'connect' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={existingPlotsWithoutPolygons.length === 0}
              >
                Connect to Existing Plot ({existingPlotsWithoutPolygons.length})
              </button>
            </div>
          </div>

        {loadingMasterData ? (
          <div className="text-center py-4 text-gray-600">Loading...</div>
        ) : (
          <div className="space-y-4">

            {/* Plot Selection for Connect Mode */}
            {mode === 'connect' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Existing Plot
                </label>
                <select
                  value={formData.existingPlotId || ''}
                  onChange={(e) => updateFormData('existingPlotId', e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                  disabled={saving}
                >
                  <option value="">Choose a plot...</option>
                  {existingPlotsWithoutPolygons.map(plot => (
                    <option key={plot.id} value={plot.id}>
                      {plot.name} {plot.streetAddress ? `(${plot.streetAddress})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Plot Name for New Mode */}
            {mode === 'new' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plot Name *
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  placeholder="Enter plot name..."
                  className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                  disabled={saving}
                />
              </div>
            )}

            {/* Extended Fields */}
            <div className="space-y-4">
              {/* First row: Homebuilder and Construction Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Homebuilder
                  </label>
                  <select
                    value={formData.homebuilderId || ''}
                    onChange={(e) => updateFormData('homebuilderId', e.target.value)}
                    className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    disabled={saving}
                  >
                    <option value="">Select homebuilder...</option>
                    {homebuilders.map(builder => (
                      <option key={builder.id} value={builder.id}>
                        {builder.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Construction Type
                  </label>
                  <select
                    value={formData.constructionTypeId || ''}
                    onChange={(e) => updateFormData('constructionTypeId', e.target.value)}
                    className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    disabled={saving}
                  >
                    <option value="">Select construction type...</option>
                    {constructionTypes.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Second row: Unit Type and Street Address */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit Type
                  </label>
                  <select
                    value={formData.unitTypeId || ''}
                    onChange={(e) => updateFormData('unitTypeId', e.target.value)}
                    className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    disabled={saving}
                  >
                    <option value="">Select unit type...</option>
                    {unitTypes.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={formData.streetAddress || ''}
                    onChange={(e) => updateFormData('streetAddress', e.target.value)}
                    placeholder="Enter street address..."
                    className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Third row: Beds, Storeys, Square Footage, Min Sale Price */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Beds
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.numberOfBeds || ''}
                    onChange={(e) => updateFormData('numberOfBeds', parseInt(e.target.value) || undefined)}
                    placeholder="0"
                    className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Storeys
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.numberOfStoreys || ''}
                    onChange={(e) => updateFormData('numberOfStoreys', parseInt(e.target.value) || undefined)}
                    placeholder="1"
                    className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sq Ft
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.squareFootage || ''}
                    onChange={(e) => updateFormData('squareFootage', parseFloat(e.target.value) || undefined)}
                    placeholder="0.0"
                    className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Price (£)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={formData.minimumSalePrice || ''}
                    onChange={(e) => updateFormData('minimumSalePrice', parseFloat(e.target.value) || undefined)}
                    placeholder="0"
                    className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            {/* Description Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => updateFormData('description', e.target.value)}
                placeholder="Enter description..."
                className="w-full p-2.5 border border-gray-200 rounded-md bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors resize-none"
                rows={3}
                disabled={saving}
              />
            </div>
          </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
          {mode === 'view' ? (
            <>
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-all hover:shadow-sm"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 font-semibold transition-all shadow-sm hover:shadow-md"
                disabled={saving || !formData.name?.trim()}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-all hover:shadow-sm"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 font-semibold transition-all shadow-sm hover:shadow-md"
                disabled={
                  saving || 
                  (mode === 'new' && !formData.name?.trim()) ||
                  (mode === 'connect' && !formData.existingPlotId)
                }
              >
                {saving ? 'Saving...' : mode === 'new' ? 'Create Plot' : 'Connect Polygon'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
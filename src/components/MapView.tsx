'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { MouseEvent as ReactMouseEvent } from 'react'
import EnhancedPlotDialog, { PlotCreationData } from './EnhancedPlotDialog'
import MapPlotCard from './MapPlotCard'
import { Plot } from '@/types/plot'

const shadeFromHex = (hex: string, alpha = 0.2) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

let IMAGE_WIDTH = 1200
let IMAGE_HEIGHT = 800

const MAP_SLUG = 'welbourne'

const clampPosition = (x: number, y: number, targetZoom: number, container: DOMRect) => {
  const padding = 24
  const containerWidth = container.width
  const containerHeight = container.height
  const mapWidth = IMAGE_WIDTH * targetZoom
  const mapHeight = IMAGE_HEIGHT * targetZoom

  let minX: number
  let maxX: number
  if (mapWidth <= containerWidth) {
    minX = maxX = (containerWidth - mapWidth) / 2
  } else {
    minX = containerWidth - mapWidth - padding
    maxX = padding
  }

  let minY: number
  let maxY: number
  if (mapHeight <= containerHeight) {
    minY = maxY = (containerHeight - mapHeight) / 2
  } else {
    minY = containerHeight - mapHeight - padding
    maxY = padding
  }

  const clampedX = Math.min(maxX, Math.max(minX, x))
  const clampedY = Math.min(maxY, Math.max(minY, y))
  return { x: clampedX, y: clampedY }
}


const parseDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

const normaliseHomebuilder = (homebuilder: any) => {
  if (!homebuilder) return null
  return {
    ...homebuilder,
    createdAt: parseDate(homebuilder.createdAt) ?? new Date(),
    updatedAt: parseDate(homebuilder.updatedAt) ?? new Date(),
  }
}

const normaliseConstructionStage = (stage: any) => ({
  ...stage,
  createdAt: parseDate(stage?.createdAt) ?? new Date(),
  updatedAt: parseDate(stage?.updatedAt) ?? new Date(),
})

const normaliseConstructionType = (type: any) => {
  if (!type) return null
  return {
    ...type,
    createdAt: parseDate(type.createdAt) ?? new Date(),
    updatedAt: parseDate(type.updatedAt) ?? new Date(),
    constructionStages: (type.constructionStages ?? []).map(normaliseConstructionStage),
  }
}

const normaliseUnitType = (unitType: any) => {
  if (!unitType) return null
  return {
    ...unitType,
    createdAt: parseDate(unitType.createdAt) ?? new Date(),
    updatedAt: parseDate(unitType.updatedAt) ?? new Date(),
  }
}

const normalisePlannedDeliveryDate = (entry: any) => ({
  ...entry,
  plannedDate: parseDate(entry?.plannedDate) ?? null,
  createdAt: parseDate(entry?.createdAt) ?? new Date(),
})

const normaliseSalesUpdate = (update: any) => ({
  ...update,
  programmedDeliveryDate: parseDate(update?.programmedDeliveryDate) ?? null,
  actualDeliveryDate: parseDate(update?.actualDeliveryDate) ?? null,
  createdAt: parseDate(update?.createdAt) ?? new Date(),
  updatedAt: parseDate(update?.updatedAt) ?? new Date(),
  plannedDeliveryDates: (update?.plannedDeliveryDates ?? []).map(normalisePlannedDeliveryDate),
})

const normaliseConstructionProgressRecord = (record: any) => ({
  ...record,
  completionPercentage: record?.completionPercentage ?? 0,
  recordedAt: parseDate(record?.recordedAt) ?? new Date(),
  createdAt: parseDate(record?.createdAt) ?? new Date(),
  updatedAt: parseDate(record?.updatedAt) ?? new Date(),
  constructionStage: record?.constructionStage
    ? normaliseConstructionStage(record.constructionStage)
    : undefined,
})

const normalisePlotRecord = (plot: any) => ({
  ...plot,
  createdAt: parseDate(plot?.createdAt) ?? new Date(),
  updatedAt: parseDate(plot?.updatedAt) ?? new Date(),
  startDate: parseDate(plot?.startDate) ?? null,
  endDate: parseDate(plot?.endDate) ?? null,
  coordinates: plot?.coordinates ?? null,
  homebuilder: normaliseHomebuilder(plot?.homebuilder),
  constructionType: normaliseConstructionType(plot?.constructionType),
  unitType: normaliseUnitType(plot?.unitType),
  salesUpdates: (plot?.salesUpdates ?? []).map(normaliseSalesUpdate),
  constructionProgress: (plot?.constructionProgress ?? []).map(normaliseConstructionProgressRecord),
})
interface PlotPolygon {
  id: string
  plotId: string
  plotName: string
  polygonIndex: number
  coordinates: [number, number][]
  centroid: [number, number]
  status: string
  progress: number
}

interface MapMetadata {
  id: string
  name: string
  slug: string
  imagePath: string
  naturalWidth?: number | null
  naturalHeight?: number | null
}

interface MapApiResponse {
  map: MapMetadata & {
    createdAt: string
    updatedAt: string
  }
  plots: Array<Omit<Plot, 'createdAt' | 'updatedAt'> & {
    createdAt: string
    updatedAt: string
    coordinates?: [number, number][] | null
  }>
  topojson: unknown
  geojson: {
    type: 'FeatureCollection'
    features: Array<{
      type: 'Feature'
      properties: {
        id: string
        name: string
        status: string
        progress: number
      }
      geometry: {
        type: 'Polygon'
        coordinates: [number, number][][]
      }
    }>
  }
}

interface NameDialogProps {
  show: boolean
  onClose: () => void
  onSave: (name: string) => void
  coordinates: [number, number][]
  saving: boolean
}

function NameDialog({ show, onClose, onSave, coordinates, saving }: NameDialogProps) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (!show) {
      setName('')
    }
  }, [show])

  if (!show) return null

  const handleSave = () => {
    if (!name.trim()) return
    onSave(name.trim())
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Name Your Plot</h3>
        <p className="text-sm text-gray-600 mb-4">
          Polygon with {coordinates.length} points
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter plot name..."
          className="w-full p-2 border border-gray-300 rounded mb-4 text-gray-900 placeholder-gray-400"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          disabled={saving}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
            disabled={!name.trim() || saving}
          >
            {saving ? 'Saving...' : 'Save Plot'}
          </button>
        </div>
      </div>
    </div>
  )
}

const getPlotColor = (plot: Plot): string => {
  // If no construction progress, show grey (not started)
  if (!plot.constructionProgress || plot.constructionProgress.length === 0) {
    return '#6b7280' // grey
  }

  // Find the most recent stage with actual progress (started or completed)
  let currentStage = null
  let lastCompletedStage = null

  // Sort stages by their typical order (you may need to adjust this based on your stage ordering)
  const sortedProgress = [...plot.constructionProgress].sort((a, b) => {
    // Assuming stages have an order field or we can determine order by stage name/id
    // For now, we'll use the stage id as a simple ordering mechanism
    return a.constructionStageId.localeCompare(b.constructionStageId)
  })

  for (const progress of sortedProgress) {
    // If stage has been started (has actual start date)
    if (progress.actualStartDate) {
      currentStage = progress
      
      // If stage is also completed (has actual end date)
      if (progress.actualEndDate) {
        lastCompletedStage = progress
      }
    }
  }

  // Use current in-progress stage, or fall back to last completed stage
  const stageToUse = currentStage || lastCompletedStage

  if (!stageToUse || !stageToUse.constructionStage) {
    return '#6b7280' // grey if no stage info
  }

  // Return the stage color
  return stageToUse.constructionStage.color || '#6b7280'
}

const getPlotProgress = (plot: Plot): number => {
  // If no construction progress, return 0
  if (!plot.constructionProgress || plot.constructionProgress.length === 0) {
    return 0
  }

  // Find the most recent stage with actual progress (started or completed)
  let currentStage = null
  let lastCompletedStage = null

  // Sort stages by their typical order
  const sortedProgress = [...plot.constructionProgress].sort((a, b) => {
    return a.constructionStageId.localeCompare(b.constructionStageId)
  })

  for (const progress of sortedProgress) {
    // If stage has been started (has actual start date)
    if (progress.actualStartDate) {
      currentStage = progress
      
      // If stage is also completed (has actual end date)
      if (progress.actualEndDate) {
        lastCompletedStage = progress
      }
    }
  }

  // Use current in-progress stage, or fall back to last completed stage
  const stageToUse = currentStage || lastCompletedStage

  if (!stageToUse) {
    return 0
  }

  return stageToUse.completionPercentage || 0
}

const getPlotStatus = (plot: Plot): string => {
  // If no construction progress, it hasn't started
  if (!plot.constructionProgress || plot.constructionProgress.length === 0) {
    return 'NOT STARTED'
  }

  // Check if any stage has started
  const hasStarted = plot.constructionProgress.some(progress => progress.actualStartDate)
  if (!hasStarted) {
    return 'NOT STARTED'
  }

  // Check if all stages are completed
  const allCompleted = plot.constructionProgress.every(progress => 
    progress.actualEndDate || (progress.completionPercentage === 100)
  )
  if (allCompleted) {
    return 'COMPLETED'
  }

  return 'IN PROGRESS'
}

const getCurrentStageName = (plot: Plot): string => {
  // If no construction progress, return "Not Started"
  if (!plot.constructionProgress || plot.constructionProgress.length === 0) {
    return 'Not Started'
  }

  // Find the most recent stage with actual progress (started or completed)
  let currentStage = null
  let lastCompletedStage = null

  // Sort stages by their typical order
  const sortedProgress = [...plot.constructionProgress].sort((a, b) => {
    return a.constructionStageId.localeCompare(b.constructionStageId)
  })

  for (const progress of sortedProgress) {
    // If stage has been started (has actual start date)
    if (progress.actualStartDate) {
      currentStage = progress
      
      // If stage is also completed (has actual end date)
      if (progress.actualEndDate) {
        lastCompletedStage = progress
      }
    }
  }

  // Use current in-progress stage, or fall back to last completed stage
  const stageToUse = currentStage || lastCompletedStage

  if (!stageToUse || !stageToUse.constructionStage) {
    return 'Not Started'
  }

  // Return the stage name, removing "Complete" or "Completion" suffix
  return stageToUse.constructionStage.name.replace(/\s*(Complete|Completion)\s*$/i, '')
}

const calculatePolygonCentroid = (coordinates: [number, number][]): [number, number] => {
  let x = 0
  let y = 0
  coordinates.forEach(([px, py]) => {
    x += px
    y += py
  })
  return [x / coordinates.length, y / coordinates.length]
}

export default function MapView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const containerRef = useRef<HTMLDivElement>(null)
  const imageLayerRef = useRef<HTMLDivElement>(null)
  const currentViewportRef = useRef({ zoom: 1, position: { x: 0, y: 0 } })

  // Viewport persistence functions
  const saveViewportState = useCallback((zoom: number, position: { x: number, y: number }) => {
    const viewportState = { zoom, position, timestamp: Date.now() }
    localStorage.setItem(`mapViewport_${MAP_SLUG}`, JSON.stringify(viewportState))
  }, [])

  const loadViewportState = useCallback(() => {
    try {
      const stored = localStorage.getItem(`mapViewport_${MAP_SLUG}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Only use stored state if it's less than 1 hour old
        if (Date.now() - parsed.timestamp < 3600000) {
          return { zoom: parsed.zoom, position: parsed.position }
        }
      }
    } catch (error) {
      console.warn('Failed to load viewport state:', error)
    }
    return null
  }, [])

  const [mapMeta, setMapMeta] = useState<MapMetadata | null>(null)
  const [plots, setPlots] = useState<Plot[]>([])
  const [plotPolygons, setPlotPolygons] = useState<PlotPolygon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [selectedPlot, setSelectedPlot] = useState<Plot | null>(null)

  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  // Enhanced setters that persist to localStorage
  const setPositionWithPersistence = useCallback((newPosition: { x: number, y: number }) => {
    setPosition(newPosition)
    currentViewportRef.current.position = newPosition
    saveViewportState(currentViewportRef.current.zoom, newPosition)
  }, [saveViewportState])

  const setZoomWithPersistence = useCallback((newZoom: number) => {
    setZoom(newZoom)
    currentViewportRef.current.zoom = newZoom
    saveViewportState(newZoom, currentViewportRef.current.position)
  }, [saveViewportState])

  const [minZoom, setMinZoom] = useState(0.5)

  // Sync ref with state changes
  useEffect(() => {
    currentViewportRef.current.zoom = zoom
  }, [zoom])

  useEffect(() => {
    currentViewportRef.current.position = position
  }, [position])

  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const [isEditMode, setIsEditMode] = useState(false)
  const [currentPolygon, setCurrentPolygon] = useState<[number, number][]>([])
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [isSavingPolygon, setIsSavingPolygon] = useState(false)
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null)
  const [existingPlotsWithoutPolygons, setExistingPlotsWithoutPolygons] = useState<Plot[]>([])

  const loadMapData = useCallback(async (preserveViewport = false) => {
    // Store current viewport before loading
    const currentViewport = preserveViewport ? { zoom: currentViewportRef.current.zoom, position: currentViewportRef.current.position } : null
    
    setError(null)
    setLoading(true)
    if (!preserveViewport) {
      setImageLoaded(false)
    }

    try {
      const [mapResponse, plotsResponse] = await Promise.all([
        fetch(`/api/maps/${MAP_SLUG}`),
        fetch(`/api/plots?map=${MAP_SLUG}`)
      ])
      
      if (!mapResponse.ok) throw new Error('Failed to load map data')
      if (!plotsResponse.ok) throw new Error('Failed to load plots data')

      const mapData: MapApiResponse = await mapResponse.json()
      const allPlotsData = await plotsResponse.json()

      setMapMeta(mapData.map)
      const normalisedPlots = (allPlotsData as any[]).map(normalisePlotRecord) as Plot[]
      setPlots(normalisedPlots)
      
      // Find plots without polygon coordinates
      const plotsWithoutPolygons = normalisedPlots.filter((plot) => !plot.coordinates || plot.coordinates.length === 0)
      setExistingPlotsWithoutPolygons(plotsWithoutPolygons)

      const polygons = mapData.geojson.features.map((feature: any, index: number) => {
        const coords = feature.geometry.coordinates[0] as [number, number][]
        return {
          id: feature.properties.id,
          plotId: feature.properties.id,
          plotName: feature.properties.name,
          polygonIndex: index,
          coordinates: coords,
          centroid: calculatePolygonCentroid(coords),
          status: feature.properties.status,
          progress: feature.properties.progress,
        }
      })
      setPlotPolygons(polygons)

      const imagePath = mapData.map.imagePath.startsWith('/')
        ? mapData.map.imagePath
        : `/${mapData.map.imagePath}`

      if (!preserveViewport) {
        await new Promise<void>((resolve, reject) => {
          const img = new Image()
          img.onload = () => {
            IMAGE_WIDTH = mapData.map.naturalWidth ?? img.naturalWidth
            IMAGE_HEIGHT = mapData.map.naturalHeight ?? img.naturalHeight
            setImageLoaded(true)
            resolve()
          }
          img.onerror = () => reject(new Error('Failed to load map image'))
          img.src = imagePath
        })
      } else {
        // When preserving viewport, restore the saved state
        if (currentViewport) {
          setZoom(currentViewport.zoom)
          setPosition(currentViewport.position)
        }
      }
    } catch (err) {
      console.error('Error loading map data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load map data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMapData()
  }, [loadMapData])

  // Set URL parameter to indicate map view
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (params.get('view') !== 'map') {
      params.set('view', 'map')
      router.replace(`?${params.toString()}`, { scroll: false })
    }
  }, [router, searchParams])

  const initializeMap = useCallback((forceReset = false) => {
    if (!containerRef.current || IMAGE_WIDTH === 0 || IMAGE_HEIGHT === 0) return

    const container = containerRef.current
    const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect()

    if (containerWidth === 0 || containerHeight === 0) return

    const scaleX = containerWidth / IMAGE_WIDTH
    const scaleY = containerHeight / IMAGE_HEIGHT
    const baseZoom = Math.min(scaleX, scaleY) * 0.9
    const calculatedInitialZoom = baseZoom * 2.54 // Make 254% the new 100%

    setMinZoom(calculatedInitialZoom) // Set minimum zoom to the new 100%

    // Try to restore saved viewport state
    const savedState = !forceReset ? loadViewportState() : null
    if (savedState) {
      // Validate that saved zoom is reasonable
      const validZoom = Math.max(calculatedInitialZoom, Math.min(savedState.zoom, 4))
      setZoom(validZoom)
      
      // Validate that saved position is reasonable
      const bounded = clampPosition(savedState.position.x, savedState.position.y, validZoom, container.getBoundingClientRect())
      setPosition(bounded)
    } else {
      // Use default values
      setZoom(calculatedInitialZoom)
      const initialX = (containerWidth - IMAGE_WIDTH * calculatedInitialZoom) / 2
      const initialY = (containerHeight - IMAGE_HEIGHT * calculatedInitialZoom) / 2
      setPosition({ x: initialX, y: initialY })
    }
  }, [loadViewportState])

  // Separate resize handler that doesn't take parameters
  const handleResize = useCallback(() => {
    initializeMap(false)
  }, [initializeMap])

  useEffect(() => {
    if (!imageLoaded) return

    const timer = setTimeout(() => {
      initializeMap(false)
    }, 100)

    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
    }
  }, [handleResize, imageLoaded, initializeMap])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault()
      if (!containerRef.current || isEditMode) return

      const zoomFactor = e.deltaY < 0 ? 1.2 : 1 / 1.2
      const newZoom = Math.max(minZoom, Math.min(zoom * zoomFactor, 4))

      if (newZoom === zoom) return

      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const newX = mouseX - (mouseX - position.x) * (newZoom / zoom)
      const newY = mouseY - (mouseY - position.y) * (newZoom / zoom)

      setZoomWithPersistence(newZoom)
      setPositionWithPersistence({ x: newX, y: newY })
    }

    container.addEventListener('wheel', wheelHandler, { passive: false })
    return () => {
      container.removeEventListener('wheel', wheelHandler)
    }
  }, [zoom, position, minZoom, isEditMode, setPositionWithPersistence, setZoomWithPersistence])

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (isEditMode) return
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    })
  }

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (isEditMode) return
    if (!isDragging || !containerRef.current) return
    e.preventDefault()

    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y

    const containerRect = containerRef.current.getBoundingClientRect()
    const bounded = clampPosition(newX, newY, zoom, containerRect)
    setPositionWithPersistence(bounded)
  }
  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const toggleEditMode = () => {
    if (isEditMode) {
      setCurrentPolygon([])
      setShowNameDialog(false)
    }
    setHoverPoint(null)
    setIsEditMode((prev) => !prev)
  }

  const cancelEdit = () => {
    setCurrentPolygon([])
    setShowNameDialog(false)
    setHoverPoint(null)
    setIsEditMode(false)
  }

  const handleMapClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isEditMode || !imageLayerRef.current) return

    const rect = imageLayerRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom

    if (x < 0 || y < 0 || x > IMAGE_WIDTH || y > IMAGE_HEIGHT) return

    setCurrentPolygon((prev) => [...prev, [x, y]])
    setHoverPoint([x, y])
  }

  const handleMapMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isEditMode || !imageLayerRef.current) return

    const rect = imageLayerRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom

    if (x < 0 || y < 0 || x > IMAGE_WIDTH || y > IMAGE_HEIGHT) {
      setHoverPoint(null)
      return
    }

    // Only track hover point if we're actively drawing (have at least one point)
    if (currentPolygon.length > 0) {
      setHoverPoint([x, y])
    }
  }

  const handleMapMouseLeave = () => {
    if (isEditMode) {
      setHoverPoint(null)
    }
  }

  const undoLastPoint = () => {
    setCurrentPolygon((prev) => {
      const next = prev.slice(0, -1)
      if (next.length === 0) {
        setHoverPoint(null)
      }
      return next
    })
  }

  const finishPolygon = () => {
    if (currentPolygon.length < 3) return
    setShowNameDialog(true)
  }

  const handleMapRightClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isEditMode) return
    e.preventDefault() // Prevent context menu from showing
    
    // If we have at least 3 points, finish the polygon
    if (currentPolygon.length >= 3) {
      finishPolygon()
    }
  }

  const savePolygon = async (plotData: PlotCreationData) => {
    if (currentPolygon.length < 3) return
    setIsSavingPolygon(true)
    try {
      const response = await fetch('/api/plots/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...plotData,
          coordinates: currentPolygon,
          mapSlug: MAP_SLUG,
        }),
      })
      if (!response.ok) throw new Error('Failed to save plot polygon')

      await loadMapData(true) // Preserve viewport when saving
      setCurrentPolygon([])
      setShowNameDialog(false)
      setHoverPoint(null)
      setIsEditMode(false)
    } catch (err) {
      console.error('Error saving polygon:', err)
      alert('Failed to save polygon. Please try again.')
    } finally {
      setIsSavingPolygon(false)
    }
  }


  useEffect(() => {
    if (!isEditMode) {
      setHoverPoint(null)
    }
  }, [isEditMode])

  useEffect(() => {
    if (!selectedPlot) return
    const fresh = plots.find((plot) => plot.id === selectedPlot.id)
    if (fresh && fresh !== selectedPlot) {
      setSelectedPlot(fresh)
    }
  }, [plots, selectedPlot])

  const previewPolylinePoints = hoverPoint && currentPolygon.length > 0 ? [...currentPolygon, hoverPoint] : currentPolygon

  if (loading || !imageLoaded) {
    return <div className="flex items-center justify-center h-full">Loading construction site...</div>
  }

  if (error) {
    return <div className="flex items-center justify-center h-full text-red-500">{error}</div>
  }

  const containerCursor = isEditMode ? 'pointer' : isDragging ? 'grabbing' : 'grab'

  return (
    <div className="relative w-full h-full bg-gray-100 overflow-hidden">
      <div className="absolute top-4 left-4 z-20 flex gap-2">
        <button
          onClick={toggleEditMode}
          className={`px-4 py-2 rounded shadow text-sm font-medium transition-colors ${
            isEditMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-white text-gray-800 hover:bg-gray-100'
          }`}
        >
          {isEditMode ? 'Exit Edit Mode' : 'Edit Plots'}
        </button>
        {isEditMode && (
          <>
            <button
              onClick={undoLastPoint}
              className="px-3 py-2 rounded shadow text-sm font-medium bg-white text-gray-800 hover:bg-gray-100"
              disabled={currentPolygon.length === 0}
            >
              Undo Point
            </button>
            <button
              onClick={finishPolygon}
              className="px-3 py-2 rounded shadow text-sm font-medium bg-green-600 text-white hover:bg-green-500 disabled:bg-green-300"
              disabled={currentPolygon.length < 3}
            >
              Finish Polygon
            </button>
            <button
              onClick={cancelEdit}
              className="px-3 py-2 rounded shadow text-sm font-medium bg-white text-gray-800 hover:bg-gray-100"
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {isEditMode && (
        <div className="absolute top-4 right-4 z-20 bg-white bg-opacity-90 text-gray-700 text-sm px-4 py-3 rounded shadow max-w-sm">
          <p className="font-semibold mb-1">Drawing mode</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Click on the map to add vertices.</li>
            <li>Right-click to complete the shape (3+ points).</li>
            <li>Use the Undo button to remove the last point.</li>
            <li>Use Finish Polygon button or right-click when ready.</li>
          </ul>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: containerCursor }}
      >
        <div
          ref={imageLayerRef}
          onClick={handleMapClick}
          onContextMenu={handleMapRightClick}
          onMouseMove={handleMapMouseMove}
          onMouseLeave={handleMapMouseLeave}
          style={{
            width: IMAGE_WIDTH,
            height: IMAGE_HEIGHT,
            backgroundImage: mapMeta ? `url('${mapMeta.imagePath}')` : 'none',
            backgroundSize: 'cover',
            cursor: isEditMode ? 'pointer' : 'default',
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          {plotPolygons.map((polygon) => {
            const plot = plots.find((p) => p.id === polygon.plotId)
            const statusColor = plot ? getPlotColor(plot) : '#6b7280'
            const pathData = `M ${polygon.coordinates.map(([x, y]) => `${x},${y}`).join(' L ')} Z`

            return (
              <svg
                key={`${polygon.plotId}-${polygon.polygonIndex}`}
                className="absolute"
                style={{
                  left: 0,
                  top: 0,
                  width: IMAGE_WIDTH,
                  height: IMAGE_HEIGHT,
                  zIndex: 5,
                }}
              >
                <path
                  d={pathData}
                  fill={statusColor}
                  fillOpacity={0.2}
                  stroke={statusColor}
                  strokeWidth={1}
                  className="transition-all duration-200 cursor-pointer hover:fill-opacity-40"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (plot) setSelectedPlot(plot)
                  }}
                />
              </svg>
            )
          })}

          {plots.map((plot) => {
            const plotPolys = plotPolygons.filter((p) => p.plotId === plot.id)
            if (plotPolys.length === 0) return null

            const avgCentroid: [number, number] = [
              plotPolys.reduce((sum, p) => sum + p.centroid[0], 0) / plotPolys.length,
              plotPolys.reduce((sum, p) => sum + p.centroid[1], 0) / plotPolys.length,
            ]
            const plotColor = getPlotColor(plot)
            const plotProgress = getPlotProgress(plot)
            const currentStage = getCurrentStageName(plot)
            
            return (
              <MapPlotCard
                key={`label-${plot.id}`}
                plot={plot}
                position={avgCentroid}
                plotColor={plotColor}
                plotProgress={plotProgress}
                currentStage={currentStage}
                onClick={() => setSelectedPlot(plot)}
              />
            )
          })}

          {isEditMode && currentPolygon.length > 0 && (
            <svg
              className="absolute"
              style={{
                left: 0,
                top: 0,
                width: IMAGE_WIDTH,
                height: IMAGE_HEIGHT,
                zIndex: 10,
              }}
            >
              {currentPolygon.length >= 3 && (
                <polygon
                  points={currentPolygon.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="rgba(59, 130, 246, 0.2)"
                />
              )}
              <polyline
                points={previewPolylinePoints.map(([x, y]) => `${x},${y}`).join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1.25"
                strokeDasharray="4,4"
              />
              {currentPolygon.map(([x, y], index) => (
                <circle
                  key={`current-point-${index}`}
                  cx={x}
                  cy={y}
                  r="3"
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth="1.25"
                />
              ))}
              {currentPolygon.length >= 3 && (
                <line
                  x1={currentPolygon[currentPolygon.length - 1][0]}
                  y1={currentPolygon[currentPolygon.length - 1][1]}
                  x2={currentPolygon[0][0]}
                  y2={currentPolygon[0][1]}
                  stroke="#3b82f6"
                  strokeWidth="1.25"
                  strokeDasharray="4,4"
                  opacity="0.5"
                />
              )}
            </svg>
          )}
        </div>
      </div>

      <div className="absolute bottom-4 right-4 flex flex-col space-y-1 z-10">
        <button
          onClick={() => {
            if (!containerRef.current || isEditMode) return
            const newZoom = Math.min(zoom * 1.5, 4)
            const rect = containerRef.current.getBoundingClientRect()
            const centerX = rect.width / 2
            const centerY = rect.height / 2
            const newX = centerX - (centerX - position.x) * (newZoom / zoom)
            const newY = centerY - (centerY - position.y) * (newZoom / zoom)
            setZoomWithPersistence(newZoom)
            setPositionWithPersistence({ x: newX, y: newY })
          }}
          className="w-10 h-10 bg-white rounded shadow border flex items-center justify-center text-lg font-bold hover:bg-gray-50 transition-colors text-gray-800"
          title="Zoom In"
        >
          <span className="select-none">+</span>
        </button>
        <div className="w-10 h-10 bg-white rounded shadow border flex items-center justify-center text-xs font-medium text-gray-700">
          {minZoom > 0 ? `${Math.round((zoom / minZoom) * 100)}%` : '100%'}
        </div>
        <button
          onClick={() => {
            if (isEditMode) return
            const newZoom = Math.max(zoom / 1.5, minZoom)
            if (newZoom <= minZoom) {
              initializeMap()
            } else {
              if (!containerRef.current) return
              const rect = containerRef.current.getBoundingClientRect()
              const centerX = rect.width / 2
              const centerY = rect.height / 2
              const newX = centerX - (centerX - position.x) * (newZoom / zoom)
              const newY = centerY - (centerY - position.y) * (newZoom / zoom)
              setZoomWithPersistence(newZoom)
              setPositionWithPersistence({ x: newX, y: newY })
            }
          }}
          className="w-10 h-10 bg-white rounded shadow border flex items-center justify-center text-lg font-bold hover:bg-gray-50 transition-colors text-gray-800"
          title="Zoom Out"
        >
          <span className="select-none">-</span>
        </button>
        <button
          onClick={() => {
            initializeMap()
            setHoverPoint(null)
          }}
          className="w-10 h-10 bg-white rounded shadow border flex items-center justify-center text-base hover:bg-gray-50 transition-colors text-gray-800"
          title="Reset View"
        >
          <span className="select-none">Reset</span>
        </button>
      </div>

      <EnhancedPlotDialog
        show={showNameDialog}
        onClose={() => {
          setShowNameDialog(false)
          setCurrentPolygon([])
          setHoverPoint(null)
        }}
        onSave={savePolygon}
        coordinates={currentPolygon}
        saving={isSavingPolygon}
        existingPlotsWithoutPolygons={existingPlotsWithoutPolygons}
      />

      {selectedPlot && (
        <EnhancedPlotDialog
          show={true}
          onClose={() => setSelectedPlot(null)}
          onSave={async (plotData, plotId) => {
            if (!plotId) return
            try {
              const response = await fetch(`/api/plots/${plotId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(plotData)
              })
              if (!response.ok) throw new Error('Failed to update plot')
              await loadMapData(true) // Reload data while preserving viewport
              setSelectedPlot(null)
            } catch (err) {
              console.error('Error updating plot:', err)
              alert('Failed to update plot. Please try again.')
            }
          }}
          coordinates={[]}
          saving={false}
          existingPlotsWithoutPolygons={[]}
          viewingPlot={selectedPlot}
        />
      )}
    </div>
  )
}














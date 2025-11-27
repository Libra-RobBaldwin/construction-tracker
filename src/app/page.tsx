'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MapView from '@/components/MapView'
import DashboardViewMatrix from '@/components/DashboardViewMatrix'
import Navigation from '@/components/Navigation'
import PasswordGate from '@/components/PasswordGate'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentView, setCurrentView] = useState<'map' | 'dashboard'>('map')

  // Initialize view from URL parameter
  useEffect(() => {
    const viewParam = searchParams.get('view')
    if (viewParam === 'dashboard' || viewParam === 'map') {
      setCurrentView(viewParam)
    }
  }, [searchParams])

  // Update URL when view changes
  const handleViewChange = (view: 'map' | 'dashboard') => {
    setCurrentView(view)
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', view)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <PasswordGate>
      <main className="min-h-screen bg-gray-50">
        <Navigation currentView={currentView} onViewChange={handleViewChange} />
        
        {currentView === 'map' && (
          <div className="map-container h-[calc(100vh-80px)]">
            <MapView />
          </div>
        )}
        
        {currentView === 'dashboard' && (
          <DashboardViewMatrix />
        )}
      </main>
    </PasswordGate>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}

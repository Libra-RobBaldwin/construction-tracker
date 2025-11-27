'use client'

const AUTH_KEY = 'construction_tracker_auth'

interface NavigationProps {
  currentView: 'map' | 'dashboard'
  onViewChange: (view: 'map' | 'dashboard') => void
}

export default function Navigation({ currentView, onViewChange }: NavigationProps) {
  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_KEY)
    window.location.reload()
  }

  return (
    <nav className="bg-white text-gray-800 p-4 shadow-lg border-b border-gray-200 sticky top-0 z-50 w-full">
      <div className="mx-6 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-gray-600" style={{ fontFamily: 'Times New Roman, serif' }}>WELBORNE</div>
          <h1 className="text-xl font-bold text-gray-900">
            {currentView === 'map' ? 'Dashwood Map' : 'Dashwood Dashboard'}
          </h1>
        </div>
        
        <div className="flex space-x-4">
          <button
            onClick={() => onViewChange('map')}
            className={`px-4 py-2 rounded transition-colors ${
              currentView === 'map'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            Map View
          </button>
          
          <button
            onClick={() => onViewChange('dashboard')}
            className={`px-4 py-2 rounded transition-colors ${
              currentView === 'dashboard'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            Dashboard
          </button>
          
          <button
            onClick={() => window.location.reload()}
            className="p-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            title="Refresh page"
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              />
            </svg>
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded bg-gray-100 hover:bg-red-100 text-gray-700 hover:text-red-600 transition-colors"
            title="Log out"
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" 
              />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  )
}

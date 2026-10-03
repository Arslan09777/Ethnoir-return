import React from 'react';

interface NavbarProps {
  activeTab: 'customer' | 'track' | 'admin' | 'settings';
  setActiveTab: (tab: 'customer' | 'track' | 'admin' | 'settings') => void;
  isAdminLoggedIn: boolean;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isAdminLoggedIn,
  onLogout
}) => {
  const isAdminView = activeTab === 'admin' || activeTab === 'settings';

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-colors duration-200 border-b ${
        isAdminView
          ? 'bg-[#111111] text-[#FFFFFF] border-[#2A2A2A]'
          : 'bg-[#FFFFFF] text-[#111111] border-[#E6E6E6]'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Wordmark */}
          <div
            className="cursor-pointer group flex flex-col items-start"
            onClick={() => {
              if (isAdminView) {
                setActiveTab('admin');
              } else {
                setActiveTab('customer');
                window.location.hash = '';
              }
            }}
          >
            <span
              className={`font-serif text-2xl sm:text-3xl font-bold tracking-[0.25em] uppercase transition-opacity ${
                isAdminView ? 'text-white' : 'text-[#111111]'
              }`}
            >
              ETHNOIR
            </span>
            <span
              className={`text-[9px] tracking-[0.3em] uppercase font-sans mt-0.5 ${
                isAdminView ? 'text-neutral-400' : 'text-[#5F5F5F]'
              }`}
            >
              {isAdminView ? 'Management Console' : 'Returns & Replacements'}
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-1 sm:space-x-6">
            {!isAdminView ? (
              // Customer-Facing Navigation (No Admin link, no diagnostics icon)
              <>
                <button
                  onClick={() => {
                    setActiveTab('customer');
                    window.history.pushState(null, '', '/');
                  }}
                  className={`text-xs uppercase tracking-[0.14em] font-medium py-2 px-1 transition-all border-b-2 ${
                    activeTab === 'customer'
                      ? 'border-[#111111] text-[#111111] font-semibold'
                      : 'border-transparent text-[#5F5F5F] hover:text-[#111111]'
                  }`}
                >
                  Request Return
                </button>

                <button
                  onClick={() => {
                    setActiveTab('track');
                    window.history.pushState(null, '', '/track');
                  }}
                  className={`text-xs uppercase tracking-[0.14em] font-medium py-2 px-1 transition-all border-b-2 ${
                    activeTab === 'track'
                      ? 'border-[#111111] text-[#111111] font-semibold'
                      : 'border-transparent text-[#5F5F5F] hover:text-[#111111]'
                  }`}
                >
                  Track Request
                </button>
              </>
            ) : (
              // Admin-View Navigation (Only when navigating to secure admin route)
              isAdminLoggedIn && (
                <>
                  <button
                    onClick={() => setActiveTab('admin')}
                    className={`text-xs uppercase tracking-[0.14em] font-medium py-2 px-1 transition-all border-b-2 ${
                      activeTab === 'admin'
                        ? 'border-white text-white font-semibold'
                        : 'border-transparent text-neutral-400 hover:text-white'
                    }`}
                  >
                    Console
                  </button>

                  <button
                    onClick={() => setActiveTab('settings')}
                    className={`text-xs uppercase tracking-[0.14em] font-medium py-2 px-1 transition-all border-b-2 ${
                      activeTab === 'settings'
                        ? 'border-white text-white font-semibold'
                        : 'border-transparent text-neutral-400 hover:text-white'
                    }`}
                  >
                    Settings
                  </button>

                  {onLogout && (
                    <button
                      onClick={onLogout}
                      className="text-xs uppercase tracking-[0.14em] font-medium py-2 px-2 text-neutral-400 hover:text-white transition-colors"
                    >
                      Sign Out
                    </button>
                  )}
                </>
              )
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};

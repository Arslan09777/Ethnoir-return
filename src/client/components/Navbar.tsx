import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

interface NavbarProps {
  activeTab: 'customer' | 'track' | 'admin' | 'settings';
  setActiveTab: (tab: 'customer' | 'track' | 'admin' | 'settings') => void;
  onOpenDiagnostics: () => void;
  isAdminLoggedIn: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenDiagnostics,
  isAdminLoggedIn,
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
            onClick={() => setActiveTab('customer')}
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
              {isAdminView ? 'Merchant Dashboard' : 'Client Services • Returns & Exchanges'}
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-1 sm:space-x-6">
            <button
              onClick={() => setActiveTab('customer')}
              className={`text-xs uppercase tracking-[0.14em] font-medium py-2 px-1 transition-all border-b-2 ${
                activeTab === 'customer'
                  ? isAdminView
                    ? 'border-white text-white'
                    : 'border-[#111111] text-[#111111] font-semibold'
                  : isAdminView
                  ? 'border-transparent text-neutral-400 hover:text-white'
                  : 'border-transparent text-[#5F5F5F] hover:text-[#111111]'
              }`}
            >
              Request Return
            </button>

            <button
              onClick={() => setActiveTab('track')}
              className={`text-xs uppercase tracking-[0.14em] font-medium py-2 px-1 transition-all border-b-2 ${
                activeTab === 'track'
                  ? isAdminView
                    ? 'border-white text-white'
                    : 'border-[#111111] text-[#111111] font-semibold'
                  : isAdminView
                  ? 'border-transparent text-neutral-400 hover:text-white'
                  : 'border-transparent text-[#5F5F5F] hover:text-[#111111]'
              }`}
            >
              Track Request
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`text-xs uppercase tracking-[0.14em] font-medium py-2 px-1 transition-all border-b-2 ${
                isAdminView
                  ? 'border-white text-white font-semibold'
                  : 'border-transparent text-[#5F5F5F] hover:text-[#111111]'
              }`}
            >
              Admin
            </button>

            {/* Subtle Diagnostics Icon */}
            <button
              onClick={onOpenDiagnostics}
              title="Integration Status & Diagnostics"
              className={`p-2 rounded transition-colors ${
                isAdminView
                  ? 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                  : 'text-[#8E8E8E] hover:text-[#111111] hover:bg-[#F8F8F8]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};

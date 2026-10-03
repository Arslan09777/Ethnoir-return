import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { CustomerPortal } from './components/CustomerPortal.js';
import { RequestTracker } from './components/RequestTracker.js';
import { AdminDashboard } from './components/AdminDashboard.js';
import { AdminSettings } from './components/AdminSettings.js';
import { supabase } from './supabase.js';

export function App() {
  const getTabFromLocation = (): 'customer' | 'track' | 'admin' | 'settings' => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();

    if (path.includes('secure-admin-ethnoir') || hash.includes('secure-admin-ethnoir')) {
      return 'admin';
    }
    if (path.includes('track') || hash.includes('track')) {
      return 'track';
    }
    return 'customer';
  };

  const [activeTab, setActiveTab] = useState<'customer' | 'track' | 'admin' | 'settings'>(getTabFromLocation);
  const [trackingRequestNumber, setTrackingRequestNumber] = useState<string | null>(null);
  const [trackingContact, setTrackingContact] = useState<string | null>(null);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  // Sync tab with URL history
  useEffect(() => {
    const handleLocationChange = () => {
      setActiveTab(getTabFromLocation());
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const handleViewRequest = (requestNumber: string, contact: string) => {
    setTrackingRequestNumber(requestNumber);
    setTrackingContact(contact);
    setActiveTab('track');
    window.history.pushState(null, '', '/track');
  };

  const handleAdminLogout = async () => {
    await supabase.auth.signOut();
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    setIsAdminLoggedIn(false);
    setActiveTab('admin');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#111111] selection:bg-[#111111] selection:text-white font-sans">
      {/* Top Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdminLoggedIn={isAdminLoggedIn}
        onLogout={handleAdminLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 bg-[#FFFFFF]">
        {activeTab === 'customer' && (
          <CustomerPortal onViewRequest={handleViewRequest} />
        )}

        {activeTab === 'track' && (
          <RequestTracker
            initialRequestNumber={trackingRequestNumber}
            initialContact={trackingContact}
          />
        )}

        {activeTab === 'admin' && (
          <AdminDashboard
            onOpenSettings={() => setActiveTab('settings')}
            isAdminLoggedIn={isAdminLoggedIn}
            setIsAdminLoggedIn={setIsAdminLoggedIn}
          />
        )}

        {activeTab === 'settings' && (
          <AdminSettings onBackToDashboard={() => setActiveTab('admin')} />
        )}
      </main>

      {/* Luxury Minimal Fashion Footer */}
      <footer className="border-t border-[#E6E6E6] bg-[#FFFFFF] py-12 px-4 sm:px-6 text-center text-xs space-y-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[#5F5F5F]">
          <span className="font-serif text-lg tracking-[0.25em] uppercase font-bold text-[#111111]">
            ETHNOIR
          </span>
          <div className="flex items-center space-x-6 text-[10px] uppercase tracking-[0.16em]">
            <span>7-Day Return Policy</span>
            <span>Doorstep Courier Pickup</span>
            <span>Complimentary Exchange</span>
          </div>
          <a
            href="https://ethnoir.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-[#111111] hover:underline tracking-wider"
          >
            https://ethnoir.in
          </a>
        </div>

        <p className="text-[11px] text-[#8E8E8E] pt-4 border-t border-[#F0F0F0] max-w-2xl mx-auto">
          © {new Date().getFullYear()} ETHNOIR. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

export default App;

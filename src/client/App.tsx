import React, { useState } from 'react';
import { Navbar } from './components/Navbar.js';
import { CustomerPortal } from './components/CustomerPortal.js';
import { RequestTracker } from './components/RequestTracker.js';
import { AdminDashboard } from './components/AdminDashboard.js';
import { AdminSettings } from './components/AdminSettings.js';
import { DiagnosticsModal } from './components/DiagnosticsModal.js';

export function App() {
  const [activeTab, setActiveTab] = useState<'customer' | 'track' | 'admin' | 'settings'>('customer');
  const [trackingRequestNumber, setTrackingRequestNumber] = useState<string | null>(null);
  const [trackingContact, setTrackingContact] = useState<string | null>(null);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  const handleViewRequest = (requestNumber: string, contact: string) => {
    setTrackingRequestNumber(requestNumber);
    setTrackingContact(contact);
    setActiveTab('track');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#111111] selection:bg-[#111111] selection:text-white font-sans">
      {/* Top Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        isAdminLoggedIn={isAdminLoggedIn}
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

      {/* Luxury Editorial Editorial Footer */}
      <footer className="border-t border-[#E6E6E6] bg-[#FFFFFF] py-12 px-4 sm:px-6 text-center text-xs space-y-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[#5F5F5F]">
          <span className="font-serif text-lg tracking-[0.2em] uppercase font-bold text-[#111111]">
            ETHNOIR
          </span>
          <div className="flex items-center space-x-6 text-[10px] uppercase tracking-[0.16em]">
            <span>7-Day Return Policy</span>
            <span>Doorstep Courier Pickup</span>
            <span>Complimentary Exchange</span>
          </div>
          <span className="text-[11px] text-[#8E8E8E]">
            ethnoirindia.myshopify.com
          </span>
        </div>

        <p className="text-[11px] text-[#8E8E8E] pt-4 border-t border-[#F0F0F0] max-w-2xl mx-auto">
          © {new Date().getFullYear()} Ethnoir India. Private Client Services &amp; Automated Order Lifecycle Management.
        </p>
      </footer>

      {/* Diagnostics Modal */}
      <DiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
      />
    </div>
  );
}

export default App;

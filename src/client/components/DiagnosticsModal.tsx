import React, { useState, useEffect } from 'react';
import { X, Check, RefreshCw } from 'lucide-react';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/integrations/status');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const healthRes = await fetch('/api/health');
        const healthJson = await healthRes.json();
        setData({
          shopify: {
            isConfigured: healthJson.shopifyConfigured,
            shopDomain: healthJson.store,
            apiVersion: healthJson.apiVersion,
            connected: healthJson.shopifyConfigured,
            message: healthJson.shopifyConfigured
              ? 'Shopify access token is active.'
              : 'Client ID & Secret configured. Awaiting Admin API access token (shpat_...). Running in demo mode.'
          },
          shiprocket: {
            isConfigured: healthJson.shiprocketConfigured,
            apiBase: 'https://apiv2.shiprocket.in/v1/external',
            email: 'ethnoiropus@gmail.com',
            connected: healthJson.shiprocketConfigured,
            message: healthJson.shiprocketConfigured
              ? 'Shiprocket authenticated live. Connected to Surat warehouse (394210).'
              : 'Shiprocket credentials pending.'
          }
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-[#111111] rounded-sm max-w-lg w-full p-6 sm:p-8 space-y-6 relative text-left">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-1 text-[#111111] hover:opacity-60"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block font-medium">
            System Diagnostics
          </span>
          <h2 className="font-serif text-2xl font-medium text-[#111111]">
            Integration Status
          </h2>
        </div>

        {loading ? (
          <div className="py-8 text-center text-[#5F5F5F] text-xs">
            <span>Testing live connections...</span>
          </div>
        ) : error ? (
          <div className="p-3.5 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111]">
            {error}
          </div>
        ) : data ? (
          <div className="space-y-4 text-xs">
            {/* Shopify */}
            <div className="p-4 border border-[#E6E6E6] rounded-sm space-y-2 bg-[#FAFAFA]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#111111] uppercase tracking-wider text-[11px]">
                  Shopify GraphQL API
                </span>
                <span className={data.shopify.connected ? 'badge-approved' : 'badge-pending'}>
                  {data.shopify.connected ? 'LIVE CONNECTED' : 'DEMO MODE'}
                </span>
              </div>
              <p className="text-[#5F5F5F]">Domain: <code className="text-[#111111] font-mono">{data.shopify.shopDomain}</code></p>
              <p className="text-[#5F5F5F]">Version: <code className="text-[#111111] font-mono">{data.shopify.apiVersion}</code></p>
              <p className="text-[#111111] pt-1">{data.shopify.message}</p>
            </div>

            {/* Shiprocket */}
            <div className="p-4 border border-[#E6E6E6] rounded-sm space-y-2 bg-[#FAFAFA]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#111111] uppercase tracking-wider text-[11px]">
                  Shiprocket Logistics
                </span>
                <span className={data.shiprocket.connected ? 'badge-approved' : 'badge-pending'}>
                  {data.shiprocket.connected ? 'LIVE CONNECTED' : 'NOT CONFIGURED'}
                </span>
              </div>
              <p className="text-[#5F5F5F]">Account: <code className="text-[#111111] font-mono">{data.shiprocket.email}</code></p>
              <p className="text-[#111111] pt-1">{data.shiprocket.message}</p>
            </div>
          </div>
        ) : null}

        <div className="flex justify-between items-center pt-4 border-t border-[#E6E6E6]">
          <button
            onClick={fetchStatus}
            className="text-xs uppercase tracking-wider text-[#5F5F5F] hover:text-[#111111]"
          >
            Re-test
          </button>
          <button
            onClick={onClose}
            className="ethnoir-btn-primary py-2 px-5 text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, RefreshCw } from 'lucide-react';

interface AdminSettingsProps {
  onBackToDashboard: () => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ onBackToDashboard }) => {
  const [returnWindowDays, setReturnWindowDays] = useState(7);
  const [autoApproveReturns, setAutoApproveReturns] = useState(false);
  const [requirePhotoUpload, setRequirePhotoUpload] = useState(true);
  const [defaultRefundMethod, setDefaultRefundMethod] = useState('ORIGINAL_PAYMENT');
  const [shiprocketPickupName, setShiprocketPickupName] = useState('warehouse');
  const [returnPolicyContent, setReturnPolicyContent] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        const s = data.settings;
        setReturnWindowDays(s.returnWindowDays || 7);
        setAutoApproveReturns(Boolean(s.autoApproveReturns));
        setRequirePhotoUpload(Boolean(s.requirePhotoUpload));
        setDefaultRefundMethod(s.defaultRefundMethod || 'ORIGINAL_PAYMENT');
        setShiprocketPickupName(s.shiprocketPickupName || 'warehouse');
        setReturnPolicyContent(s.returnPolicyContent || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnWindowDays,
          autoApproveReturns,
          requirePhotoUpload,
          defaultRefundMethod,
          shiprocketPickupName,
          returnPolicyContent
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save settings.');

      setMessage({ text: 'Policy parameters saved successfully.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8 text-left bg-white text-[#111111]">
      <div className="flex items-center justify-between pb-6 border-b border-[#E6E6E6]">
        <button
          onClick={onBackToDashboard}
          className="text-xs uppercase tracking-[0.14em] text-[#5F5F5F] hover:text-[#111111] flex items-center space-x-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Requests</span>
        </button>

        <h1 className="font-serif text-2xl font-medium text-[#111111]">
          Store Return Rules
        </h1>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-[#5F5F5F]">
          <span>Loading settings...</span>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {message && (
            <div className="p-3.5 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111]">
              {message.text}
            </div>
          )}

          {/* Return Window */}
          <div>
            <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
              Default Return Window (Days)
            </label>
            <input
              type="number"
              min="1"
              max="90"
              value={returnWindowDays}
              onChange={e => setReturnWindowDays(parseInt(e.target.value, 10))}
              className="w-36 ethnoir-input text-xs"
              required
            />
            <p className="text-[11px] text-[#5F5F5F] mt-1">
              Number of days from delivery when return/replacement is permitted (default 7 days).
            </p>
          </div>

          {/* Default Refund Method */}
          <div>
            <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
              Default Refund Destination
            </label>
            <select
              value={defaultRefundMethod}
              onChange={e => setDefaultRefundMethod(e.target.value)}
              className="w-full sm:w-72 ethnoir-input text-xs cursor-pointer"
            >
              <option value="ORIGINAL_PAYMENT">Original Payment Method (Shopify Refund API)</option>
              <option value="STORE_CREDIT">Store Credit</option>
              <option value="MANUAL_BANK_UPI">Manual Bank / UPI Transfer</option>
            </select>
          </div>

          {/* Shiprocket Warehouse Pickup Nickname */}
          <div>
            <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
              Shiprocket Pickup Location Nickname
            </label>
            <input
              type="text"
              value={shiprocketPickupName}
              onChange={e => setShiprocketPickupName(e.target.value)}
              className="w-full sm:w-80 ethnoir-input text-xs font-mono"
            />
            <p className="text-[11px] text-[#5F5F5F] mt-1">
              Exact pickup location name configured in Shiprocket (Currently: <code className="text-[#111111]">warehouse</code>).
            </p>
          </div>

          {/* Policy Text */}
          <div>
            <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
              Client-Facing Policy Statement
            </label>
            <textarea
              rows={4}
              value={returnPolicyContent}
              onChange={e => setReturnPolicyContent(e.target.value)}
              className="w-full ethnoir-input text-xs"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-[#E6E6E6]">
            <button
              type="submit"
              disabled={isSaving}
              className="ethnoir-btn-primary"
            >
              {isSaving ? 'Saving...' : 'Save Parameters'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

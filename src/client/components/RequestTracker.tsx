import React, { useState, useEffect } from 'react';
import { Search, ExternalLink, ArrowRight, Check } from 'lucide-react';

interface RequestTrackerProps {
  initialRequestNumber?: string | null;
}

export const RequestTracker: React.FC<RequestTrackerProps> = ({ initialRequestNumber }) => {
  const [requestNumber, setRequestNumber] = useState(initialRequestNumber || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestData, setRequestData] = useState<any | null>(null);

  const fetchRequestDetails = async (reqNum: string) => {
    if (!reqNum.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/customer/returns/track/${encodeURIComponent(reqNum.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Request not found.');
      }
      setRequestData(data.request);
    } catch (err: any) {
      setError(err.message);
      setRequestData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialRequestNumber) {
      setRequestNumber(initialRequestNumber);
      fetchRequestDetails(initialRequestNumber);
    }
  }, [initialRequestNumber]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRequestDetails(requestNumber);
  };

  const stages = [
    { key: 'SUBMITTED', label: 'Submitted' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'PICKUP_SCHEDULED', label: 'Pickup Scheduled' },
    { key: 'PICKED_UP', label: 'Picked Up' },
    { key: 'RECEIVED_AT_WAREHOUSE', label: 'Received' },
    { key: 'COMPLETED', label: 'Completed' }
  ];

  const getStageIndex = (status: string) => {
    if (status === 'REJECTED') return -1;
    if (status === 'REFUND_PROCESSED' || status === 'REPLACEMENT_SHIPPED') return 4;
    return stages.findIndex(s => s.key === status);
  };

  const currentStageIndex = requestData ? getStageIndex(requestData.status) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-10">
      <div className="text-center space-y-3">
        <span className="text-[11px] font-medium tracking-[0.25em] uppercase text-[#5F5F5F] block">
          Client Services
        </span>
        <h1 className="font-serif text-3xl sm:text-5xl font-medium text-[#111111] tracking-tight">
          Track Request
        </h1>
        <p className="text-sm text-[#5F5F5F] max-w-md mx-auto">
          Enter your reference identifier to view live courier tracking and refund status.
        </p>
      </div>

      {/* Search Input Box */}
      <form onSubmit={handleSearch} className="max-w-md mx-auto flex gap-2">
        <input
          type="text"
          placeholder="e.g. RET-2026-0001"
          value={requestNumber}
          onChange={e => setRequestNumber(e.target.value)}
          className="flex-1 ethnoir-input uppercase font-mono tracking-wider text-xs"
          required
        />
        <button
          type="submit"
          disabled={isLoading}
          className="ethnoir-btn-primary py-2.5 px-6 text-xs flex items-center space-x-1.5"
        >
          {isLoading ? <span>Searching...</span> : <span>Track</span>}
        </button>
      </form>

      {error && (
        <div className="max-w-md mx-auto p-4 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111]">
          {error}
        </div>
      )}

      {/* Detailed Card View */}
      {requestData && (
        <div className="border border-[#E6E6E6] rounded-sm p-6 sm:p-8 space-y-8 bg-white">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E6E6E6]">
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block font-medium">
                Reference Identifier
              </span>
              <h2 className="font-mono text-2xl font-bold text-[#111111] tracking-wide">
                {requestData.requestNumber}
              </h2>
              <p className="text-xs text-[#5F5F5F] mt-1">
                Order #{requestData.order.orderNumber} • Registered on {new Date(requestData.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[#5F5F5F] block">
                Current Status
              </span>
              <span
                className={`mt-1 inline-block ${
                  requestData.status === 'REJECTED'
                    ? 'badge-rejected'
                    : requestData.status === 'COMPLETED'
                    ? 'badge-completed'
                    : 'badge-approved'
                }`}
              >
                {requestData.status.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* Rejection Message if rejected */}
          {requestData.status === 'REJECTED' && (
            <div className="p-4 border border-[#404040] bg-[#FAFAFA] text-xs text-[#111111] space-y-1">
              <span className="font-semibold uppercase tracking-wider block">Request Notice</span>
              <p className="text-[#5F5F5F]">
                {requestData.rejectionReason || 'Item does not meet return eligibility criteria.'}
              </p>
            </div>
          )}

          {/* Thin Black Line Horizontal Timeline */}
          {requestData.status !== 'REJECTED' && (
            <div className="pt-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block mb-6 font-medium text-center">
                Milestone Progress
              </span>
              <div className="relative flex justify-between items-center max-w-xl mx-auto px-4">
                <div className="absolute top-1/2 left-8 right-8 h-[1px] bg-[#111111] -translate-y-1/2 z-0" />
                {stages.map((st, idx) => {
                  const isPassed = currentStageIndex >= idx;

                  return (
                    <div key={st.key} className="relative z-10 flex flex-col items-center bg-white px-2">
                      <div
                        className={`w-3.5 h-3.5 rounded-full border border-[#111111] transition-all ${
                          isPassed ? 'bg-[#111111]' : 'bg-white'
                        }`}
                      />
                      <span
                        className={`text-[9px] uppercase tracking-wider mt-2.5 font-medium whitespace-nowrap ${
                          isPassed ? 'text-[#111111]' : 'text-[#8E8E8E]'
                        }`}
                      >
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Logistics & Shiprocket Info */}
          {requestData.shipments && requestData.shipments.length > 0 && (
            <div className="pt-6 border-t border-[#E6E6E6] space-y-3">
              <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
                Courier &amp; Pickup Logistics
              </span>
              <div className="space-y-2">
                {requestData.shipments.map((s: any) => (
                  <div
                    key={s.id}
                    className="p-4 border border-[#E6E6E6] rounded-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FAFAFA]"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-[#111111]">
                          {s.type === 'REVERSE_PICKUP' ? 'Doorstep Reverse Pickup' : 'Replacement Forward Dispatch'}
                        </span>
                        <span className="badge-pending text-[10px]">
                          {s.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#5F5F5F] mt-0.5">
                        Courier: {s.courierName || 'Shiprocket Surface'} • AWB: <span className="font-mono text-[#111111] font-semibold">{s.awbNumber || 'PENDING'}</span>
                      </p>
                    </div>

                    {s.trackingUrl && (
                      <a
                        href={s.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs uppercase tracking-wider font-semibold text-[#111111] hover:underline flex items-center space-x-1"
                      >
                        <span>Courier Tracking</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items Summary */}
          <div className="pt-6 border-t border-[#E6E6E6] space-y-3">
            <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
              Items in this Request
            </span>
            <div className="space-y-2">
              {requestData.items.map((it: any) => (
                <div key={it.id} className="p-3 border border-[#E6E6E6] rounded-sm flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium text-[#111111] block">{it.title}</span>
                    <span className="text-[#5F5F5F] block">{it.variantTitle} • Qty: {it.quantity}</span>
                  </div>
                  {it.refundAmount > 0 && (
                    <span className="font-medium text-[#111111]">
                      ₹{it.refundAmount.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Audit Timeline */}
          <div className="pt-6 border-t border-[#E6E6E6] space-y-3">
            <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
              Activity History
            </span>
            <div className="space-y-3 pl-2 border-l border-[#111111]">
              {requestData.timeline.map((ev: any, idx: number) => (
                <div key={idx} className="text-xs pl-3 relative">
                  <div className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-[#111111]" />
                  <p className="text-[#111111] font-medium">{ev.message}</p>
                  <span className="text-[10px] text-[#8E8E8E] block mt-0.5">
                    {new Date(ev.createdAt).toLocaleString()} • {ev.actorType}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

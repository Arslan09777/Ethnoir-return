import React, { useState, useEffect } from 'react';
import { Search, ExternalLink, ArrowRight, Check, MapPin, AlertCircle, ShieldCheck } from 'lucide-react';

interface RequestTrackerProps {
  initialRequestNumber?: string | null;
  initialContact?: string | null;
}

export const RequestTracker: React.FC<RequestTrackerProps> = ({
  initialRequestNumber,
  initialContact
}) => {
  const [requestNumber, setRequestNumber] = useState(initialRequestNumber || '');
  const [contact, setContact] = useState(initialContact || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestData, setRequestData] = useState<any | null>(null);

  const fetchRequestDetails = async (reqNum: string, userContact: string) => {
    if (!reqNum.trim()) return;

    if (!userContact.trim()) {
      setError('Please provide your registered Email or Mobile Number to verify ownership and access tracking details.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/customer/returns/track/${encodeURIComponent(reqNum.trim())}?contact=${encodeURIComponent(userContact.trim())}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'No matching request found with the provided details.');
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
    if (initialRequestNumber && initialContact) {
      setRequestNumber(initialRequestNumber);
      setContact(initialContact);
      fetchRequestDetails(initialRequestNumber, initialContact);
    } else if (initialRequestNumber) {
      setRequestNumber(initialRequestNumber);
    }
  }, [initialRequestNumber, initialContact]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRequestDetails(requestNumber, contact);
  };

  // 10 Timeline stages as per production requirements
  const timelineStages = [
    { key: 'SUBMITTED', label: 'Submitted' },
    { key: 'UNDER_REVIEW', label: 'Under Review' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'PICKUP_SCHEDULED', label: 'Pickup Scheduled' },
    { key: 'PICKED_UP', label: 'Picked Up' },
    { key: 'RECEIVED_AT_WAREHOUSE', label: 'Received' },
    { key: 'REFUND_PROCESSED', label: 'Refund / Replacement' },
    { key: 'COMPLETED', label: 'Completed' }
  ];

  const getStageIndex = (status: string) => {
    if (status === 'REJECTED') return -1;
    switch (status) {
      case 'SUBMITTED':
        return 0;
      case 'UNDER_REVIEW':
        return 1;
      case 'APPROVED':
        return 2;
      case 'PICKUP_SCHEDULED':
        return 3;
      case 'PICKED_UP':
        return 4;
      case 'RECEIVED_AT_WAREHOUSE':
        return 5;
      case 'REFUND_PROCESSED':
      case 'REPLACEMENT_SHIPPED':
        return 6;
      case 'COMPLETED':
        return 7;
      default:
        return 0;
    }
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
          Enter your reference identifier and verified contact to view real-time courier pickup, delivery and refund progress.
        </p>
      </div>

      {/* Verified Search Form */}
      <form onSubmit={handleSearch} className="max-w-lg mx-auto border border-[#E6E6E6] p-6 bg-white shadow-sm rounded-sm space-y-4">
        <div>
          <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-1.5">
            Reference Identifier
          </label>
          <input
            type="text"
            placeholder="e.g. RET-2026-0001"
            value={requestNumber}
            onChange={e => setRequestNumber(e.target.value)}
            className="w-full ethnoir-input uppercase font-mono tracking-wider text-xs"
            required
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-1.5">
            Registered Email or Mobile Number
          </label>
          <input
            type="text"
            placeholder="e.g. name@domain.com or +91..."
            value={contact}
            onChange={e => setContact(e.target.value)}
            className="w-full ethnoir-input text-xs"
            required
          />
          <span className="text-[10px] text-[#8E8E8E] mt-1 block">
            Verification required to protect customer privacy
          </span>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full ethnoir-btn-primary py-3 text-xs flex items-center justify-center space-x-2"
        >
          {isLoading ? <span>Verifying &amp; Searching...</span> : <span>Track My Request</span>}
        </button>
      </form>

      {error && (
        <div className="max-w-lg mx-auto p-4 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111] flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-[#111111] flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Detailed Card View */}
      {requestData && (
        <div className="border border-[#E6E6E6] rounded-sm p-6 sm:p-8 space-y-8 bg-white shadow-sm">
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
            <div className="p-4 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111] space-y-1">
              <span className="font-semibold uppercase tracking-wider block">Notice Regarding Request</span>
              <p className="text-[#5F5F5F]">
                {requestData.rejectionReason || 'Item does not meet return eligibility criteria under our 7-day policy.'}
              </p>
            </div>
          )}

          {/* Luxury Horizontal Timeline */}
          {requestData.status !== 'REJECTED' && (
            <div className="pt-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block mb-6 font-medium text-center">
                Milestone Progress
              </span>
              <div className="overflow-x-auto pb-4">
                <div className="relative flex justify-between items-center min-w-[540px] px-4">
                  <div className="absolute top-1/2 left-6 right-6 h-[1px] bg-[#111111] -translate-y-1/2 z-0" />
                  {timelineStages.map((st, idx) => {
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
                            isPassed ? 'text-[#111111] font-semibold' : 'text-[#8E8E8E]'
                          }`}
                        >
                          {st.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Real Shiprocket Courier Info (Only when assigned) */}
          {requestData.shipments && requestData.shipments.length > 0 ? (
            <div className="pt-6 border-t border-[#E6E6E6] space-y-3">
              <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
                Courier &amp; Logistics Tracking
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
                      <p className="text-xs text-[#5F5F5F] mt-1">
                        Courier: <span className="text-[#111111] font-medium">{s.courierName || 'Shiprocket Return Partner'}</span>
                        {s.awbNumber && s.awbNumber !== 'PENDING' && (
                          <span> • AWB: <span className="font-mono text-[#111111] font-semibold">{s.awbNumber}</span></span>
                        )}
                      </p>
                    </div>

                    {s.trackingUrl && s.awbNumber && s.awbNumber !== 'PENDING' && (
                      <a
                        href={s.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ethnoir-btn-primary py-1.5 px-3 text-xs flex items-center space-x-1.5 self-start sm:self-auto"
                      >
                        <span>Live Tracking</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="pt-6 border-t border-[#E6E6E6]">
              <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block mb-2">
                Courier &amp; Logistics
              </span>
              <p className="text-xs text-[#5F5F5F]">
                Reverse pickup courier assignment is currently being processed. You will receive an SMS and email notification as soon as the AWB is manifested.
              </p>
            </div>
          )}

          {/* Pickup Address */}
          {requestData.pickupAddress && (
            <div className="pt-6 border-t border-[#E6E6E6] space-y-2">
              <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
                Confirmed Pickup Address
              </span>
              <div className="p-3.5 border border-[#E6E6E6] rounded-sm bg-[#FAFAFA] text-xs text-[#5F5F5F] space-y-0.5">
                <span className="font-medium text-[#111111] block">{requestData.pickupAddress.name}</span>
                <p>{requestData.pickupAddress.address1} {requestData.pickupAddress.address2 || ''}</p>
                <p>{requestData.pickupAddress.city}, {requestData.pickupAddress.state} - {requestData.pickupAddress.pincode}</p>
                <p className="text-[#111111]">Phone: {requestData.pickupAddress.phone}</p>
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
                <div key={it.id} className="p-3 border border-[#E6E6E6] rounded-sm flex items-center justify-between text-xs bg-white">
                  <div>
                    <span className="font-medium text-[#111111] block">{it.title}</span>
                    <span className="text-[#5F5F5F] block">{it.variantTitle} • Qty: {it.quantity}</span>
                  </div>
                  {it.refundAmount > 0 && (
                    <span className="font-medium text-[#111111]">
                      Refund: ₹{it.refundAmount.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Activity Timeline */}
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

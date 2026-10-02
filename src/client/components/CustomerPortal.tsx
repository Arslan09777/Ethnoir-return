import React, { useState } from 'react';
import {
  RotateCcw,
  RefreshCw,
  Upload,
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  ShoppingBag
} from 'lucide-react';
import { CustomerOrder, EligibilityInfo, OrderItem } from '../types.js';

interface SelectedItemState {
  orderItemId: string;
  quantity: number;
  replacementVariantId?: string;
  replacementVariantTitle?: string;
  itemReason?: string;
  itemComments?: string;
}

interface UploadedFileState {
  originalName: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  url: string;
}

interface CustomerPortalProps {
  onViewRequest: (requestNumber: string) => void;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({ onViewRequest }) => {
  // 5 Step Screens: 'WELCOME' | 'ORDER_RESULT' | 'REQUEST_TYPE' | 'REASON_DETAILS' | 'CONFIRMATION'
  const [currentScreen, setCurrentScreen] = useState<
    'WELCOME' | 'ORDER_RESULT' | 'REQUEST_TYPE' | 'REASON_DETAILS' | 'CONFIRMATION'
  >('WELCOME');

  // Form State
  const [orderNumber, setOrderNumber] = useState('');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Loaded Order & Eligibility
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityInfo | null>(null);

  // Return Configuration
  const [requestType, setRequestType] = useState<'RETURN_REFUND' | 'REPLACEMENT'>('RETURN_REFUND');
  const [reason, setReason] = useState<'SIZE_FIT' | 'DAMAGED' | 'WRONG_PRODUCT' | 'QUALITY' | 'MISSING_ITEM' | 'OTHER'>('SIZE_FIT');
  const [customerNotes, setCustomerNotes] = useState('');
  const [refundMethod, setRefundMethod] = useState<'ORIGINAL_PAYMENT' | 'STORE_CREDIT' | 'MANUAL_BANK_UPI'>('ORIGINAL_PAYMENT');
  const [selectedItems, setSelectedItems] = useState<Record<string, SelectedItemState>>({});
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileState[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdRequestNumber, setCreatedRequestNumber] = useState<string | null>(null);

  // Fast demo prefill
  const handleQuickDemo = (demoNum: string, demoContact: string) => {
    setOrderNumber(demoNum);
    setEmailOrPhone(demoContact);
    setLookupError(null);
  };

  // 1. Order Lookup
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !emailOrPhone.trim()) {
      setLookupError('Please enter both your Order Number and registered Email/Mobile.');
      return;
    }

    setIsLoading(true);
    setLookupError(null);

    try {
      const res = await fetch('/api/customer/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, emailOrPhone })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Order lookup failed.');
      }

      setOrder(data.order);
      setEligibility(data.eligibility);

      // Auto-select first eligible item
      const firstEligible = data.order.items.find((it: OrderItem) => it.isEligible && it.availableUnits > 0);
      if (firstEligible) {
        setSelectedItems({
          [firstEligible.id]: {
            orderItemId: firstEligible.id,
            quantity: 1,
            replacementVariantId: firstEligible.availableVariants?.[0]?.id,
            replacementVariantTitle: firstEligible.availableVariants?.[0]?.title,
          }
        });
      }

      setCurrentScreen('ORDER_RESULT');
    } catch (err: any) {
      setLookupError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle item selection
  const toggleItemSelection = (item: OrderItem) => {
    if (!item.isEligible || item.availableUnits <= 0) return;

    setSelectedItems(prev => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = {
          orderItemId: item.id,
          quantity: 1,
          replacementVariantId: item.availableVariants?.[0]?.id,
          replacementVariantTitle: item.availableVariants?.[0]?.title,
        };
      }
      return next;
    });
  };

  // Photo Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    for (let i = 0; i < Math.min(files.length, 5); i++) {
      formData.append('images', files[i]);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Image upload failed.');
      }

      setUploadedFiles(prev => [...prev, ...data.files]);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const removeUploadedFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Submit Final Request
  const handleSubmitRequest = async () => {
    const itemsList = Object.values(selectedItems);
    if (itemsList.length === 0) {
      setSubmitError('Please select at least one item.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        orderId: order!.id,
        requestType,
        reason,
        customerNotes,
        refundMethod: requestType === 'RETURN_REFUND' ? refundMethod : undefined,
        items: itemsList.map(item => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
          reason,
          replacementVariantId: requestType === 'REPLACEMENT' ? item.replacementVariantId : undefined,
          replacementVariantTitle: requestType === 'REPLACEMENT' ? item.replacementVariantTitle : undefined
        })),
        uploadedFiles: uploadedFiles.map(f => ({
          filename: f.filename,
          originalName: f.originalName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          filePath: f.url
        }))
      };

      const res = await fetch('/api/customer/returns/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Request submission failed.');
      }

      setCreatedRequestNumber(data.requestNumber);
      setCurrentScreen('CONFIRMATION');
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCount = Object.keys(selectedItems).length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      {/* ---------------- SCREEN 1: WELCOME SCREEN ---------------- */}
      {currentScreen === 'WELCOME' && (
        <div className="space-y-10 text-center">
          <div className="space-y-4">
            <span className="text-[11px] font-medium tracking-[0.25em] uppercase text-[#5F5F5F] block">
              Ethnoir Private Client Services
            </span>
            <h1 className="font-serif text-3xl sm:text-5xl font-medium text-[#111111] tracking-tight">
              Returns &amp; Replacements
            </h1>
            <p className="text-sm text-[#5F5F5F] max-w-md mx-auto leading-relaxed">
              We offer seamless doorstep returns and complimentary size exchanges within our 7-day policy window.
            </p>
          </div>

          <div className="max-w-md mx-auto text-left">
            <form onSubmit={handleLookup} className="space-y-5">
              <div>
                <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
                  Order Number
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#8E8E8E] text-sm">
                    #
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. 1001"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    className="w-full ethnoir-input pl-8"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
                  Email or Mobile Number
                </label>
                <input
                  type="text"
                  placeholder="name@domain.com or +91..."
                  value={emailOrPhone}
                  onChange={e => setEmailOrPhone(e.target.value)}
                  className="w-full ethnoir-input"
                  required
                />
              </div>

              {lookupError && (
                <div className="p-3.5 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111] leading-relaxed">
                  {lookupError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full ethnoir-btn-primary flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <span>Verifying Order...</span>
                ) : (
                  <span>Find My Order</span>
                )}
              </button>
            </form>

            {/* Quick Test Demo Options */}
            <div className="mt-8 pt-6 border-t border-[#E6E6E6]">
              <span className="text-[10px] uppercase tracking-[0.18em] text-[#8E8E8E] block mb-3 font-medium">
                Test with Sample Orders:
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleQuickDemo('1001', 'priya.sharma@example.com')}
                  className="p-2.5 text-left border border-[#E6E6E6] hover:border-[#111111] transition-colors rounded-sm"
                >
                  <span className="font-semibold block text-[#111111]">#1001</span>
                  <span className="text-[10px] text-[#5F5F5F] block">Eligible (Silk Set)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemo('1002', 'rahul.verma@example.com')}
                  className="p-2.5 text-left border border-[#E6E6E6] hover:border-[#111111] transition-colors rounded-sm"
                >
                  <span className="font-semibold block text-[#111111]">#1002</span>
                  <span className="text-[10px] text-[#5F5F5F] block">Window Expired</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemo('1003', 'ananya.iyer@example.com')}
                  className="p-2.5 text-left border border-[#E6E6E6] hover:border-[#111111] transition-colors rounded-sm"
                >
                  <span className="font-semibold block text-[#111111]">#1003</span>
                  <span className="text-[10px] text-[#5F5F5F] block">Final Sale Item</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SCREEN 2: ORDER RESULT SCREEN ---------------- */}
      {currentScreen === 'ORDER_RESULT' && order && (
        <div className="space-y-8">
          {/* Header Summary */}
          <div className="flex items-center justify-between pb-6 border-b border-[#E6E6E6]">
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block">
                Order Summary
              </span>
              <h2 className="font-serif text-2xl font-medium text-[#111111]">
                Order #{order.orderNumber}
              </h2>
              <p className="text-xs text-[#5F5F5F] mt-1">
                Placed on {new Date(order.createdAt).toLocaleDateString()} • {order.customer.email}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[#5F5F5F] block">
                Delivery Status
              </span>
              <span className="badge-approved mt-0.5 inline-block">
                {order.fulfillmentStatus}
              </span>
              {eligibility && (
                <p className="text-[11px] text-[#5F5F5F] mt-1">
                  {eligibility.daysRemaining} days left to return
                </p>
              )}
            </div>
          </div>

          {/* Eligibility Note if any */}
          {eligibility && !eligibility.isEligible && (
            <div className="p-4 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111] space-y-1">
              <span className="font-semibold uppercase tracking-wider block">Return Restrictions</span>
              {eligibility.reasons.map((r, i) => (
                <p key={i} className="text-[#5F5F5F]">• {r}</p>
              ))}
            </div>
          )}

          {/* Products List */}
          <div className="space-y-4">
            <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
              Select Item(s)
            </span>

            {order.items.map(item => {
              const isSelected = Boolean(selectedItems[item.id]);

              return (
                <div
                  key={item.id}
                  onClick={() => toggleItemSelection(item)}
                  className={`p-4 sm:p-5 border transition-all cursor-pointer rounded-sm flex items-start gap-4 sm:gap-6 ${
                    !item.isEligible
                      ? 'border-[#E6E6E6] opacity-50 cursor-not-allowed bg-[#FAFAFA]'
                      : isSelected
                      ? 'border-[#111111] bg-[#FAFAFA]'
                      : 'border-[#E6E6E6] hover:border-[#111111] bg-[#FFFFFF]'
                  }`}
                >
                  {/* Outline Selection Control */}
                  <div className="pt-1">
                    <div
                      className={`w-5 h-5 rounded-sm border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-[#111111] bg-[#111111] text-white'
                          : 'border-[#111111] bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                    </div>
                  </div>

                  {/* Clean Product Image */}
                  <div className="w-20 h-24 sm:w-24 sm:h-28 bg-[#F8F8F8] border border-[#E6E6E6] rounded-sm overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ShoppingBag className="w-8 h-8 text-[#8E8E8E]" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 space-y-1 text-left">
                    <h3 className="font-serif text-base sm:text-lg font-medium text-[#111111] leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs text-[#5F5F5F]">
                      {item.variantTitle || 'Standard Edition'}
                    </p>
                    <p className="text-xs text-[#5F5F5F]">
                      Quantity: {item.quantity} • Unit Price: ₹{item.price.toLocaleString('en-IN')}
                    </p>

                    {!item.isEligible && (
                      <p className="text-[11px] text-[#111111] font-medium pt-1">
                        {item.ineligibilityReason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-6 border-t border-[#E6E6E6]">
            <button
              type="button"
              onClick={() => setCurrentScreen('WELCOME')}
              className="text-xs uppercase tracking-[0.14em] text-[#5F5F5F] hover:text-[#111111] flex items-center space-x-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setCurrentScreen('REQUEST_TYPE')}
              className="ethnoir-btn-primary flex items-center space-x-2"
            >
              <span>Continue ({selectedCount} Selected)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ---------------- SCREEN 3: REQUEST TYPE SCREEN ---------------- */}
      {currentScreen === 'REQUEST_TYPE' && (
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block">
              Step 2 of 3
            </span>
            <h2 className="font-serif text-3xl font-medium text-[#111111]">
              Select Resolution Type
            </h2>
            <p className="text-xs text-[#5F5F5F]">
              Choose whether you wish to receive a refund or exchange for an alternate size or variant.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Option A: Return & Refund */}
            <div
              onClick={() => setRequestType('RETURN_REFUND')}
              className={`p-6 sm:p-8 border cursor-pointer transition-all rounded-sm text-left space-y-4 ${
                requestType === 'RETURN_REFUND'
                  ? 'border-[#111111] bg-[#FAFAFA]'
                  : 'border-[#E6E6E6] hover:border-[#111111] bg-white'
              }`}
            >
              <div className="w-10 h-10 border border-[#111111] flex items-center justify-center rounded-sm">
                <RotateCcw className="w-5 h-5 text-[#111111]" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-xl font-medium text-[#111111]">
                  Return &amp; Refund
                </h3>
                <p className="text-xs text-[#5F5F5F] leading-relaxed">
                  Send your item back via complimentary doorstep pickup and receive your refund to the original payment method or store credit.
                </p>
              </div>
              <div className="pt-2">
                <span
                  className={`text-[10px] uppercase tracking-[0.16em] font-semibold py-1 px-2.5 rounded-sm border ${
                    requestType === 'RETURN_REFUND'
                      ? 'border-[#111111] bg-[#111111] text-white'
                      : 'border-[#E6E6E6] text-[#5F5F5F]'
                  }`}
                >
                  {requestType === 'RETURN_REFUND' ? 'Selected' : 'Select Option'}
                </span>
              </div>
            </div>

            {/* Option B: Replacement */}
            <div
              onClick={() => setRequestType('REPLACEMENT')}
              className={`p-6 sm:p-8 border cursor-pointer transition-all rounded-sm text-left space-y-4 ${
                requestType === 'REPLACEMENT'
                  ? 'border-[#111111] bg-[#FAFAFA]'
                  : 'border-[#E6E6E6] hover:border-[#111111] bg-white'
              }`}
            >
              <div className="w-10 h-10 border border-[#111111] flex items-center justify-center rounded-sm">
                <RefreshCw className="w-5 h-5 text-[#111111]" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-xl font-medium text-[#111111]">
                  Replacement
                </h3>
                <p className="text-xs text-[#5F5F5F] leading-relaxed">
                  Exchange for another available size or variant. A new courier dispatch will be initiated upon approval.
                </p>
              </div>
              <div className="pt-2">
                <span
                  className={`text-[10px] uppercase tracking-[0.16em] font-semibold py-1 px-2.5 rounded-sm border ${
                    requestType === 'REPLACEMENT'
                      ? 'border-[#111111] bg-[#111111] text-white'
                      : 'border-[#E6E6E6] text-[#5F5F5F]'
                  }`}
                >
                  {requestType === 'REPLACEMENT' ? 'Selected' : 'Select Option'}
                </span>
              </div>
            </div>
          </div>

          {/* Refund Method Selector if Return & Refund */}
          {requestType === 'RETURN_REFUND' && (
            <div className="pt-4 border-t border-[#E6E6E6] space-y-3">
              <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] block">
                Preferred Refund Destination
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { key: 'ORIGINAL_PAYMENT', label: 'Original Payment Method' },
                  { key: 'STORE_CREDIT', label: 'Store Credit (+5% bonus)' },
                  { key: 'MANUAL_BANK_UPI', label: 'Bank / UPI Transfer' }
                ].map(opt => (
                  <label
                    key={opt.key}
                    className={`p-3 border rounded-sm text-xs cursor-pointer flex items-center space-x-2.5 ${
                      refundMethod === opt.key
                        ? 'border-[#111111] bg-[#FAFAFA] font-medium'
                        : 'border-[#E6E6E6] text-[#5F5F5F]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="refundMethod"
                      checked={refundMethod === opt.key}
                      onChange={() => setRefundMethod(opt.key as any)}
                      className="accent-[#111111]"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Nav */}
          <div className="flex items-center justify-between pt-6 border-t border-[#E6E6E6]">
            <button
              type="button"
              onClick={() => setCurrentScreen('ORDER_RESULT')}
              className="text-xs uppercase tracking-[0.14em] text-[#5F5F5F] hover:text-[#111111] flex items-center space-x-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentScreen('REASON_DETAILS')}
              className="ethnoir-btn-primary flex items-center space-x-2"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ---------------- SCREEN 4: REASON AND DETAILS SCREEN ---------------- */}
      {currentScreen === 'REASON_DETAILS' && (
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block">
              Step 3 of 3
            </span>
            <h2 className="font-serif text-3xl font-medium text-[#111111]">
              Reason &amp; Additional Details
            </h2>
            <p className="text-xs text-[#5F5F5F]">
              Provide specifics to ensure prompt courier pickup and quick processing.
            </p>
          </div>

          <div className="space-y-6">
            {/* Reason Select */}
            <div>
              <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
                Primary Reason
              </label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value as any)}
                className="w-full ethnoir-input cursor-pointer"
              >
                <option value="SIZE_FIT">Size / Fit Issue</option>
                <option value="DAMAGED">Damaged Product / Manufacturing Defect</option>
                <option value="WRONG_PRODUCT">Wrong Product / Variant Received</option>
                <option value="QUALITY">Quality Not as Expected</option>
                <option value="MISSING_ITEM">Missing Item / Accessory</option>
                <option value="OTHER">Other Reason</option>
              </select>
            </div>

            {/* If Replacement: Variant selection */}
            {requestType === 'REPLACEMENT' && (
              <div className="space-y-3">
                <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111]">
                  Desired Replacement Size / Color
                </label>
                {Object.values(selectedItems).map(sel => {
                  const it = order?.items.find(i => i.id === sel.orderItemId);
                  if (!it || !it.availableVariants) return null;

                  return (
                    <div key={sel.orderItemId} className="p-3.5 border border-[#E6E6E6] rounded-sm space-y-2 bg-[#FAFAFA]">
                      <span className="text-xs font-serif font-medium text-[#111111] block">
                        {it.title}
                      </span>
                      <select
                        value={sel.replacementVariantId || ''}
                        onChange={e => {
                          const chosen = it.availableVariants?.find(v => v.id === e.target.value);
                          setSelectedItems(prev => ({
                            ...prev,
                            [sel.orderItemId]: {
                              ...prev[sel.orderItemId],
                              replacementVariantId: e.target.value,
                              replacementVariantTitle: chosen?.title || ''
                            }
                          }));
                        }}
                        className="w-full ethnoir-input text-xs"
                      >
                        {it.availableVariants.map(v => (
                          <option key={v.id} value={v.id} disabled={!v.inStock}>
                            {v.title} {v.inStock ? `(In Stock - ${v.inventoryQuantity} units)` : '(Out of Stock)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Customer Notes */}
            <div>
              <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
                Customer Notes (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Any special notes or observations regarding your order..."
                value={customerNotes}
                onChange={e => setCustomerNotes(e.target.value)}
                className="w-full ethnoir-input text-xs resize-none"
              />
            </div>

            {/* Image Upload Area with Dashed Gray Border */}
            <div>
              <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
                Product Photographs (Optional / Recommended)
              </label>

              <div className="border border-dashed border-[#D4D4D4] hover:border-[#111111] p-6 text-center transition-colors rounded-sm bg-[#FFFFFF]">
                <input
                  type="file"
                  id="image-upload"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label htmlFor="image-upload" className="cursor-pointer block space-y-2">
                  <Upload className="w-5 h-5 mx-auto text-[#111111]" />
                  <span className="text-xs font-medium text-[#111111] block">
                    Click to browse and upload product photos
                  </span>
                  <span className="text-[11px] text-[#8E8E8E] block">
                    JPEG, PNG or WEBP (Max 5 files, up to 5MB each)
                  </span>
                </label>
              </div>

              {uploadError && (
                <p className="text-xs text-[#111111] mt-2 font-medium">{uploadError}</p>
              )}

              {/* Uploaded Thumbnails */}
              {uploadedFiles.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 mt-3">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="relative group border border-[#E6E6E6] rounded-sm overflow-hidden bg-[#FAFAFA]">
                      <img src={file.url} alt={file.originalName} className="w-full h-16 object-cover" />
                      <button
                        type="button"
                        onClick={() => removeUploadedFile(idx)}
                        className="absolute top-1 right-1 p-0.5 bg-[#111111] text-white rounded-full opacity-80 hover:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {submitError && (
              <div className="p-3.5 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111]">
                {submitError}
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-6 border-t border-[#E6E6E6]">
            <button
              type="button"
              onClick={() => setCurrentScreen('REQUEST_TYPE')}
              className="text-xs uppercase tracking-[0.14em] text-[#5F5F5F] hover:text-[#111111] flex items-center space-x-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmitRequest}
              className="ethnoir-btn-primary flex items-center space-x-2"
            >
              {isSubmitting ? (
                <span>Processing...</span>
              ) : (
                <span>Submit Request</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- SCREEN 5: CONFIRMATION SCREEN ---------------- */}
      {currentScreen === 'CONFIRMATION' && (
        <div className="space-y-10 text-center max-w-lg mx-auto py-8">
          <div className="w-12 h-12 border border-[#111111] flex items-center justify-center mx-auto rounded-sm">
            <Check className="w-6 h-6 text-[#111111]" />
          </div>

          <div className="space-y-3">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#5F5F5F] block">
              Request Received
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-medium text-[#111111]">
              Your Request is Confirmed
            </h2>
            <p className="text-xs text-[#5F5F5F] leading-relaxed">
              We have generated your return case and notified our fulfillment team. A confirmation email has been dispatched.
            </p>
          </div>

          {/* Unique Request Number */}
          <div className="p-6 border border-[#111111] bg-[#FAFAFA] rounded-sm space-y-1">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block font-medium">
              Reference Identifier
            </span>
            <div className="font-mono text-2xl font-bold tracking-widest text-[#111111]">
              {createdRequestNumber}
            </div>
            <p className="text-[11px] text-[#8E8E8E] pt-1">
              Please quote this reference number in all future correspondence.
            </p>
          </div>

          {/* Status Timeline with Thin Black Line */}
          <div className="pt-6 border-t border-[#E6E6E6]">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block mb-6 font-medium">
              Next Milestones
            </span>
            <div className="relative flex justify-between items-center max-w-sm mx-auto">
              <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-[#111111] -translate-y-1/2 z-0" />
              {[
                { title: 'Submitted', active: true },
                { title: 'Review', active: false },
                { title: 'Pickup', active: false },
                { title: 'Complete', active: false },
              ].map((step, idx) => (
                <div key={idx} className="relative z-10 flex flex-col items-center bg-white px-2">
                  <div
                    className={`w-3.5 h-3.5 rounded-full border border-[#111111] ${
                      step.active ? 'bg-[#111111]' : 'bg-white'
                    }`}
                  />
                  <span className="text-[10px] text-[#111111] uppercase tracking-wider mt-2 font-medium">
                    {step.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <button
              onClick={() => {
                if (createdRequestNumber) {
                  onViewRequest(createdRequestNumber);
                }
              }}
              className="ethnoir-btn-primary"
            >
              Track Request
            </button>
            <button
              onClick={() => {
                setCurrentScreen('WELCOME');
                setOrder(null);
                setCreatedRequestNumber(null);
                setSelectedItems({});
                setUploadedFiles([]);
              }}
              className="ethnoir-btn-outline"
            >
              Return Another Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

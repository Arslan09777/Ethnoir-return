import React, { useState } from 'react';
import {
  RotateCcw,
  RefreshCw,
  Upload,
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  ShoppingBag,
  MapPin,
  ShieldCheck,
  Calendar,
  AlertCircle
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

interface PickupAddressState {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email?: string;
}

interface CustomerPortalProps {
  onViewRequest: (requestNumber: string, contact: string) => void;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({ onViewRequest }) => {
  // Screens: 'WELCOME' | 'ORDER_RESULT' | 'REQUEST_TYPE' | 'REASON_DETAILS' | 'PICKUP_CONFIRMATION' | 'CONFIRMATION'
  const [currentScreen, setCurrentScreen] = useState<
    'WELCOME' | 'ORDER_RESULT' | 'REQUEST_TYPE' | 'REASON_DETAILS' | 'PICKUP_CONFIRMATION' | 'CONFIRMATION'
  >('WELCOME');

  // Lookup State
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

  // Pickup Address State
  const [pickupAddress, setPickupAddress] = useState<PickupAddressState>({
    name: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: ''
  });
  const [addressValidationError, setAddressValidationError] = useState<string | null>(null);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdRequestNumber, setCreatedRequestNumber] = useState<string | null>(null);

  // 1. Order Lookup
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !emailOrPhone.trim()) {
      setLookupError('Please enter both your Order Number and registered Email or Mobile Number.');
      return;
    }

    setIsLoading(true);
    setLookupError(null);

    try {
      const res = await fetch('/api/customer/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), emailOrPhone: emailOrPhone.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Order lookup failed.');
      }

      setOrder(data.order);
      setEligibility(data.eligibility);

      // Pre-fill pickup address from order shipping address
      const shipAddr = data.order.shippingAddress || {};
      setPickupAddress({
        name: shipAddr.name || data.order.customer.name || '',
        address1: shipAddr.address1 || '',
        address2: shipAddr.address2 || '',
        city: shipAddr.city || '',
        state: shipAddr.province || '',
        pincode: shipAddr.zip || '',
        phone: data.order.customer.phone || shipAddr.phone || emailOrPhone.trim(),
        email: data.order.customer.email || (emailOrPhone.includes('@') ? emailOrPhone.trim() : '')
      });

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
      } else {
        setSelectedItems({});
      }

      setCurrentScreen('ORDER_RESULT');
    } catch (err: any) {
      setLookupError(err.message || 'Unable to retrieve order. Please verify your details.');
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

  // Update item quantity
  const handleQuantityChange = (itemId: string, qty: number, maxQty: number) => {
    if (qty < 1 || qty > maxQty) return;
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        quantity: qty
      }
    }));
  };

  // Photo Upload Handler with MIME and extension validation
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Disallow executable files and validate extensions
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    for (let i = 0; i < files.length; i++) {
      const name = files[i].name.toLowerCase();
      const isAllowed = allowedExtensions.some(ext => name.endsWith(ext));
      if (!isAllowed) {
        setUploadError('Only image files (JPEG, PNG, WEBP, HEIC) are permitted. Executable files are strictly blocked.');
        return;
      }
      if (files[i].size > 5 * 1024 * 1024) {
        setUploadError(`File "${files[i].name}" exceeds the maximum allowed size of 5MB.`);
        return;
      }
    }

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
        throw new Error(data.message || 'Upload failed.');
      }

      setUploadedFiles(prev => [...prev, ...data.files]);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const removeUploadedFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  // Validate pickup address before proceeding to final submission
  const handleProceedToPickup = () => {
    setCurrentScreen('PICKUP_CONFIRMATION');
  };

  const validateAndSubmit = () => {
    setAddressValidationError(null);

    // Validate Contact Name
    if (!pickupAddress.name || pickupAddress.name.trim().length < 2) {
      setAddressValidationError('Please enter a valid recipient / contact name.');
      return;
    }

    // Validate Address 1
    if (!pickupAddress.address1 || pickupAddress.address1.trim().length < 5) {
      setAddressValidationError('Please enter a complete pickup address (House/Flat, Street).');
      return;
    }

    // Validate City & State
    if (!pickupAddress.city || !pickupAddress.state) {
      setAddressValidationError('Please provide City and State for courier routing.');
      return;
    }

    // Validate Indian PIN Code: 6 digits, non-zero starting
    const pinRegex = /^[1-9][0-9]{5}$/;
    if (!pinRegex.test(pickupAddress.pincode.trim())) {
      setAddressValidationError('Please enter a valid 6-digit Indian PIN code (e.g. 394210).');
      return;
    }

    // Validate Indian Mobile: 10 digits
    const cleanPhone = pickupAddress.phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      setAddressValidationError('Please enter a valid 10-digit Indian mobile number for courier pickup coordination.');
      return;
    }

    handleSubmitRequest();
  };

  // Submit Final Request
  const handleSubmitRequest = async () => {
    if (!order) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        orderId: order.id,
        requestType,
        reason,
        customerNotes,
        refundMethod: requestType === 'RETURN_REFUND' ? refundMethod : undefined,
        pickupAddress: {
          ...pickupAddress,
          pincode: pickupAddress.pincode.trim(),
          phone: pickupAddress.phone.trim()
        },
        items: Object.values(selectedItems).map(sel => ({
          orderItemId: sel.orderItemId,
          quantity: sel.quantity,
          reason,
          replacementVariantId: sel.replacementVariantId,
          replacementVariantTitle: sel.replacementVariantTitle
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
        throw new Error(data.message || 'Submission failed. Please try again.');
      }

      setCreatedRequestNumber(data.requestNumber);
      setCurrentScreen('CONFIRMATION');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCount = Object.keys(selectedItems).length;
  const totalRefundEstimate = Object.values(selectedItems).reduce((sum, sel) => {
    const it = order?.items.find(i => i.id === sel.orderItemId);
    return sum + (it ? it.price * sel.quantity : 0);
  }, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      {/* ---------------- SCREEN 1: WELCOME & LOOKUP ---------------- */}
      {currentScreen === 'WELCOME' && (
        <div className="space-y-12">
          {/* Header */}
          <div className="text-center space-y-4 max-w-xl mx-auto">
            <span className="text-[11px] font-medium tracking-[0.25em] uppercase text-[#5F5F5F] block">
              Client Services
            </span>
            <h1 className="font-serif text-3xl sm:text-5xl font-medium text-[#111111] tracking-tight">
              Returns &amp; Replacements
            </h1>
            <p className="text-sm text-[#5F5F5F] leading-relaxed">
              We offer complimentary doorstep pickup and size exchanges within 7 days of delivery.
              Please provide your order details to begin.
            </p>
          </div>

          {/* Policy Banner */}
          <div className="max-w-md mx-auto p-4 border border-[#E6E6E6] bg-[#FAFAFA] text-xs text-[#5F5F5F] flex items-start space-x-3 rounded-sm">
            <ShieldCheck className="w-4 h-4 text-[#111111] flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-[#111111] block uppercase tracking-wider text-[10px]">
                Ethnoir 7-Day Guarantee
              </span>
              <p>
                Garments must be unworn, unwashed and returned with original security tags and designer packaging intact.
              </p>
            </div>
          </div>

          {/* Lookup Form */}
          <div className="max-w-md mx-auto border border-[#E6E6E6] p-6 sm:p-8 bg-white shadow-sm rounded-sm">
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
                    placeholder="e.g. ET-1124 or 1124"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    className="w-full ethnoir-input pl-8"
                    required
                  />
                </div>
                <span className="text-[10px] text-[#8E8E8E] mt-1 block">
                  Found on your order confirmation email or invoice
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
                  Email Address or Mobile Number
                </label>
                <input
                  type="text"
                  placeholder="name@domain.com or +91..."
                  value={emailOrPhone}
                  onChange={e => setEmailOrPhone(e.target.value)}
                  className="w-full ethnoir-input"
                  required
                />
                <span className="text-[10px] text-[#8E8E8E] mt-1 block">
                  Must match the contact provided at checkout
                </span>
              </div>

              {lookupError && (
                <div className="p-3.5 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111] leading-relaxed flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-[#111111] flex-shrink-0 mt-0.5" />
                  <span>{lookupError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full ethnoir-btn-primary flex items-center justify-center space-x-2 pt-3 pb-3"
              >
                {isLoading ? (
                  <span>Verifying Order with Store...</span>
                ) : (
                  <span>Find My Order</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- SCREEN 2: ORDER RESULT SCREEN ---------------- */}
      {currentScreen === 'ORDER_RESULT' && order && (
        <div className="space-y-8">
          {/* Header Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E6E6E6]">
            <div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block font-medium">
                Verified Order
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-medium text-[#111111]">
                Order #{order.orderNumber}
              </h2>
              <p className="text-xs text-[#5F5F5F] mt-1">
                Placed on {new Date(order.createdAt).toLocaleDateString()} • {order.customer.email || order.customer.phone}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[10px] uppercase tracking-[0.14em] text-[#5F5F5F] block">
                Fulfillment Status
              </span>
              <span className="badge-approved mt-0.5 inline-block">
                {order.fulfillmentStatus || 'DELIVERED'}
              </span>
              {eligibility && (
                <p className="text-[11px] text-[#5F5F5F] mt-1">
                  {eligibility.daysRemaining} days remaining in return window
                </p>
              )}
            </div>
          </div>

          {/* Ineligibility Warning */}
          {eligibility && !eligibility.isEligible && (
            <div className="p-4 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111] space-y-1">
              <span className="font-semibold uppercase tracking-wider block">Return Notice</span>
              {eligibility.reasons.map((r, i) => (
                <p key={i} className="text-[#5F5F5F]">• {r}</p>
              ))}
            </div>
          )}

          {/* Products List */}
          <div className="space-y-4">
            <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
              Select Item(s) to Return or Exchange
            </span>

            {order.items.map(item => {
              const isSelected = Boolean(selectedItems[item.id]);
              const currentQty = selectedItems[item.id]?.quantity || 1;

              return (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 border transition-all rounded-sm flex flex-col sm:flex-row items-start gap-4 sm:gap-6 ${
                    !item.isEligible
                      ? 'border-[#E6E6E6] opacity-60 bg-[#FAFAFA]'
                      : isSelected
                      ? 'border-[#111111] bg-[#FAFAFA]'
                      : 'border-[#E6E6E6] hover:border-[#111111] bg-[#FFFFFF]'
                  }`}
                >
                  <div className="flex items-start gap-4 flex-1">
                    {/* Checkbox */}
                    <div
                      onClick={() => toggleItemSelection(item)}
                      className="pt-1 cursor-pointer"
                    >
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

                    {/* Product Image */}
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
                    <div className="space-y-1 text-left">
                      <h3 className="font-serif text-base sm:text-lg font-medium text-[#111111] leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[#5F5F5F]">
                        {item.variantTitle || 'Standard Edition'} {item.sku ? `• SKU: ${item.sku}` : ''}
                      </p>
                      <p className="text-xs text-[#111111] font-medium">
                        Unit Price: ₹{item.price.toLocaleString('en-IN')}
                      </p>

                      {!item.isEligible && (
                        <p className="text-[11px] text-[#8E8E8E] font-medium pt-1">
                          {item.ineligibilityReason || 'Not eligible for return under current policy'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Quantity selector if selected */}
                  {isSelected && item.availableUnits > 1 && (
                    <div className="sm:self-center flex items-center space-x-2 pt-2 sm:pt-0">
                      <span className="text-[11px] uppercase tracking-wider text-[#5F5F5F]">Qty:</span>
                      <select
                        value={currentQty}
                        onChange={e => handleQuantityChange(item.id, parseInt(e.target.value, 10), item.availableUnits)}
                        className="ethnoir-input py-1 px-2 text-xs"
                      >
                        {Array.from({ length: item.availableUnits }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
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

      {/* ---------------- SCREEN 3: RESOLUTION TYPE SCREEN ---------------- */}
      {currentScreen === 'REQUEST_TYPE' && (
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block">
              Step 2 of 4
            </span>
            <h2 className="font-serif text-3xl font-medium text-[#111111]">
              Select Resolution Type
            </h2>
            <p className="text-xs text-[#5F5F5F]">
              Choose whether you wish to return for a refund or request an alternate size / variant exchange.
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
                  Send your item back via complimentary doorstep courier pickup and receive your refund to your original payment method or store credit.
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
                  Replacement / Exchange
                </h3>
                <p className="text-xs text-[#5F5F5F] leading-relaxed">
                  Exchange for another available size or variant. A forward courier dispatch will be initiated upon quality verification.
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

      {/* ---------------- SCREEN 4: REASON & DETAILS SCREEN ---------------- */}
      {currentScreen === 'REASON_DETAILS' && (
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block">
              Step 3 of 4
            </span>
            <h2 className="font-serif text-3xl font-medium text-[#111111]">
              Reason &amp; Additional Details
            </h2>
            <p className="text-xs text-[#5F5F5F]">
              Provide details to ensure accurate verification and rapid courier dispatch.
            </p>
          </div>

          <div className="space-y-6">
            {/* Reason Select */}
            <div>
              <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
                Primary Reason for Return / Exchange
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
                            {v.title} {v.inStock ? `(In Stock - ${v.inventoryQuantity} available)` : '(Out of Stock)'}
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
                Customer Comments (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Specific comments or feedback regarding your return or exchange..."
                value={customerNotes}
                onChange={e => setCustomerNotes(e.target.value)}
                className="w-full ethnoir-input text-xs resize-none"
              />
            </div>

            {/* Photo Upload Area */}
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
              onClick={handleProceedToPickup}
              className="ethnoir-btn-primary flex items-center space-x-2"
            >
              <span>Confirm Pickup Address</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ---------------- SCREEN 5: ADDRESS & PICKUP CONFIRMATION ---------------- */}
      {currentScreen === 'PICKUP_CONFIRMATION' && order && (
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block">
              Step 4 of 4
            </span>
            <h2 className="font-serif text-3xl font-medium text-[#111111]">
              Address &amp; Pickup Confirmation
            </h2>
            <p className="text-xs text-[#5F5F5F]">
              Review your reverse pickup address and confirm the return summary before submitting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Address Edit Form */}
            <div className="md:col-span-2 space-y-5 border border-[#E6E6E6] p-6 bg-white rounded-sm">
              <div className="flex items-center space-x-2 pb-3 border-b border-[#E6E6E6]">
                <MapPin className="w-4 h-4 text-[#111111]" />
                <h3 className="text-xs font-semibold tracking-wider uppercase text-[#111111]">
                  Doorstep Courier Pickup Location
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                    Contact Person Name *
                  </label>
                  <input
                    type="text"
                    value={pickupAddress.name}
                    onChange={e => setPickupAddress(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full ethnoir-input text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                    Contact Mobile Number *
                  </label>
                  <input
                    type="tel"
                    placeholder="10-digit Indian phone"
                    value={pickupAddress.phone}
                    onChange={e => setPickupAddress(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full ethnoir-input text-xs"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                    Address Line 1 (Flat, House No, Street) *
                  </label>
                  <input
                    type="text"
                    value={pickupAddress.address1}
                    onChange={e => setPickupAddress(prev => ({ ...prev, address1: e.target.value }))}
                    className="w-full ethnoir-input text-xs"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                    Address Line 2 (Landmark, Sector - Optional)
                  </label>
                  <input
                    type="text"
                    value={pickupAddress.address2 || ''}
                    onChange={e => setPickupAddress(prev => ({ ...prev, address2: e.target.value }))}
                    className="w-full ethnoir-input text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    value={pickupAddress.city}
                    onChange={e => setPickupAddress(prev => ({ ...prev, city: e.target.value }))}
                    className="w-full ethnoir-input text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                    State *
                  </label>
                  <input
                    type="text"
                    value={pickupAddress.state}
                    onChange={e => setPickupAddress(prev => ({ ...prev, state: e.target.value }))}
                    className="w-full ethnoir-input text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                    PIN Code (6 digits) *
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. 394210"
                    value={pickupAddress.pincode}
                    onChange={e => setPickupAddress(prev => ({ ...prev, pincode: e.target.value }))}
                    className="w-full ethnoir-input text-xs font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                    Email for Updates (Optional)
                  </label>
                  <input
                    type="email"
                    value={pickupAddress.email || ''}
                    onChange={e => setPickupAddress(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full ethnoir-input text-xs"
                  />
                </div>
              </div>

              {addressValidationError && (
                <div className="p-3 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111] flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-[#111111] flex-shrink-0" />
                  <span>{addressValidationError}</span>
                </div>
              )}
            </div>

            {/* Final Order Review Summary */}
            <div className="border border-[#E6E6E6] p-6 bg-[#FAFAFA] rounded-sm space-y-4 text-xs">
              <h3 className="font-serif text-base font-semibold text-[#111111] pb-2 border-b border-[#E6E6E6]">
                Request Summary
              </h3>

              <div className="space-y-2">
                <div className="flex justify-between text-[#5F5F5F]">
                  <span>Order Reference</span>
                  <span className="font-mono text-[#111111]">#{order.orderNumber}</span>
                </div>
                <div className="flex justify-between text-[#5F5F5F]">
                  <span>Resolution Type</span>
                  <span className="font-medium text-[#111111]">
                    {requestType === 'REPLACEMENT' ? 'Replacement' : 'Return & Refund'}
                  </span>
                </div>
                {requestType === 'RETURN_REFUND' && (
                  <div className="flex justify-between text-[#5F5F5F]">
                    <span>Estimated Refund</span>
                    <span className="font-semibold text-[#111111]">
                      ₹{totalRefundEstimate.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[#5F5F5F]">
                  <span>Primary Reason</span>
                  <span className="text-[#111111]">{reason.replace('_', ' ')}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E6E6E6] space-y-2">
                <span className="text-[10px] uppercase tracking-wider text-[#5F5F5F] block font-semibold">
                  Items to Return:
                </span>
                {Object.values(selectedItems).map(sel => {
                  const it = order.items.find(i => i.id === sel.orderItemId);
                  if (!it) return null;
                  return (
                    <div key={sel.orderItemId} className="text-[#111111] flex justify-between">
                      <span className="truncate max-w-[160px]">{sel.quantity}x {it.title}</span>
                      <span>₹{(it.price * sel.quantity).toLocaleString('en-IN')}</span>
                    </div>
                  );
                })}
              </div>

              {submitError && (
                <div className="p-3 border border-[#111111] bg-white text-xs text-[#111111]">
                  {submitError}
                </div>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-6 border-t border-[#E6E6E6]">
            <button
              type="button"
              onClick={() => setCurrentScreen('REASON_DETAILS')}
              className="text-xs uppercase tracking-[0.14em] text-[#5F5F5F] hover:text-[#111111] flex items-center space-x-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={validateAndSubmit}
              className="ethnoir-btn-primary flex items-center space-x-2 pt-3 pb-3 px-8"
            >
              {isSubmitting ? (
                <span>Registering Request...</span>
              ) : (
                <span>Submit Return Request</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- SCREEN 6: CONFIRMATION SCREEN ---------------- */}
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
              We have generated your return case and notified our fulfillment team. A confirmation notification has been sent.
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
              Please quote this reference number in all future client correspondence.
            </p>
          </div>

          {/* Status Timeline */}
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
                { title: 'Completed', active: false },
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
                  onViewRequest(createdRequestNumber, emailOrPhone);
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

import React, { useState, useEffect } from 'react';
import {
  Search,
  Eye,
  Check,
  X,
  Truck,
  RotateCcw,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  ShieldAlert,
  Lock,
  LogOut
} from 'lucide-react';
import { ReturnRequestSummary, ReturnRequestDetail } from '../types.js';
import { supabase } from '../supabase.js';

interface AdminDashboardProps {
  onOpenSettings: () => void;
  isAdminLoggedIn: boolean;
  setIsAdminLoggedIn: (val: boolean) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onOpenSettings,
  isAdminLoggedIn,
  setIsAdminLoggedIn
}) => {
  // Supabase Auth & Authorization State
  const [authStatus, setAuthStatus] = useState<'CHECKING' | 'LOGIN' | 'ACCESS_DENIED' | 'AUTHORIZED'>('CHECKING');
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; role: string } | null>(null);
  const [deniedReason, setDeniedReason] = useState<string | null>(null);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Stats State
  const [stats, setStats] = useState({
    newRequests: 0,
    approvedRequests: 0,
    pickupPending: 0,
    receivedItems: 0,
    refundPending: 0,
    replacementPending: 0,
    totalCompleted: 0
  });

  // Table State
  const [requests, setRequests] = useState<ReturnRequestSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Selected Detail Modal
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestDetail, setRequestDetail] = useState<ReturnRequestDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reject reason dialog
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReasonText, setRejectionReasonText] = useState('');

  // Manual Tracking Dialog
  const [showTrackingDialog, setShowTrackingDialog] = useState(false);
  const [manualCourierName, setManualCourierName] = useState('');
  const [manualAwb, setManualAwb] = useState('');
  const [manualTrackingUrl, setManualTrackingUrl] = useState('');

  // Internal note input
  const [internalNoteText, setInternalNoteText] = useState('');

  // Authenticated fetch wrapper attaching Bearer token
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      setLoginError('Your session has expired. Please sign in again.');
      setAuthStatus('LOGIN');
      setIsAdminLoggedIn(false);
      throw new Error('Session expired');
    }
    return res;
  };

  // Check auth and authorize against admin_users table
  useEffect(() => {
    checkAuth();

    // Listen to Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setIsAdminLoggedIn(false);
        setAuthStatus('LOGIN');
        setCurrentUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Inactivity auto-logout (30 minutes of no user activity)
  useEffect(() => {
    let timeoutId: any;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      if (isAdminLoggedIn) {
        timeoutId = setTimeout(() => {
          handleLogout();
          setLoginError('Session timed out due to inactivity. Please sign in again.');
        }, 30 * 60 * 1000);
      }
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [isAdminLoggedIn]);

  const checkAuth = async () => {
    setAuthStatus('CHECKING');
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        setAuthStatus('LOGIN');
        setIsAdminLoggedIn(false);
        return;
      }

      // Check admin_users authorization under RLS
      const { data: adminRecord, error: dbError } = await supabase
        .from('admin_users')
        .select('user_id, email, role, is_active')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (dbError || !adminRecord) {
        setDeniedReason(`The account (${session.user.email}) is not registered in the administrator directory.`);
        setAuthStatus('ACCESS_DENIED');
        setIsAdminLoggedIn(false);
        return;
      }

      if (!adminRecord.is_active) {
        setDeniedReason(`The account (${session.user.email}) has been deactivated. Please contact the administrator.`);
        setAuthStatus('ACCESS_DENIED');
        setIsAdminLoggedIn(false);
        return;
      }

      const role = (adminRecord.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'manager') {
        setDeniedReason(`Access denied. Administrative role required (Current role: ${adminRecord.role}).`);
        setAuthStatus('ACCESS_DENIED');
        setIsAdminLoggedIn(false);
        return;
      }

      // Sync server session
      await fetch('/api/admin/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: session.access_token })
      });

      setCurrentUser({
        id: session.user.id,
        email: adminRecord.email || session.user.email || '',
        role: adminRecord.role
      });
      setAuthStatus('AUTHORIZED');
      setIsAdminLoggedIn(true);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      console.error('[Admin Auth Check Error]:', err);
      setAuthStatus('LOGIN');
      setIsAdminLoggedIn(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword
      });

      if (error || !data?.user || !data?.session) {
        throw new Error('Invalid email or password. Please verify your credentials.');
      }

      // Verify authorization in admin_users table
      const { data: adminRecord, error: dbError } = await supabase
        .from('admin_users')
        .select('user_id, email, role, is_active')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (dbError || !adminRecord) {
        setDeniedReason(`The account (${data.user.email}) is not authorized for administrative access.`);
        setAuthStatus('ACCESS_DENIED');
        setIsAdminLoggedIn(false);
        return;
      }

      if (!adminRecord.is_active) {
        setDeniedReason(`The account (${data.user.email}) has been deactivated. Please contact the administrator.`);
        setAuthStatus('ACCESS_DENIED');
        setIsAdminLoggedIn(false);
        return;
      }

      const role = (adminRecord.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'manager') {
        setDeniedReason(`Access denied. Administrative role required (Current role: ${adminRecord.role}).`);
        setAuthStatus('ACCESS_DENIED');
        setIsAdminLoggedIn(false);
        return;
      }

      // Sync server session cookie
      await fetch('/api/admin/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.session.access_token })
      });

      setCurrentUser({
        id: data.user.id,
        email: adminRecord.email || data.user.email || '',
        role: adminRecord.role
      });
      setAuthStatus('AUTHORIZED');
      setIsAdminLoggedIn(true);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      setLoginError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    } finally {
      setIsAdminLoggedIn(false);
      setAuthStatus('LOGIN');
      setCurrentUser(null);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await authFetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (typeFilter !== 'ALL') params.append('type', typeFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await authFetch(`/api/admin/requests?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminLoggedIn) {
      fetchRequests();
    }
  }, [statusFilter, typeFilter, isAdminLoggedIn]);

  const openDetail = async (id: string) => {
    setSelectedRequestId(id);
    setIsLoadingDetail(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/admin/requests/${id}`);
      if (res.ok) {
        const data = await res.json();
        setRequestDetail(data.request);
        setInternalNoteText(data.request.internalNotes || '');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Actions
  const handleApprove = async () => {
    if (!selectedRequestId) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/admin/requests/${selectedRequestId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setActionSuccess('Request approved successfully.');
      openDetail(selectedRequestId);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleReject = async () => {
    if (!selectedRequestId || !rejectionReasonText.trim()) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/admin/requests/${selectedRequestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: rejectionReasonText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setActionSuccess('Request marked as rejected.');
      setShowRejectDialog(false);
      openDetail(selectedRequestId);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleScheduleReversePickup = async () => {
    if (!selectedRequestId) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/admin/requests/${selectedRequestId}/schedule-pickup`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setActionSuccess(`Shiprocket reverse pickup booked! AWB: ${data.shipment.awbNumber}`);
      openDetail(selectedRequestId);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleMarkReceived = async () => {
    if (!selectedRequestId) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/admin/requests/${selectedRequestId}/mark-received`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setActionSuccess('Package marked as received at warehouse.');
      openDetail(selectedRequestId);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleProcessRefund = async () => {
    if (!selectedRequestId) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/admin/requests/${selectedRequestId}/process-refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: requestDetail?.refundMethod || 'ORIGINAL_PAYMENT' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setActionSuccess('Refund processed successfully via Shopify API.');
      openDetail(selectedRequestId);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleCreateReplacementShipment = async () => {
    if (!selectedRequestId) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/admin/requests/${selectedRequestId}/create-replacement`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setActionSuccess(`Replacement shipment created in Shiprocket! AWB: ${data.shipment.awbNumber}`);
      openDetail(selectedRequestId);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleCloseRequest = async () => {
    if (!selectedRequestId) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/admin/requests/${selectedRequestId}/close`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setActionSuccess('Request marked as Completed.');
      openDetail(selectedRequestId);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleRetryPickup = async () => {
    if (!selectedRequestId) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/admin/requests/${selectedRequestId}/retry-pickup`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setActionSuccess(`Reverse pickup retry initiated with Shiprocket! AWB: ${data.shipment.awbNumber || 'PENDING'}`);
      openDetail(selectedRequestId);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleAddManualTracking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestId) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/admin/requests/${selectedRequestId}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courierName: manualCourierName,
          awbNumber: manualAwb,
          trackingUrl: manualTrackingUrl
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setActionSuccess('Courier tracking details updated successfully.');
      setShowTrackingDialog(false);
      setManualCourierName('');
      setManualAwb('');
      setManualTrackingUrl('');
      openDetail(selectedRequestId);
      fetchStats();
      fetchRequests();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleSaveInternalNote = async () => {
    if (!selectedRequestId) return;
    try {
      await authFetch(`/api/admin/requests/${selectedRequestId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: internalNoteText })
      });
      setActionSuccess('Internal note recorded.');
      openDetail(selectedRequestId);
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  // Status Badge Helper using strict monochrome styles
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return <span className="badge-pending">{status.replace(/_/g, ' ')}</span>;
      case 'APPROVED':
      case 'PICKUP_SCHEDULED':
      case 'PICKED_UP':
      case 'REFUND_PROCESSED':
      case 'REPLACEMENT_SHIPPED':
        return <span className="badge-approved">{status.replace(/_/g, ' ')}</span>;
      case 'REJECTED':
        return <span className="badge-rejected">REJECTED</span>;
      case 'COMPLETED':
        return <span className="badge-completed">COMPLETED</span>;
      default:
        return <span className="badge-pending">{status}</span>;
    }
  };

  // 1. Session Checking Screen
  if (authStatus === 'CHECKING') {
    return (
      <div className="max-w-md mx-auto px-4 py-28 text-center space-y-4">
        <span className="font-serif text-2xl font-bold tracking-[0.25em] text-[#111111] uppercase block">
          ETHNOIR
        </span>
        <div className="flex items-center justify-center space-x-2 text-xs uppercase tracking-[0.16em] text-[#5F5F5F]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Verifying administrative session...</span>
        </div>
      </div>
    );
  }

  // 2. Access Denied Screen (Unauthorized user or inactive role)
  if (authStatus === 'ACCESS_DENIED') {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-left">
        <div className="border border-[#111111] p-8 sm:p-10 space-y-6 bg-white rounded-sm shadow-sm">
          <div className="flex items-center space-x-3 text-[#111111]">
            <ShieldAlert className="w-6 h-6 flex-shrink-0" />
            <h2 className="font-serif text-xl font-medium">Access Restricted</h2>
          </div>
          <p className="text-xs text-[#5F5F5F] leading-relaxed">
            {deniedReason || 'Your authenticated account does not possess administrator privileges for ETHNOIR. Management console access is restricted to authorized store operators.'}
          </p>
          <div className="pt-2">
            <button
              onClick={handleLogout}
              className="w-full ethnoir-btn-primary flex items-center justify-center space-x-2 text-xs py-2.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Supabase Auth Login Screen
  if (authStatus === 'LOGIN' || !isAdminLoggedIn) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-left">
        <div className="border border-[#E6E6E6] p-8 sm:p-10 space-y-8 bg-white rounded-sm shadow-sm">
          <div className="space-y-2 text-center">
            <span className="font-serif text-2xl font-bold tracking-[0.25em] text-[#111111] uppercase block">
              ETHNOIR
            </span>
            <span className="text-[10px] tracking-[0.2em] uppercase text-[#5F5F5F] block font-medium">
              Management Console
            </span>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
                Administrator Email
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="w-full ethnoir-input text-xs"
                placeholder="name@ethnoir.in"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#111111] mb-2">
                Password
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className="w-full ethnoir-input text-xs"
                required
                autoComplete="current-password"
              />
            </div>

            {loginError && (
              <div className="text-xs text-[#111111] p-3 border border-[#111111] bg-[#FAFAFA] flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full ethnoir-btn-primary flex items-center justify-center space-x-2"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10 bg-[#FFFFFF] text-[#111111]">
      {/* Title & Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4 pb-6 border-b border-[#E6E6E6]">
        <div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#5F5F5F] block font-medium">
            Management Console
          </span>
          <h1 className="font-serif text-3xl font-medium text-[#111111] tracking-tight mt-1">
            Returns &amp; Replacements
          </h1>
          {currentUser && (
            <p className="text-[11px] text-[#5F5F5F] mt-1 font-mono">
              {currentUser.email} • <span className="uppercase font-sans font-semibold text-[#111111]">{currentUser.role}</span>
            </p>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onOpenSettings}
            className="ethnoir-btn-secondary uppercase text-[10px] tracking-wider"
          >
            Policy Settings
          </button>
          <button
            onClick={handleLogout}
            className="text-xs uppercase tracking-wider text-[#5F5F5F] hover:text-[#111111] px-2 py-1"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Mixed Black & White Statistic Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Black Card with White Text */}
        <div className="bg-[#111111] text-white p-5 rounded-sm border border-[#111111] space-y-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 block font-medium">
            New Requests
          </span>
          <p className="font-serif text-3xl font-normal text-white">{stats.newRequests}</p>
        </div>

        {/* Card 2: White Card with Black Text */}
        <div className="bg-white text-[#111111] p-5 rounded-sm border border-[#E6E6E6] space-y-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-[#5F5F5F] block font-medium">
            Approved
          </span>
          <p className="font-serif text-3xl font-normal text-[#111111]">{stats.approvedRequests}</p>
        </div>

        {/* Card 3: Black Card with White Text */}
        <div className="bg-[#111111] text-white p-5 rounded-sm border border-[#111111] space-y-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 block font-medium">
            Pickup Pending
          </span>
          <p className="font-serif text-3xl font-normal text-white">{stats.pickupPending}</p>
        </div>

        {/* Card 4: White Card with Black Text */}
        <div className="bg-white text-[#111111] p-5 rounded-sm border border-[#E6E6E6] space-y-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-[#5F5F5F] block font-medium">
            Received
          </span>
          <p className="font-serif text-3xl font-normal text-[#111111]">{stats.receivedItems}</p>
        </div>

        {/* Card 5: Black Card with White Text */}
        <div className="bg-[#111111] text-white p-5 rounded-sm border border-[#111111] space-y-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 block font-medium">
            Refund Pending
          </span>
          <p className="font-serif text-3xl font-normal text-white">{stats.refundPending}</p>
        </div>

        {/* Card 6: White Card with Black Text */}
        <div className="bg-white text-[#111111] p-5 rounded-sm border border-[#E6E6E6] space-y-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-[#5F5F5F] block font-medium">
            Exchange Pending
          </span>
          <p className="font-serif text-3xl font-normal text-[#111111]">{stats.replacementPending}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 border-y border-[#E6E6E6]">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-[#5F5F5F] uppercase tracking-wider text-[10px] font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="ethnoir-input py-1.5 px-2.5 text-xs rounded-sm cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="PICKUP_SCHEDULED">Pickup Scheduled</option>
              <option value="PICKED_UP">Picked Up</option>
              <option value="RECEIVED_AT_WAREHOUSE">Received</option>
              <option value="REFUND_PROCESSED">Refund Processed</option>
              <option value="REPLACEMENT_SHIPPED">Replacement Shipped</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[#5F5F5F] uppercase tracking-wider text-[10px] font-semibold">Type:</span>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="ethnoir-input py-1.5 px-2.5 text-xs rounded-sm cursor-pointer"
            >
              <option value="ALL">All Types</option>
              <option value="RETURN_REFUND">Return &amp; Refund</option>
              <option value="REPLACEMENT">Replacement</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search Order # or Reference..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchRequests()}
            className="w-full sm:w-64 ethnoir-input py-1.5 text-xs pl-8"
          />
          <Search className="w-3.5 h-3.5 text-[#8E8E8E] absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Table with Thin Gray Borders and Generous Spacing */}
      <div className="border border-[#E6E6E6] rounded-sm overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAFAFA] text-[#111111] uppercase tracking-[0.14em] text-[10px] font-semibold border-b border-[#E6E6E6]">
              <tr>
                <th className="py-4 px-5">Reference</th>
                <th className="py-4 px-5">Order #</th>
                <th className="py-4 px-5">Customer</th>
                <th className="py-4 px-5">Resolution</th>
                <th className="py-4 px-5">Items</th>
                <th className="py-4 px-5">Status</th>
                <th className="py-4 px-5">Shiprocket AWB</th>
                <th className="py-4 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E6E6] text-[#111111]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#5F5F5F]">
                    Loading records...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#5F5F5F]">
                    No return requests found.
                  </td>
                </tr>
              ) : (
                requests.map(r => (
                  <tr key={r.id} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="py-4 px-5 font-mono font-medium text-[#111111]">
                      {r.requestNumber}
                    </td>
                    <td className="py-4 px-5 font-medium text-[#111111]">
                      {r.orderNumber}
                    </td>
                    <td className="py-4 px-5 truncate max-w-[150px] text-[#5F5F5F]">
                      {r.customerEmail}
                    </td>
                    <td className="py-4 px-5">
                      <span className="text-[11px] uppercase tracking-wider text-[#111111] font-medium">
                        {r.requestType === 'REPLACEMENT' ? 'Replacement' : 'Return'}
                      </span>
                    </td>
                    <td className="py-4 px-5 truncate max-w-[180px] text-[#5F5F5F]">
                      {r.itemsSummary}
                    </td>
                    <td className="py-4 px-5">
                      {renderStatusBadge(r.status)}
                    </td>
                    <td className="py-4 px-5 font-mono text-[11px] text-[#111111]">
                      {r.awbNumber || '—'}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => openDetail(r.id)}
                        className="text-xs uppercase tracking-wider font-semibold text-[#111111] hover:underline"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request Detail Modal */}
      {selectedRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-[#111111] rounded-sm w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 relative text-left">
            <button
              onClick={() => setSelectedRequestId(null)}
              className="absolute top-6 right-6 p-1 text-[#111111] hover:opacity-60"
            >
              <X className="w-5 h-5" />
            </button>

            {isLoadingDetail || !requestDetail ? (
              <div className="py-16 text-center text-[#5F5F5F]">
                <span>Loading request details...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header info */}
                <div className="border-b border-[#E6E6E6] pb-4">
                  <div className="flex items-center space-x-3">
                    <h2 className="font-mono text-2xl font-bold text-[#111111]">
                      {requestDetail.requestNumber}
                    </h2>
                    {renderStatusBadge(requestDetail.status)}
                  </div>
                  <p className="text-xs text-[#5F5F5F] mt-1">
                    Shopify Order #{requestDetail.order.orderNumber} • Customer: {requestDetail.order.customerEmail} • {requestDetail.order.customerPhone || 'No Phone'}
                  </p>
                </div>

                {/* Alerts */}
                {actionError && (
                  <div className="p-3 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111]">
                    {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div className="p-3 border border-[#111111] bg-[#FAFAFA] text-xs text-[#111111]">
                    {actionSuccess}
                  </div>
                )}

                {/* Items in Request */}
                <div className="space-y-3">
                  <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
                    Product Details
                  </span>
                  <div className="space-y-2">
                    {requestDetail.returnItems.map(it => (
                      <div key={it.id} className="p-3.5 border border-[#E6E6E6] rounded-sm flex items-center justify-between text-xs bg-[#FAFAFA]">
                        <div className="flex items-center space-x-3">
                          {it.orderItem.imageUrl && (
                            <img src={it.orderItem.imageUrl} className="w-12 h-14 object-cover border border-[#E6E6E6]" />
                          )}
                          <div>
                            <span className="font-serif text-sm font-medium text-[#111111] block">{it.orderItem.title}</span>
                            <span className="text-[#5F5F5F] block">{it.orderItem.variantTitle}</span>
                            <span className="text-[#8E8E8E] text-[11px]">Qty: {it.quantity} • Reason: {requestDetail.reason}</span>
                          </div>
                        </div>
                        <div className="text-right font-medium text-[#111111]">
                          ₹{(it.refundAmount || 0).toLocaleString('en-IN')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Replacement Details if any */}
                {requestDetail.requestType === 'REPLACEMENT' && requestDetail.replacementItems.length > 0 && (
                  <div className="p-4 border border-[#111111] bg-[#FAFAFA] text-xs space-y-1">
                    <span className="font-semibold uppercase tracking-wider block text-[#111111]">
                      Requested Replacement Variant
                    </span>
                    {requestDetail.replacementItems.map(rep => (
                      <p key={rep.id} className="text-[#5F5F5F]">
                        {rep.quantity}x {rep.title} ({rep.variantTitle}) • Shopify Status: {rep.inStock ? 'In Stock' : 'Out of Stock'}
                      </p>
                    ))}
                  </div>
                )}

                {/* Uploaded Photos Gallery */}
                {requestDetail.uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
                      Customer Uploaded Proof
                    </span>
                    <div className="grid grid-cols-4 gap-3">
                      {requestDetail.uploadedFiles.map(file => (
                        <a
                          key={file.id}
                          href={file.filePath}
                          target="_blank"
                          rel="noreferrer"
                          className="border border-[#E6E6E6] rounded-sm overflow-hidden block hover:border-[#111111] transition-colors"
                        >
                          <img src={file.filePath} alt={file.originalName} className="w-full h-20 object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customer Notes */}
                {requestDetail.customerNotes && (
                  <div className="p-3 border border-[#E6E6E6] rounded-sm text-xs bg-[#FAFAFA]">
                    <span className="text-[10px] uppercase tracking-wider text-[#5F5F5F] block font-semibold mb-1">
                      Customer Note
                    </span>
                    <p className="text-[#111111]">{requestDetail.customerNotes}</p>
                  </div>
                )}

                {/* Confirmed Pickup Address */}
                {requestDetail.pickupAddressJson && (
                  <div className="p-3.5 border border-[#E6E6E6] rounded-sm text-xs bg-[#FAFAFA] space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-[#5F5F5F] block font-semibold">
                      Confirmed Doorstep Pickup Address
                    </span>
                    {(() => {
                      try {
                        const addr = JSON.parse(requestDetail.pickupAddressJson);
                        return (
                          <div className="text-[#111111]">
                            <p className="font-medium">{addr.name} • {addr.phone}</p>
                            <p className="text-[#5F5F5F]">{addr.address1} {addr.address2 || ''}</p>
                            <p className="text-[#5F5F5F]">{addr.city}, {addr.state} - {addr.pincode}</p>
                          </div>
                        );
                      } catch {
                        return <p className="text-[#5F5F5F]">{requestDetail.pickupAddressJson}</p>;
                      }
                    })()}
                  </div>
                )}

                {/* Workflow Actions */}
                <div className="pt-4 border-t border-[#E6E6E6] space-y-3">
                  <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
                    Operational Actions
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {/* Approve */}
                    {requestDetail.status === 'SUBMITTED' && (
                      <button
                        onClick={handleApprove}
                        className="ethnoir-btn-primary py-2 px-4 text-xs"
                      >
                        Approve Request
                      </button>
                    )}

                    {/* Reject */}
                    {(requestDetail.status === 'SUBMITTED' || requestDetail.status === 'APPROVED') && (
                      <button
                        onClick={() => setShowRejectDialog(true)}
                        className="ethnoir-btn-outline py-2 px-4 text-xs"
                      >
                        Reject Request
                      </button>
                    )}

                    {/* Schedule Reverse Pickup via Shiprocket */}
                    {(requestDetail.status === 'APPROVED' || requestDetail.status === 'SUBMITTED') &&
                      !requestDetail.shipments.some(s => s.type === 'REVERSE_PICKUP' && s.status !== 'FAILED') && (
                        <button
                          onClick={handleScheduleReversePickup}
                          className="ethnoir-btn-primary py-2 px-4 text-xs flex items-center space-x-1.5"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Schedule Reverse Pickup (Shiprocket)</span>
                        </button>
                      )}

                    {/* Retry Reverse Pickup */}
                    {requestDetail.shipments.some(s => s.type === 'REVERSE_PICKUP' && s.status === 'FAILED') && (
                      <button
                        onClick={handleRetryPickup}
                        className="ethnoir-btn-primary py-2 px-4 text-xs flex items-center space-x-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Reverse Pickup (Shiprocket)</span>
                      </button>
                    )}

                    {/* Mark Received */}
                    {(requestDetail.status === 'PICKUP_SCHEDULED' || requestDetail.status === 'PICKED_UP' || requestDetail.status === 'APPROVED') && (
                      <button
                        onClick={handleMarkReceived}
                        className="ethnoir-btn-secondary uppercase text-[10px] tracking-wider"
                      >
                        Mark Item Received
                      </button>
                    )}

                    {/* Process Refund */}
                    {requestDetail.requestType === 'RETURN_REFUND' &&
                      requestDetail.refundStatus !== 'PROCESSED' && (
                        <button
                          onClick={handleProcessRefund}
                          className="ethnoir-btn-primary py-2 px-4 text-xs"
                        >
                          Process Refund (₹{requestDetail.refundAmount})
                        </button>
                      )}

                    {/* Create Replacement Forward Shipment */}
                    {requestDetail.requestType === 'REPLACEMENT' &&
                      !requestDetail.shipments.some(s => s.type === 'FORWARD_REPLACEMENT') && (
                        <button
                          onClick={handleCreateReplacementShipment}
                          className="ethnoir-btn-primary py-2 px-4 text-xs"
                        >
                          Dispatch Replacement (Shiprocket)
                        </button>
                      )}

                    {/* Add Tracking Details */}
                    <button
                      onClick={() => setShowTrackingDialog(true)}
                      className="ethnoir-btn-outline py-2 px-4 text-xs"
                    >
                      Add / Update Tracking
                    </button>

                    {/* Close */}
                    {requestDetail.status !== 'COMPLETED' && (
                      <button
                        onClick={handleCloseRequest}
                        className="ethnoir-btn-secondary uppercase text-[10px] tracking-wider"
                      >
                        Close Request
                      </button>
                    )}
                  </div>
                </div>

                {/* Internal Admin Notes */}
                <div className="pt-4 border-t border-[#E6E6E6] space-y-2">
                  <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
                    Staff Internal Notes
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={internalNoteText}
                      onChange={e => setInternalNoteText(e.target.value)}
                      placeholder="Add private staff note..."
                      className="flex-1 ethnoir-input text-xs"
                    />
                    <button
                      onClick={handleSaveInternalNote}
                      className="ethnoir-btn-secondary uppercase text-[10px] tracking-wider"
                    >
                      Save Note
                    </button>
                  </div>
                </div>

                {/* Vertical Status Timeline */}
                <div className="pt-4 border-t border-[#E6E6E6] space-y-3">
                  <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#111111] block">
                    Vertical Status Audit Trail
                  </span>
                  <div className="space-y-4 pl-3 border-l border-[#111111]">
                    {requestDetail.statusEvents.map(ev => (
                      <div key={ev.id} className="text-xs pl-3 relative">
                        <div className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-[#111111]" />
                        <p className="font-medium text-[#111111]">{ev.message}</p>
                        <span className="text-[10px] text-[#8E8E8E] block mt-0.5">
                          {new Date(ev.createdAt).toLocaleString()} • {ev.actorType} ({ev.actorName || 'System'})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#111111] rounded-sm max-w-md w-full p-6 space-y-4 text-left">
            <h3 className="font-serif text-xl font-medium text-[#111111]">
              Reject Return Request
            </h3>
            <p className="text-xs text-[#5F5F5F]">
              Provide justification for declining this request. An automated client notice will be transmitted.
            </p>
            <textarea
              rows={3}
              value={rejectionReasonText}
              onChange={e => setRejectionReasonText(e.target.value)}
              placeholder="e.g. Return window expired, garment tags detached, or item worn..."
              className="w-full ethnoir-input text-xs"
              required
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="text-xs uppercase tracking-wider text-[#5F5F5F] px-3 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="ethnoir-btn-primary py-2 px-4 text-xs"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Tracking Dialog */}
      {showTrackingDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#111111] rounded-sm max-w-md w-full p-6 space-y-4 text-left">
            <h3 className="font-serif text-xl font-medium text-[#111111]">
              Add Courier Tracking Details
            </h3>
            <p className="text-xs text-[#5F5F5F]">
              Record courier partner and AWB tracking details for this return or replacement shipment.
            </p>
            <form onSubmit={handleAddManualTracking} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                  Courier Partner Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Delhivery, Blue Dart, DTDC"
                  value={manualCourierName}
                  onChange={e => setManualCourierName(e.target.value)}
                  className="w-full ethnoir-input text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                  AWB Tracking Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 14238910293"
                  value={manualAwb}
                  onChange={e => setManualAwb(e.target.value)}
                  className="w-full ethnoir-input text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#111111] mb-1">
                  Tracking URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={manualTrackingUrl}
                  onChange={e => setManualTrackingUrl(e.target.value)}
                  className="w-full ethnoir-input text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTrackingDialog(false)}
                  className="text-xs uppercase tracking-wider text-[#5F5F5F] px-3 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ethnoir-btn-primary py-2 px-4 text-xs"
                >
                  Save Tracking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

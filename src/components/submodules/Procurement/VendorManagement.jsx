// src/components/submodules/Procurement/VendorManagement.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';
import Button from '../../ui/button';  // Default import
import { Card } from '../../ui/card';
import Input from '../../ui/Input';  // Correct import statement for default export
import Label from '../../ui/Label';

// keep local skeleton used across the app
const SkeletonLine = ({ w = 'w-40', h = 'h-5' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${w} ${h}`} />
);

import logo from '../../../assets/logo.png';
import {
  Building2,
  Plus,
  Search,
  Save,
  Trash2,
  Edit,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  Star,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Printer,
  FileText,
  Hash,
  Tags,
  Clock3,
  Info,
  Sparkles,
} from 'lucide-react';

const CATEGORIES = [
  'Raw Materials',
  'Packaging Materials',
  'Miscellaneous Items',
  'Spare Parts',
  'Equipment',
];
const PAGE_SIZES = [10, 25, 50];

const emptyVendor = {
  vendor_code: '',
  name: '',
  category: 'Raw Materials',
  contact_person: '',
  email: '',
  phone: '',
  gstin: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
  payment_terms: 'Net 30',
  lead_time_days: 7,
  rating: 3,
  status: 'Active',
  notes: '',
};

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));

// pills
const Badge = ({ status }) => {
  const cls =
    status === 'Active'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : 'bg-gray-100 text-gray-700 border border-gray-300';
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
};

// tiny white chip for header
const WhiteChip = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2 py-[2px] text-[11px] border border-white/70 shadow-sm">
    {children}
  </span>
);

/* ------------------------------ Printable ------------------------------ */
const PrintableVendor = React.forwardRef(({ row }, ref) => {
  if (!row) return null;
  return (
    <div id="print-root" ref={ref}>
      <div className="rx-sheet bg-white text-black">
        {/* Letterhead */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b">
          <div className="flex items-center gap-3">
            <img src={logo} alt="DigitizerX" className="w-10 h-10 object-contain" />
            <div className="text-[16pt] font-semibold leading-tight">DigitizerX</div>
          </div>
          <div className="text-[9pt] opacity-70 text-right">
            <div className="font-medium">Vendor Details</div>
            <div>Printed: {new Date().toLocaleString()}</div>
          </div>
        </div>

        {/* Body */}
        <div className="rx-grid text-[10.5pt] leading-6">
          {/* Identity */}
          <div className="section">
            <div className="font-semibold mb-1">Identity</div>
            <div>
              <span className="rx-label">Vendor Code</span>
              <span>: {row.vendor_code || '—'}</span>
            </div>
            <div>
              <span className="rx-label">Name</span>
              <span>: {row.name}</span>
            </div>
            <div>
              <span className="rx-label">Category</span>
              <span>: {row.category}</span>
            </div>
            <div>
              <span className="rx-label">Status</span>
              <span>: {row.status}</span>
            </div>
            <div>
              <span className="rx-label">Rating</span>
              <span>: {Number(row.rating || 0)}/5</span>
            </div>
          </div>

          {/* Contact */}
          <div className="section">
            <div className="font-semibold mb-1">Contact</div>
            <div>
              <span className="rx-label">Contact Person</span>
              <span>: {row.contact_person || '—'}</span>
            </div>
            <div>
              <span className="rx-label">Email</span>
              <span>: {row.email || '—'}</span>
            </div>
            <div>
              <span className="rx-label">Phone</span>
              <span>: {row.phone || '—'}</span>
            </div>
            <div>
              <span className="rx-label">GSTIN</span>
              <span>: {row.gstin || '—'}</span>
            </div>
          </div>

          {/* Address */}
          <div className="col-span-2 section">
            <div className="font-semibold mb-1">Address</div>
            <div>{row.address1 || '—'}</div>
            <div>{row.address2 || ''}</div>
            <div>
              {[
                row.city,
                row.state,
                row.postal_code,
              ]
                .filter(Boolean)
                .join(', ') || '—'}
            </div>
            <div>{row.country || '—'}</div>
          </div>

          {/* Commercial & Notes */}
          <div className="section">
            <div className="font-semibold mb-1">Commercial</div>
            <div>
              <span className="rx-label">Payment Terms</span>
              <span>: {row.payment_terms || '—'}</span>
            </div>
            <div>
              <span className="rx-label">Lead Time</span>
              <span>
                : {row.lead_time_days ? String(row.lead_time_days) + ' days' : '—'}
              </span>
            </div>
          </div>
          <div className="section">
            <div className="font-semibold mb-1">Notes</div>
            <div className="whitespace-pre-wrap">{row.notes || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
});
PrintableVendor.displayName = 'PrintableVendor';

/* ------------------------------ main ------------------------------ */
const VendorManagement = () => {
  const { user } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('All');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // Add/Edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyVendor });

  // Quick Edit palette (hidden searchable dropdown)
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [quickVal, setQuickVal] = useState('');

  const [previewRow, setPreviewRow] = useState(null);
  const printRef = useRef(null);
  const loadToastId = useRef('vendors-load');

  const filters = useMemo(
    () => ({ q, category, status, page, pageSize }),
    [q, category, status, page, pageSize]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const load = async () => {
    setLoading(true);
    const p = (async () => {
      let query = supabase.from('vendors').select('*', { count: 'exact' });

      if (category !== 'All') {
        query = query.eq('category', category);
      }
      if (status !== 'All') {
        query = query.eq('status', status);
      }
      if (q.trim()) {
        const like = '%' + q.trim() + '%';
        query = query.or(
          'name.ilike.' + like + ',vendor_code.ilike.' + like + ',email.ilike.' + like
        );
      }

      query = query
        .order('updated_at', { ascending: false })
        .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      setRows(data || []);
      setTotal(count || 0);
      return 'Loaded ' + String(count || 0) + ' vendors';
    })();

    toast.promise(
      p,
      {
        loading: 'Loading vendors...',
        success: (m) => m,
        error: (e) => e.message || 'Failed to load vendors',
      },
      { id: loadToastId.current }
    );

    try {
      await p;
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ ...emptyVendor });
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({ ...emptyVendor, ...row });
    setFormOpen(true);
  };

  const validate = () => {
    if (!form.name.trim()) {
      toast.error('Vendor name is required');
      return false;
    }
    if (!CATEGORIES.includes(form.category)) {
      toast.error('Pick a valid category');
      return false;
    }
    if (form.email && !isEmail(form.email)) {
      toast.error('Email looks invalid');
      return false;
    }
    return true;
  };

  const save = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!validate()) return;

    const payload = {
      ...form,
      lead_time_days: parseInt(form.lead_time_days || 0, 10),
      rating: parseInt(form.rating || 0, 10),
      created_by: user?.id || null,
    };

    const p = (async () => {
      if (editingId) {
        const { error } = await supabase
          .from('vendors')
          .update(payload)
          .eq('id', editingId)
          .select()
          .single();
        if (error) throw error;
        return 'updated';
      } else {
        const { error } = await supabase
          .from('vendors')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return 'created';
      }
    })();

    toast
      .promise(p, {
        loading: 'Saving...',
        success: (m) => 'Vendor ' + m,
        error: (e) => e.message || 'Save failed',
      })
      .then(() => {
        setFormOpen(false);
        resetForm();
        load();
      })
      .catch(() => {});
  };

  const remove = (row) => {
    const p = (async () => {
      const { error } = await supabase.from('vendors').delete().eq('id', row.id);
      if (error) throw error;
      return 'deleted';
    })();

    toast
      .promise(p, {
        loading: 'Deleting...',
        success: 'Vendor deleted',
        error: (e) => e.message || 'Delete failed',
      })
      .then(() => load())
      .catch(() => {});
  };

  const toggleStatus = (row) => {
    const next = row.status === 'Active' ? 'Inactive' : 'Active';
    const p = (async () => {
      const { error } = await supabase
        .from('vendors')
        .update({ status: next })
        .eq('id', row.id);
      if (error) throw error;
      return next;
    })();

    toast
      .promise(p, {
        loading: 'Updating...',
        success: (s) => 'Marked ' + s,
        error: (e) => e.message || 'Update failed',
      })
      .then(() => load())
      .catch(() => {});
  };

  const openPreview = (row) => {
    setPreviewRow(row);
  };

  const printRow = (row) => {
    setPreviewRow(row);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const nextPage = () => setPage((p) => Math.min(totalPages, p + 1));
  const prevPage = () => setPage((p) => Math.max(1, p - 1));

  // Quick Edit: find by code or name (case-insensitive)
  const quickGo = () => {
    const val = (quickVal || '').trim().toLowerCase();
    if (!val) {
      toast.error('Type name or code');
      return;
    }
    const row =
      rows.find((r) => (r.vendor_code || '').toLowerCase() === val) ||
      rows.find((r) => (r.name || '').toLowerCase().includes(val));
    if (!row) {
      toast.error('No match in current list');
      return;
    }
    openEdit(row);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Gradient brand header (sticky) */}
      <div className="sticky top-0 z-20 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-4 md:px-6 py-3 flex items-center gap-3">
          <Building2 className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">Vendor Management</div>
          <div className="ml-auto flex items-center gap-2">
            <WhiteChip>
              <Info className="w-3 h-3" /> Blue accents
            </WhiteChip>
            <WhiteChip>
              <Sparkles className="w-3 h-3" /> Pro UI
            </WhiteChip>
          </div>
        </div>
      </div>

      {/* Print-only island */}
      <div className="screen-hidden">
        <PrintableVendor ref={printRef} row={previewRow} />
      </div>

      {/* Filters + Quick tools */}
      <Card className="p-4 no-print">
        <div className="grid lg:grid-cols-6 md:grid-cols-3 gap-3 items-end">
          {/* Search */}
          <div className="lg:col-span-2">
            <Label className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-500" />
              Search
            </Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-blue-600" />
              <Input
                className="pl-8"
                placeholder="name, email, code..."
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {/* Category (searchable) */}
          <div>
            <Label className="flex items-center gap-2">
              <Tags className="w-4 h-4 text-emerald-600" />
              Category
            </Label>
            <div className="relative">
              <Tags className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-emerald-600" />
              <Input
                list="categoryList"
                className="pl-8"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              />
              <datalist id="categoryList">
                <option>All</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Status (searchable) */}
          <div>
            <Label className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-600" />
              Status
            </Label>
            <div className="relative">
              <CheckCircle2 className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-purple-600" />
              <Input
                list="statusList"
                className="pl-8"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              />
              <datalist id="statusList">
                <option>All</option>
                <option>Active</option>
                <option>Inactive</option>
              </datalist>
            </div>
          </div>

          {/* Quick Edit toggle */}
          <div className="lg:col-span-2">
            <Label className="flex items-center gap-2">
              <Edit className="w-4 h-4 text-blue-700" />
              Quick Edit
            </Label>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowQuickEdit((s) => !s)}>
                {showQuickEdit ? 'Hide' : 'Open'}
              </Button>
              <Button onClick={openAdd}>
                <Plus className="w-4 h-4 mr-2" />
                Add Vendor
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Edit palette (hidden by default) */}
        {showQuickEdit && (
          <div className="mt-3 grid md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-blue-600" />
                <Input
                  list="vendorsList"
                  className="pl-8"
                  placeholder="Type vendor code or name to jump to Edit…"
                  value={quickVal}
                  onChange={(e) => setQuickVal(e.target.value)}
                />
                <datalist id="vendorsList">
                  {rows.map((r) => (
                    <option
                      key={r.id}
                      value={(r.vendor_code ? `${r.vendor_code} ` : '') + r.name}
                    />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={quickGo} className="inline-flex items-center">
                <Edit className="w-4 h-4 mr-2" />
                Edit Selected
              </Button>
              <Button variant="secondary" onClick={() => setQuickVal('')}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* footer controls */}
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setQ('');
              setCategory('All');
              setStatus('All');
              setPage(1);
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>

          <div className="ml-auto flex items-center gap-2 text-sm">
            <span>Rows</span>
            <select
              className="border rounded px-2 py-1"
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <Button size="icon" variant="ghost" onClick={prevPage}>
              <ChevronLeft />
            </Button>
            <span>
              {page}/{Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <Button size="icon" variant="ghost" onClick={nextPage}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>

      {/* Table (compact rows) */}
      <Card className="p-0 overflow-x-auto no-print">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Vendor Code</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Category</th>
              <th className="text-left p-2">Contact</th>
              <th className="text-left p-2">GSTIN</th>
              <th className="text-left p-2">Lead Time</th>
              <th className="text-left p-2">Rating</th>
              <th className="text-left p-2">Status</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={'s-' + String(i)} className="border-t">
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={`sk-${i}-${j}`} className="p-2">
                      <SkeletonLine w="w-full h-5" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center opacity-60">
                  No vendors
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((r) => (
                <tr key={r.id} className="border-t align-middle">
                  <td className="p-2">
                    <div className="flex items-center gap-1 text-sm">
                      <Hash className="w-4 h-4 text-blue-600" />
                      <span>{r.vendor_code || '—'}</span>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="font-medium">{r.name}</div>
                  </td>
                  <td className="p-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 border border-emerald-200">
                      {r.category}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col gap-1">
                      {r.contact_person && (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Building2 className="w-3 h-3" />
                          {r.contact_person}
                        </span>
                      )}
                      <div className="flex items-center gap-3">
                        {r.email && (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                            <Mail className="w-3 h-3" />
                            {r.email}
                          </span>
                        )}
                        {r.phone && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                            <Phone className="w-3 h-3" />
                            {r.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-2">{r.gstin || '—'}</td>
                  <td className="p-2">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="w-4 h-4 text-orange-600" />
                      {r.lead_time_days ? String(r.lead_time_days) + 'd' : '—'}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={
                            'w-4 h-4 ' +
                            (n <= Number(r.rating || 0)
                              ? 'fill-yellow-400 stroke-yellow-400'
                              : 'opacity-30')
                          }
                        />
                      ))}
                    </div>
                  </td>
                  <td className="p-2">
                    <Badge status={r.status} />
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Preview"
                        onClick={() => openPreview(r)}
                        className="inline-flex items-center"
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Print"
                        onClick={() => printRow(r)}
                        className="inline-flex items-center"
                      >
                        <Printer className="w-4 h-4 mr-1" />
                        Print
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleStatus(r)}
                        title={r.status === 'Active' ? 'Retire' : 'Activate'}
                        className="inline-flex items-center"
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        {r.status === 'Active' ? 'Retire' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => remove(r)}
                        className="inline-flex items-center"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      {/* Inline Preview (screen only) */}
      {previewRow && (
        <Card className="p-4 space-y-3 no-print">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="DigitizerX" className="w-8 h-8 object-contain" />
              <div>
                <div className="font-semibold">DigitizerX</div>
                <div className="text-xs opacity-70">Vendor Details Preview</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              <Button variant="secondary" onClick={() => setPreviewRow(null)}>
                Close
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div>
                <span className="font-semibold">Vendor Code:</span>{' '}
                {previewRow.vendor_code || '—'}
              </div>
              <div>
                <span className="font-semibold">Name:</span> {previewRow.name}
              </div>
              <div>
                <span className="font-semibold">Category:</span> {previewRow.category}
              </div>
              <div>
                <span className="font-semibold">Status:</span>{' '}
                <Badge status={previewRow.status} />
              </div>
              <div>
                <span className="font-semibold">Rating:</span>{' '}
                {Number(previewRow.rating || 0)}/5
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <span className="font-semibold">Contact Person:</span>{' '}
                {previewRow.contact_person || '—'}
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {previewRow.email || '—'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  {previewRow.phone || '—'}
                </span>
              </div>
              <div>
                <span className="font-semibold">GSTIN:</span> {previewRow.gstin || '—'}
              </div>
              <div>
                <span className="font-semibold">Lead Time:</span>{' '}
                {previewRow.lead_time_days
                  ? String(previewRow.lead_time_days) + ' days'
                  : '—'}
              </div>
            </div>

            <div className="md:col-span-2 space-y-1">
              <div className="font-semibold">Address</div>
              <div>{previewRow.address1 || '—'}</div>
              <div>{previewRow.address2 || ''}</div>
              <div className="inline-flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {[
                  previewRow.city,
                  previewRow.state,
                  previewRow.postal_code,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </div>
              <div>{previewRow.country || '—'}</div>
            </div>

            <div className="md:col-span-2 space-y-1">
              <div className="font-semibold">Payment Terms</div>
              <div>{previewRow.payment_terms || '—'}</div>
            </div>

            <div className="md:col-span-2 space-y-1">
              <div className="font-semibold">Notes</div>
              <div className="whitespace-pre-wrap">{previewRow.notes || '—'}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Add/Edit Modal (no scrolling needed) */}
      {formOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 no-print">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {editingId ? 'Edit Vendor' : 'Add Vendor'}
              </h2>
              <span className="ml-auto text-xs opacity-70">* Required fields</span>
            </div>

            <form onSubmit={save} className="mt-3">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-700" /> Name *
                  </Label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  />
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Tags className="w-4 h-4 text-emerald-700" /> Category *
                  </Label>
                  {/* searchable datalist keeps typing compact */}
                  <Input
                    list="catFormList"
                    value={form.category}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, category: e.target.value }))
                    }
                  />
                  <datalist id="catFormList">
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-indigo-700" /> Vendor Code
                  </Label>
                  <Input
                    value={form.vendor_code}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, vendor_code: e.target.value }))
                    }
                    placeholder="e.g., VND0101"
                  />
                </div>

                <div>
                  <Label>Contact Person</Label>
                  <Input
                    value={form.contact_person}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, contact_person: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <Label>Email</Label>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>GSTIN</Label>
                  <Input
                    value={form.gstin}
                    onChange={(e) => setForm((s) => ({ ...s, gstin: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>Lead Time (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.lead_time_days}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, lead_time_days: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <Label>Rating (1–5)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={form.rating}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, rating: e.target.value }))
                    }
                  />
                </div>

                <div className="md:col-span-3 grid md:grid-cols-3 gap-4">
                  <div>
                    <Label>Address 1</Label>
                    <Input
                      value={form.address1}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, address1: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Address 2</Label>
                    <Input
                      value={form.address2}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, address2: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input
                      value={form.city}
                      onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input
                      value={form.state}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, state: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Postal Code</Label>
                    <Input
                      value={form.postal_code}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, postal_code: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Input
                      value={form.country}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, country: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="md:col-span-3">
                  <Label>Payment Terms</Label>
                  <Input
                    value={form.payment_terms}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, payment_terms: e.target.value }))
                    }
                    placeholder="Net 30 / Net 45 / Advance"
                  />
                </div>

                <div className="md:col-span-3">
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-5 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setFormOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="inline-flex items-center">
                  <Save className="w-4 h-4 mr-2" />
                  {editingId ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style
        dangerouslySetInnerHTML={{
          __html:
            '.screen-hidden{display:none;} @media print{ .screen-hidden{display:block;} }' +
            '@media print{' +
            '@page{size:A4 portrait;margin:12mm;}' +
            'body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
            'body *{visibility:hidden !important;}' +
            '#print-root, #print-root *{visibility:visible !important;}' +
            '#print-root{position:absolute;left:0;top:0;width:100%;}' +
            'header,nav,aside,footer,.no-print{display:none !important;}' +
            '.rx-sheet{box-sizing:border-box;max-width:186mm;margin:0 auto;}' +
            '.rx-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:10mm;row-gap:6mm;}' +
            '.rx-label{display:inline-block;min-width:40mm;font-weight:600;}' +
            '.section{break-inside:avoid;}' +
            '}' +
            '.rx-sheet{max-width:900px;margin:0 auto;}',
        }}
      />
    </div>
  );
};

export default VendorManagement;

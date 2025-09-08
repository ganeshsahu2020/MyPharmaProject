// src/components/submodules/Masters/MaterialManagement.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../utils/supabaseClient";
import { useAuth } from "../../../contexts/AuthContext";
import toast from "react-hot-toast";
import Button from "../../ui/button"; // Default import for Button
import { Card } from "../../ui/card";
import Input from '../../ui/Input';  // Correct import statement for default export
import Label from '../../ui/Label';
import { Skeleton } from "../../ui/skeleton";
import {
  Plus,
  Save,
  RefreshCw,
  Search,
  Edit,
  Trash2,
  Package,
  Receipt,
  Layers,
  Filter,
  Info,
  ChevronLeft,
  ChevronRight,
  QrCode,
  Type,
  Boxes,
  FlaskConical,
  Ruler,
  BadgeCheck,
  Divide,
  ArrowLeftRight,
  ShieldCheck,
  Power,
  CalendarDays,
  Hourglass,
  Sparkles,
} from "lucide-react";

const CATEGORIES = ["Raw Material", "Packaging Material", "Miscellaneous Items"];
const STATUSES = ["Active", "Inactive"];

// Default presets (matches your migration)
const DEFAULT_SHELF_LIFE_MONTHS = 36;
const DEFAULT_RETEST_MONTHS = 12;

const BLANK_FORM = {
  uid: null,
  code: "",
  description: "",
  category: "Raw Material",
  base: "",
  uom: "",
  grade: "",
  numerator: 1,
  denominator: 1,
  conversion_uom: "",
  // Months-based presets
  shelf_life_months: DEFAULT_SHELF_LIFE_MONTHS,
  retest_interval_months: DEFAULT_RETEST_MONTHS,
  // Fallback for MFG date
  mfg_from_receipt: true,
  status: "Active",
};

const PAGE_SIZE = 20;

const StatusBadge = ({ value }) => {
  const v = value || "Active";
  const cls =
    v === "Active"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : "bg-rose-100 text-rose-700 border-rose-200";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${cls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          v === "Active" ? "bg-emerald-600" : "bg-rose-600"
        }`}
      />
      {v}
    </span>
  );
};

// --- helpers for months-based presets ---
const addMonths = (date, months = 0) => {
  const d = new Date(date);
  const m = Number(months) || 0;
  const day = d.getDate();
  d.setMonth(d.getMonth() + m);
  // normalize end-of-month rollover
  if (d.getDate() < day) d.setDate(0);
  return d;
};

const fmtDate = (d) =>
  isNaN(new Date(d)) ? "—" : new Date(d).toLocaleDateString();

const fmtMo = (mo) => {
  const n = Number(mo) || 0;
  if (!n) return "—";
  return `${n} mo`;
};

// convert legacy (years/days) to months (approx days/30)
const legacyToMonths = (years, days) =>
  (Number(years) || 0) * 12 + Math.round(((Number(days) || 0) / 30));

// tiny white chips (brand)
const WhiteChip = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 text-blue-800 px-2 py-[2px] text-[11px] border border-white/70 shadow-sm">
    {children}
  </span>
);

const MaterialManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth() || {};

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [data, setData] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const [form, setForm] = useState(BLANK_FORM);
  const [editing, setEditing] = useState(false);

  const [loading, setLoading] = useState(true);
  const firstLoadRef = useRef(false);

  const filters = useMemo(() => ({ q, cat, page }), [q, cat, page]);

  const load = async () => {
    setBusy(true);
    try {
      let query = supabase
        .from("materials")
        .select("*", { count: "exact" })
        .order("updated_at", { ascending: false });

      if (q?.trim()) {
        query = query.or(`code.ilike.%${q}%,description.ilike.%${q}%`);
      }
      if (cat !== "All") query = query.eq("category", cat);

      query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data: rows, error, count } = await toast.promise(query, {
        loading: "Loading materials…",
        success: (res) => `Loaded ${res?.data?.length || 0} item(s)`,
        error: "Failed to load materials",
      });

      if (error) throw error;

      setData(rows || []);
      setTotal(count || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
      if (!firstLoadRef.current) {
        firstLoadRef.current = true;
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const resetForm = () => {
    setForm(BLANK_FORM);
    setEditing(false);
  };

  const onEdit = (row) => {
    // prefer months columns; fallback to legacy year/day fields, then defaults
    const shelfMonths =
      row.shelf_life_months ??
      (row.expiry_years != null || row.expiry_days != null
        ? legacyToMonths(row.expiry_years, row.expiry_days)
        : DEFAULT_SHELF_LIFE_MONTHS);

    const retestMonths =
      row.retest_interval_months ??
      (row.retest_years != null || row.retest_days != null
        ? legacyToMonths(row.retest_years, row.retest_days)
        : DEFAULT_RETEST_MONTHS);

    setForm({
      uid: row.uid || row.id || null,
      code: row.code || "",
      description: row.description || "",
      category: row.category || "Raw Material",
      base: row.base || "",
      uom: row.uom || row.unit || "",
      grade: row.grade || "",
      numerator: Number(row.numerator || 1),
      denominator: Number(row.denominator || 1),
      conversion_uom: row.conversion_uom || "",
      shelf_life_months: Number.isFinite(Number(shelfMonths))
        ? Number(shelfMonths)
        : DEFAULT_SHELF_LIFE_MONTHS,
      retest_interval_months: Number.isFinite(Number(retestMonths))
        ? Number(retestMonths)
        : DEFAULT_RETEST_MONTHS,
      mfg_from_receipt: row.mfg_from_receipt !== false,
      status: row.status || "Active",
    });
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onDelete = async (row) => {
    const ok = window.confirm(`Delete ${row.code}? This cannot be undone.`);
    if (!ok) return;
    try {
      const p = supabase.from("materials").delete().eq("uid", row.uid);
      await toast.promise(p, {
        loading: "Deleting…",
        success: "Deleted",
        error: "Delete failed",
      });
      if (editing && form.uid === row.uid) resetForm();
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const setStatus = async (next) => {
    if (!form.uid) {
      toast.error("Select or save a material first");
      return;
    }
    if (form.status === next) {
      toast(`Already ${next}`);
      return;
    }
    try {
      const p = supabase
        .from("materials")
        .update({ status: next })
        .eq("uid", form.uid)
        .select()
        .single();

      const { data: saved, error } = await toast.promise(p, {
        loading: next === "Inactive" ? "Retiring..." : "Activating...",
        success: next === "Inactive" ? "Retired" : "Activated",
        error: "Status update failed",
      });
      if (error) throw error;

      setForm({ ...form, status: saved?.status || next });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const validate = () => {
    if (!form.code?.trim()) return "Material Code is required";
    if (!form.description?.trim()) return "Description is required";
    if (!form.uom?.trim()) return "UOM is required";
    if (!CATEGORIES.includes(form.category)) return "Invalid category";
    if (!STATUSES.includes(form.status)) return "Invalid status";

    const num = Number(form.numerator),
      den = Number(form.denominator);
    if (!Number.isFinite(num) || num <= 0) return "Numerator must be > 0";
    if (!Number.isFinite(den) || den <= 0) return "Denominator must be > 0";

    if (form.conversion_uom?.trim() && form.conversion_uom === form.uom)
      return "Conversion UOM must differ from UOM";

    if (Number(form.shelf_life_months) < 0)
      return "Shelf life (months) cannot be negative";
    if (Number(form.retest_interval_months) < 0)
      return "Retest interval (months) cannot be negative";

    return null;
  };

  const onSave = async (e) => {
    e?.preventDefault?.();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        description: form.description.trim(),
        category: form.category,
        base: form.base?.trim() || null,
        uom: form.uom.trim(),
        unit: form.uom.trim(), // keep older modules happy
        grade: form.grade?.trim() || null,
        numerator: Number(form.numerator),
        denominator: Number(form.denominator),
        conversion_uom: form.conversion_uom?.trim() || null,
        // months-based presets
        shelf_life_months: Number(form.shelf_life_months) || 0,
        retest_interval_months: Number(form.retest_interval_months) || 0,
        mfg_from_receipt: !!form.mfg_from_receipt,
        status: form.status,
        updated_by: user?.id || null,
      };
      if (!editing) payload.created_by = user?.id || null;

      const q = editing
        ? supabase
            .from("materials")
            .update(payload)
            .eq("uid", form.uid)
            .select()
            .single()
        : supabase.from("materials").insert(payload).select().single();

      const { data: saved, error } = await toast.promise(q, {
        loading: editing ? "Updating..." : "Saving...",
        success: editing ? "Updated" : "Saved",
        error: "Save failed",
      });
      if (error) throw error;

      setForm({ ...form, uid: saved?.uid });
      setEditing(true);
      load();
    } catch (ex) {
      console.error(ex);
    } finally {
      setSaving(false);
    }
  };

  const convString = useMemo(() => {
    if (!form.conversion_uom) return "";
    return `${form.numerator} ${form.conversion_uom} = ${form.denominator} ${form.uom}`;
  }, [form.numerator, form.denominator, form.uom, form.conversion_uom]);

  const shelfPreview = useMemo(() => {
    const today = new Date();
    const exp = addMonths(today, form.shelf_life_months);
    const ret = addMonths(today, form.retest_interval_months);
    return `If MFG = today → Expiry: ${fmtDate(exp)} · Retest: ${fmtDate(ret)}`;
  }, [form.shelf_life_months, form.retest_interval_months]);

  const gotoBOM = () => {
    if (!form.uid) {
      toast.error("Select or save a material first");
      return;
    }
    navigate(`/production/product-bom?material_uid=${form.uid}`);
  };

  const gotoInvoice = () => {
    if (!form.uid) {
      toast.error("Select or save a material first");
      return;
    }
    navigate(`/finance/invoice-management?material_uid=${form.uid}`);
  };

  const totalPages = Math.ceil((total || 0) / PAGE_SIZE) || 1;

  const FieldShell = ({ id, label, Icon, iconClass = "", children }) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon
          className={`absolute left-2 top-2.5 w-4 h-4 pointer-events-none ${iconClass}`}
        />
        {children}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[980px] px-4 md:px-6 py-4 md:py-6">
      {/* Brand header */}
      <div className="rounded-xl overflow-hidden mb-4">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-4 md:px-6 py-4 flex items-center gap-3">
          <Layers className="w-5 h-5 opacity-90" />
          <div className="text-lg font-semibold">Material Management</div>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            <WhiteChip>
              <Sparkles className="w-3 h-3" /> Pro UI
            </WhiteChip>
            <WhiteChip>Blue accents</WhiteChip>
            <WhiteChip>White chips</WhiteChip>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {loading ? (
            <Skeleton className="h-8 w-44 rounded" />
          ) : (
            <>
              <Layers className="w-6 h-6" />
              <h1 className="text-xl md:text-2xl font-semibold">Materials</h1>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => resetForm()}
            className="inline-flex items-center"
          >
            <Plus className="w-4 h-4 mr-1" />
            New
          </Button>
          <Button
            onClick={() => load()}
            disabled={busy}
            className="inline-flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Reload
          </Button>
        </div>
      </div>

      {/* Form */}
      <Card className="p-4 mb-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <form
            onSubmit={onSave}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <FieldShell
              id="code"
              label="Material Code *"
              Icon={QrCode}
              iconClass="text-blue-600"
            >
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g., RM-ACET-001"
                className="pl-8"
              />
            </FieldShell>

            <FieldShell
              id="description"
              label="Material Description *"
              Icon={Type}
              iconClass="text-emerald-600"
            >
              <Input
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="e.g., Acetaminophen USP"
                className="pl-8"
              />
            </FieldShell>

            <FieldShell
              id="category"
              label="Category *"
              Icon={Boxes}
              iconClass="text-violet-600"
            >
              <select
                id="category"
                className="w-full border rounded-md h-10 pr-8 pl-8"
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FieldShell>

            <FieldShell
              id="status"
              label="Status *"
              Icon={ShieldCheck}
              iconClass={form.status === "Active" ? "text-emerald-600" : "text-rose-600"}
            >
              <select
                id="status"
                className="w-full border rounded-md h-10 pr-8 pl-8"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value })
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FieldShell>

            <FieldShell
              id="base"
              label="Base"
              Icon={FlaskConical}
              iconClass="text-amber-600"
            >
              <Input
                id="base"
                value={form.base}
                onChange={(e) => setForm({ ...form, base: e.target.value })}
                placeholder="e.g., API, Excipient"
                className="pl-8"
              />
            </FieldShell>

            <FieldShell id="uom" label="UOM *" Icon={Ruler} iconClass="text-sky-600">
              <Input
                id="uom"
                value={form.uom}
                onChange={(e) => setForm({ ...form, uom: e.target.value })}
                placeholder="e.g., KG, L, PCS"
                className="pl-8"
              />
            </FieldShell>

            <FieldShell
              id="grade"
              label="Grade"
              Icon={BadgeCheck}
              iconClass="text-fuchsia-600"
            >
              <Input
                id="grade"
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
                placeholder="e.g., USP, BP, Pharma"
                className="pl-8"
              />
            </FieldShell>

            <FieldShell
              id="numerator"
              label="Numerator *"
              Icon={Divide}
              iconClass="text-rose-600"
            >
              <Input
                id="numerator"
                type="number"
                step="0.0001"
                value={form.numerator}
                onChange={(e) =>
                  setForm({ ...form, numerator: e.target.value })
                }
                className="pl-8"
              />
            </FieldShell>

            <FieldShell
              id="denominator"
              label="Denominator *"
              Icon={Divide}
              iconClass="text-orange-600"
            >
              <Input
                id="denominator"
                type="number"
                step="0.0001"
                value={form.denominator}
                onChange={(e) =>
                  setForm({ ...form, denominator: e.target.value })
                }
                className="pl-8"
              />
            </FieldShell>

            <FieldShell
              id="conv_uom"
              label="Conversion UOM"
              Icon={ArrowLeftRight}
              iconClass="text-teal-600"
            >
              <Input
                id="conv_uom"
                value={form.conversion_uom}
                onChange={(e) =>
                  setForm({ ...form, conversion_uom: e.target.value })
                }
                placeholder="e.g., G, ML, BOX"
                className="pl-8"
              />
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <Info className="w-3 h-3" />
                {convString || "Set a conversion if needed."}
              </div>
            </FieldShell>

            {/* Shelf life (Expiry) - months */}
            <FieldShell
              id="shelf"
              label="Default Shelf Life (Expiry)"
              Icon={CalendarDays}
              iconClass="text-indigo-600"
            >
              <div className="grid grid-cols-1 gap-2 pl-6 pr-2">
                <Input
                  type="number"
                  min="0"
                  placeholder="Months"
                  value={form.shelf_life_months}
                  onChange={(e) =>
                    setForm({ ...form, shelf_life_months: e.target.value })
                  }
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1 ml-6">
                Used when vendor Expiry is missing at GRN. Example: 36 = 3 years.
              </div>
            </FieldShell>

            {/* Retest interval - months */}
            <FieldShell
              id="retest"
              label="Default Retest Interval"
              Icon={Hourglass}
              iconClass="text-purple-600"
            >
              <div className="grid grid-cols-1 gap-2 pl-6 pr-2">
                <Input
                  type="number"
                  min="0"
                  placeholder="Months"
                  value={form.retest_interval_months}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      retest_interval_months: e.target.value,
                    })
                  }
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1 ml-6">
                Used when vendor Retest is missing at GRN. Example: 12 = 1 year.
              </div>
            </FieldShell>

            {/* MFG fallback toggle */}
            <div className="md:col-span-2">
              <Label className="mb-1 block">Manufactured Date Fallback</Label>
              <label className="flex items-center gap-2 pl-1">
                <input
                  type="checkbox"
                  checked={!!form.mfg_from_receipt}
                  onChange={(e) =>
                    setForm({ ...form, mfg_from_receipt: e.target.checked })
                  }
                />
                <span className="text-sm">
                  If vendor/manufacturer MFG date is missing at GRN, use the{" "}
                  <b>receipt date</b> as Manufactured Date.
                </span>
              </label>
              <div className="text-xs text-muted-foreground mt-1">
                {shelfPreview}
              </div>
            </div>

            <div className="md:col-span-2 flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="submit"
                disabled={saving}
                className="inline-flex items-center"
              >
                <Save className="w-4 h-4 mr-1" />
                {editing ? "Update" : "Save"}
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => gotoBOM()}
                className="inline-flex items-center"
              >
                <Package className="w-4 h-4 mr-1" />
                Open in Product BOM
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => gotoInvoice()}
                className="inline-flex items-center"
              >
                <Receipt className="w-4 h-4 mr-1" />
                Open in Invoice
              </Button>

              {form.status === "Active" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStatus("Inactive")}
                  className="inline-flex items-center"
                >
                  <Power className="w-4 h-4 mr-1" />
                  Retire
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStatus("Active")}
                  className="inline-flex items-center"
                >
                  <ShieldCheck className="w-4 h-4 mr-1" />
                  Activate
                </Button>
              )}
            </div>
          </form>
        )}
      </Card>

      {/* Filters */}
      <Card className="p-3 mb-4">
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600" />
            <Input
              className="pl-9"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
              placeholder="Search by code or description…"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-700" />
            <select
              className="border rounded-md h-10 px-3"
              value={cat}
              onChange={(e) => {
                setCat(e.target.value);
                setPage(0);
              }}
            >
              <option>All</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="p-3">Code</th>
              <th className="p-3">Description</th>
              <th className="p-3">Category</th>
              <th className="p-3">Status</th>
              <th className="p-3">Base</th>
              <th className="p-3">UOM</th>
              <th className="p-3">Grade</th>
              <th className="p-3">Numerator</th>
              <th className="p-3">Denominator</th>
              <th className="p-3">Conversion UOM</th>
              {/* Preset columns */}
              <th className="p-3">Shelf Life</th>
              <th className="p-3">Retest</th>
              <th className="p-3">MFG Fallback</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {busy || loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`s-${i}`} className="border-t">
                  {Array.from({ length: 14 }).map((__, j) => (
                    <td key={`s-${i}-${j}`} className="p-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length ? (
              data.map((row) => {
                const shelfMo =
                  row.shelf_life_months ??
                  legacyToMonths(row.expiry_years, row.expiry_days);
                const retestMo =
                  row.retest_interval_months ??
                  legacyToMonths(row.retest_years, row.retest_days);
                return (
                  <tr key={row.uid} className="border-t hover:bg-muted/20">
                    <td className="p-3 font-medium">{row.code}</td>
                    <td className="p-3">{row.description}</td>
                    <td className="p-3">{row.category}</td>
                    <td className="p-3">
                      <StatusBadge value={row.status} />
                    </td>
                    <td className="p-3">{row.base || "-"}</td>
                    <td className="p-3">{row.uom || row.unit}</td>
                    <td className="p-3">{row.grade || "-"}</td>
                    <td className="p-3">{row.numerator}</td>
                    <td className="p-3">{row.denominator}</td>
                    <td className="p-3">{row.conversion_uom || "-"}</td>
                    <td className="p-3">{fmtMo(shelfMo)}</td>
                    <td className="p-3">{fmtMo(retestMo)}</td>
                    <td className="p-3">
                      {row.mfg_from_receipt !== false ? "Receipt date" : "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onEdit(row)}
                          className="inline-flex items-center"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDelete(row)}
                          className="inline-flex items-center"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={14}
                  className="p-6 text-center text-muted-foreground"
                >
                  No materials found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Total: {total}</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 0}
            onClick={() => setPage((p) => p - 1)}
            className="inline-flex items-center"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm">
            Page {page + 1} / {Math.ceil((total || 0) / PAGE_SIZE) || 1}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= (Math.ceil((total || 0) / PAGE_SIZE) || 1)}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 text-xs text-muted-foreground flex items-center gap-2">
        <Package className="w-3 h-3" />
        GRN behavior (recommended): if vendor MFG/Expiry/Retest are missing,
        compute MFG = {`form.mfg_from_receipt ? receipt_date : PO date`} and then
        Expiry = MFG + {fmtMo(form.shelf_life_months)} · Retest = MFG +{" "}
        {fmtMo(form.retest_interval_months)}.
      </div>
    </div>
  );
};

export default MaterialManagement;

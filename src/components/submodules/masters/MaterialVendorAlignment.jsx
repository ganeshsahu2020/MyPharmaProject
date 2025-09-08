// src/components/submodules/Masters/MaterialVendorAlignment.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../utils/supabaseClient";
import toast from "react-hot-toast";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";

const CATEGORY_COLORS = {
  "Raw Materials": "border-amber-300 bg-amber-50 text-amber-800",
  "Packaging Materials": "border-sky-300 bg-sky-50 text-sky-800",
  Equipment: "border-violet-300 bg-violet-50 text-violet-800",
  "Spare Parts": "border-stone-300 bg-stone-50 text-stone-800",
  "Miscellaneous Items": "border-slate-300 bg-slate-50 text-slate-800",
  Unknown: "border-gray-300 bg-gray-50 text-gray-700",
};

const statusChipClass = (checked, status) => {
  const base =
    "inline-flex items-center gap-2 border rounded-full px-3 py-1 transition";
  if (checked) {
    return status === "Inactive"
      ? `${base} bg-gray-50 border-gray-300`
      : `${base} bg-emerald-50 border-emerald-300`;
  }
  return status === "Inactive"
    ? `${base} bg-white border-gray-200`
    : `${base} bg-white border-emerald-200`;
};

const statusDotClass = (status) =>
  status === "Inactive" ? "bg-gray-400" : "bg-emerald-500";

const checkboxAccent = (status) =>
  status === "Inactive" ? "accent-gray-500" : "accent-emerald-600";

const catPillClass = (category) => {
  const key = category || "Unknown";
  return `text-[10px] uppercase tracking-wide border rounded px-1.5 py-0.5 ${
    CATEGORY_COLORS[key] || CATEGORY_COLORS["Unknown"]
  }`;
};

const MaterialVendorAlignment = () => {
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [materialId, setMaterialId] = useState("");
  const [aligned, setAligned] = useState(new Set()); // vendor_id set

  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");

  const [statusFilter, setStatusFilter] = useState("all"); // 'all'|'Active'|'Inactive'
  const [catFilter, setCatFilter] = useState("all"); // 'all'|exact enum text

  useEffect(() => {
    (async () => {
      try {
        const [m, v] = await Promise.all([
          supabase.from("materials").select("id,code,name").order("code"),
          supabase
            .from("vendors")
            .select("id,code,name,status,category")
            .order("name"),
        ]);
        if (m.error) {
          throw m.error;
        }
        if (v.error) {
          throw v.error;
        }
        setMaterials(m.data || []);
        setVendors(v.data || []);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load masters");
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!materialId) {
        setAligned(new Set());
        return;
      }
      try {
        const { data, error } = await supabase
          .from("material_vendors")
          .select("vendor_id")
          .eq("material_id", materialId);
        if (error) {
          throw error;
        }
        setAligned(new Set((data || []).map((r) => r.vendor_id)));
      } catch (e) {
        console.error(e);
        toast.error("Failed to load alignments");
      }
    })();
  }, [materialId]);

  const filteredVendors = useMemo(() => {
    if (!materialId) return [];
    let list = vendors;

    // default: only aligned unless user toggles "Show all"
    if (!showAll) list = list.filter((v) => aligned.has(v.id));

    if (statusFilter !== "all") {
      list = list.filter((v) => (v.status || "") === statusFilter);
    }
    if (catFilter !== "all") {
      list = list.filter((v) => (v.category || "Unknown") === catFilter);
    }
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((v) =>
        `${v.code || ""} ${v.name || ""}`.toLowerCase().includes(s)
      );
    }
    return list;
  }, [vendors, aligned, showAll, materialId, q, statusFilter, catFilter]);

  const categoryCounts = useMemo(() => {
    const counts = new Map();
    filteredVendors.forEach((v) => {
      const key = v.category || "Unknown";
      counts.set(key, (counts.get(key) || 0) + (aligned.has(v.id) ? 1 : 0));
    });
    return counts;
  }, [filteredVendors, aligned]);

  const toggleVendor = async (vendorId, checked) => {
    if (!materialId) {
      toast.error("Select a material first");
      return;
    }
    try {
      if (checked) {
        const { error } = await supabase
          .from("material_vendors")
          .insert([{ material_id: materialId, vendor_id: vendorId }]);
        if (error) throw error;
        setAligned((prev) => new Set(prev).add(vendorId));
        toast.success("Aligned");
      } else {
        const { error } = await supabase
          .from("material_vendors")
          .delete()
          .eq("material_id", materialId)
          .eq("vendor_id", vendorId);
        if (error) throw error;
        setAligned((prev) => {
          const n = new Set(prev);
          n.delete(vendorId);
          return n;
        });
        toast.success("Unaligned");
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed");
    }
  };

  const categoryOptions = [
    "Raw Materials",
    "Packaging Materials",
    "Equipment",
    "Spare Parts",
    "Miscellaneous Items",
    "Unknown",
  ];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Vendor–Material Alignment</h1>

      <Card className="p-4 space-y-3">
        <div className="grid md:grid-cols-3 gap-4 items-end">
          <div>
            <Label>Material</Label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
            >
              <option value="">Select material</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} · {m.name}
                </option>
              ))}
            </select>
          </div>

          {materialId && (
            <>
              <div className="space-y-2">
                <div>
                  <Label>Search vendors</Label>
                  <Input
                    placeholder="code or name…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAll((s) => !s)}>
                    {showAll ? "Show aligned only" : "Show all vendors"}
                  </Button>
                  <select
                    className="border rounded px-2 py-2"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All status</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                  <select
                    className="border rounded px-2 py-2"
                    value={catFilter}
                    onChange={(e) => setCatFilter(e.target.value)}
                  >
                    <option value="all">All categories</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-sm opacity-70">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Active
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    Inactive
                  </span>
                  <span className="ml-3">{aligned.size} aligned</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Category counts row (visible after material selection) */}
        {materialId && (
          <div className="flex flex-wrap gap-2 pt-2">
            {categoryOptions.map((c) => {
              const count = categoryCounts.get(c) || 0;
              const cls = CATEGORY_COLORS[c] || CATEGORY_COLORS["Unknown"];
              return (
                <span key={c} className={`text-xs border rounded px-2 py-0.5 ${cls}`}>
                  {c}: {count}
                </span>
              );
            })}
          </div>
        )}

        {/* Vendor chips */}
        {!materialId ? (
          <div className="p-6 text-sm rounded border bg-muted/30">
            Pick a material to view its aligned vendors. The list stays hidden
            until a material is selected.
          </div>
        ) : (
          <div className="mt-3">
            <Label className="mb-2 block">
              {showAll ? "All vendors (filtered)" : "Vendors aligned"}
            </Label>

            {filteredVendors.length === 0 ? (
              <div className="p-6 text-sm rounded border bg-muted/30">
                {showAll
                  ? "No vendors match filters."
                  : "No vendors aligned yet. Use “Show all vendors” to add some."}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filteredVendors.map((v) => {
                  const checked = aligned.has(v.id);
                  return (
                    <label
                      key={v.id}
                      className={statusChipClass(checked, v.status)}
                    >
                      <input
                        type="checkbox"
                        className={checkboxAccent(v.status)}
                        checked={checked}
                        onChange={(e) => toggleVendor(v.id, e.target.checked)}
                      />
                      <span
                        className={`w-2 h-2 rounded-full ${statusDotClass(
                          v.status
                        )}`}
                      />
                      <span className="text-sm">{v.name}</span>
                      <span className={catPillClass(v.category)}>
                        {v.category || "Unknown"}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default MaterialVendorAlignment;

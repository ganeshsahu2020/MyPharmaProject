import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAlerts } from "../contexts/AlertContext";
import InboundPOFlow from "./InboundPOFlow";

import {
  Alert,
  AlertDescription,
  AlertTitle as AlertTitleComponent,
} from "./ui/alert";
import Button from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import {
  Search, ClipboardList, Layers, AlertCircle, Clock, Link as LinkIcon, Sparkles
} from "lucide-react";

/* ------- tiny local 'recent POs' store ------- */
const RECENT_KEY = "mflow.recent";
const getRecents = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)||"[]"); } catch { return []; }
};
const pushRecent = (po) => {
  try {
    const r = getRecents().filter(x=>x!==po);
    r.unshift(po);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0,6)));
  } catch {}
};

function StatusLegend() {
  return (
    <div className="rounded-xl mb-6 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-5 md:px-7 py-5 flex flex-wrap items-center gap-3">
        <div className="text-xl md:text-2xl font-semibold tracking-tight">
          Material Tracking Flow
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-blue-900 bg-white/95 px-2.5 py-1 rounded-full text-xs font-medium">
            Open
          </span>
          <span className="text-amber-900 bg-white/95 px-2.5 py-1 rounded-full text-xs font-medium">
            In-Process
          </span>
          <span className="text-green-900 bg-white/95 px-2.5 py-1 rounded-full text-xs font-medium">
            Completed/Posted
          </span>
          <span className="text-slate-900 bg-white/95 px-2.5 py-1 rounded-full text-xs font-medium">
            Closed
          </span>
        </div>
      </div>
    </div>
  );
}

const Dashboard = () => {
  const { session, role } = useAuth();
  const { alerts } = useAlerts();
  const alertCount = alerts.length;

  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState("");
  const [poNo, setPoNo] = useState("");
  const [recents, setRecents] = useState(getRecents());

  // read ?po= from URL on first mount
  useEffect(() => {
    const qp = searchParams.get("po");
    if (qp && !poNo) {
      setInput(qp);
      setPoNo(qp.trim());
      pushRecent(qp.trim());
      setRecents(getRecents());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    const v = String(input || "").trim();
    if (!v) return;
    setPoNo(v);
    pushRecent(v);
    setRecents(getRecents());
    // keep the URL shareable
    const next = new URLSearchParams(searchParams);
    next.set("po", v);
    setSearchParams(next, { replace: true });
  };

  const clearPo = () => {
    setPoNo("");
    setInput("");
    const next = new URLSearchParams(searchParams);
    next.delete("po");
    setSearchParams(next, { replace: true });
  };

  const copyLink = async () => {
    try {
      if (!poNo) return;
      const url = new URL(window.location.href);
      url.searchParams.set("po", poNo);
      await navigator.clipboard.writeText(url.toString());
    } catch {}
  };

  const showingTokens = useMemo(() => (poNo ? [poNo] : []), [poNo]);

  return (
    <div className="container mx-auto">
      <StatusLegend />

      {/* Top quick KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card className="border-blue-100">
          <CardContent className="py-4">
            <div className="text-[11px] uppercase text-slate-500">Signed in as</div>
            <div className="text-sm flex items-center gap-2 mt-1">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              <span className="font-medium">{session?.user?.email || "—"}</span>
            </div>
            <div className="text-xs mt-1 text-slate-600 flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" /> Role: <b>{role || "N/A"}</b>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-100">
          <CardContent className="py-4">
            <div className="text-[11px] uppercase text-slate-500">Alerts</div>
            <div className="text-2xl font-semibold leading-none mt-1">{alertCount}</div>
            <div className="text-xs text-slate-600 mt-1 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" /> Upcoming stamping reminders
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-100">
          <CardContent className="py-4">
            <div className="text-[11px] uppercase text-slate-500">Last viewed PO</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {recents.length ? recents.map(po => (
                <button
                  key={po}
                  className="px-2 py-1 text-xs rounded-md border bg-white hover:bg-slate-50"
                  onClick={()=>{ setInput(po); setPoNo(po); const next=new URLSearchParams(searchParams); next.set("po",po); setSearchParams(next,{replace:true}); }}
                >
                  {po}
                </button>
              )) : <span className="text-sm text-slate-500">—</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-semibold text-blue-800">
              Dashboard
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Alerts */}
            {alertCount > 0 && (
              <Alert variant="warning" className="mb-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitleComponent>Upcoming Stamping Alerts</AlertTitleComponent>
                <AlertDescription>
                  <ul className="list-disc ml-5 text-sm">
                    {alerts.map((a) => (
                      <li key={a.id}>
                        <strong>[{a.source}]</strong> {a.weightbox_id}{" "}
                        {a.standard_weight_id ? `- ${a.standard_weight_id}` : ""}{" "}
                        {a.area ? `- ${a.area}` : ""} - Due in {a.days_left} days (
                        {a.due_on})
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Search bar (PO only) */}
            <form onSubmit={handleSubmit} className="sticky top-3 z-10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-600 pointer-events-none" />
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoCapitalize="characters"
                  placeholder="Enter PO (e.g. MFI/25/PO/00069)"
                  className="w-full pl-10 pr-40 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  aria-label="Search PO"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2">
                  <Button type="button" variant="secondary" onClick={copyLink} disabled={!poNo}>
                    <LinkIcon className="h-4 w-4 mr-1"/> Link
                  </Button>
                  {poNo && (
                    <Button type="button" variant="secondary" onClick={clearPo}>
                      Clear
                    </Button>
                  )}
                  <Button type="submit" disabled={!input.trim()} className="px-4">
                    View
                  </Button>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5"/> Tip: Deep-link with <code>?po=…</code> in the URL.
              </div>
            </form>

            {/* Inbound flow */}
            <Card className="bg-gray-50 shadow-sm">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-slate-800">
                    Inbound Process Flow
                  </h3>
                  <div className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full border bg-white">
                    <Sparkles size={12}/> Live view
                  </div>
                </div>

                {!poNo ? (
                  <div className="space-y-3">
                    <Skeleton className="h-[44px] w-56 rounded" />
                    <Skeleton className="h-[52vh] w-full rounded" />
                    <div className="mt-3 text-xs text-slate-600">
                      Enter a PO above to view its flow.
                    </div>
                  </div>
                ) : (
                  <InboundPOFlow poNo={poNo} stageHeightVh={52} autoFetch />
                )}

                {!!showingTokens.length && (
                  <div className="mt-3 text-xs text-slate-600">
                    Showing flow for: <b>{showingTokens.join(", ")}</b>
                  </div>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;

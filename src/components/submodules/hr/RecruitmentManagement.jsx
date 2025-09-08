import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../../../utils/supabaseClient";
import { Card } from "../../ui/card";
import Button from "../../ui/button";                  // default import in your repo
import { Skeleton } from "../../ui/skeleton";         // shadcn skeleton in your repo

import {
  Briefcase,
  UserPlus,
  Users,
  Plus,
  Edit,
  Trash2,
  Search,
  UploadCloud,
  Download,
  CalendarClock,
  UserCircle2,
  Tag as TagIcon,
  Building2,
  MapPin,
  Calendar,
  ListChecks,
} from "lucide-react";

/* ---------------- constants ---------------- */
const JOB_STATUSES = ["open", "closed", "draft"];
const STAGES = ["screen", "interview", "offer", "hired", "rejected"];
const APP_STATUSES = ["active", "withdrawn", "rejected", "hired"];
const MODES = ["in_person", "phone", "video"];
const RESUME_BUCKET = "recruitment";

const fmtDate = (v) => (v ? new Date(v).toLocaleString() : "—");
const startOfMonth = () =>
  new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);
const endOfMonth = () =>
  new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

/* status badges */
const badge = (txt, tone = "gray") => {
  const map = {
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    green: "bg-green-100 text-green-700 border-green-200",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
    red: "bg-rose-100 text-rose-700 border-rose-200",
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    violet: "bg-violet-100 text-violet-700 border-violet-200",
    teal: "bg-teal-100 text-teal-700 border-teal-200",
  };
  return (
    <span className={`px-2 py-0.5 text-xs rounded border ${map[tone] || map.gray}`}>
      {txt}
    </span>
  );
};

const jobTone = (s) =>
  s === "open" ? "green" : s === "draft" ? "yellow" : s === "closed" ? "red" : "gray";
const appTone = (s) =>
  s === "active"
    ? "blue"
    : s === "hired"
    ? "green"
    : s === "withdrawn"
    ? "gray"
    : s === "rejected"
    ? "red"
    : "gray";

/* toast.promise helper that rejects on supabase error */
const tp = (promise, labels) =>
  toast.promise(
    promise.then((res) => {
      const err = res?.error;
      if (err) throw new Error(err.message || "Operation failed");
      return res?.data ?? true;
    }),
    labels
  );

/* ---------------- component ---------------- */
export default function RecruitmentManagement() {
  const loc = useLocation();

  // 🔓 demo write override (ON by default for now so all users can test)
  const writeOverride = useMemo(() => {
    try {
      const qp = new URLSearchParams(loc.search);
      if (["1", "true", "yes"].includes((qp.get("demo") || "").toLowerCase())) return true;
      if (["1", "true"].includes((qp.get("write") || "").toLowerCase())) return true;
      const ls = JSON.parse(localStorage.getItem("dx.recruitment.writeOverride") ?? "true");
      return !!ls;
    } catch {
      return true;
    }
  }, [loc.search]);

  // whoami (roles) – used when you later turn off demo mode
  const [who, setWho] = useState({ roles: [], loading: true });
  const canWrite = writeOverride || (who.roles || []).some((r) =>
    ["HR", "Admin", "Super Admin", "Manager"].includes(r)
  );

  /* masters */
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loadingMasters, setLoadingMasters] = useState(true);

  /* tabs & search */
  const [tab, setTab] = useState("jobs");
  const [search, setSearch] = useState("");

  /* range + stats */
  const [range, setRange] = useState({ start: startOfMonth(), end: endOfMonth() });
  const [stats, setStats] = useState({
    open_jobs: 0,
    new_candidates: 0,
    new_applications: 0,
    interviews_upcoming: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  /* jobs */
  const [jobs, setJobs] = useState([]);
  const [jobRoll, setJobRoll] = useState([]); // vw_job_rollup
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobOpen, setJobOpen] = useState(false);
  const [jobForm, setJobForm] = useState({
    id: null,
    title: "",
    department_uid: "",
    status: "open",
    post_date: "",
    close_date: "",
    location: "",
    tags: "",
    description: "",
    requirements: "",
  });
  const [tagFilter, setTagFilter] = useState("");

  /* candidates */
  const [cands, setCands] = useState([]);
  const [loadingCands, setLoadingCands] = useState(true);
  const [candOpen, setCandOpen] = useState(false);
  const fileRef = useRef(null);
  const [candForm, setCandForm] = useState({
    id: null,
    full_name: "",
    email: "",
    phone: "",
    source: "",
    tags: "",
    file: null,
  });

  /* applications */
  const [apps, setApps] = useState([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [appOpen, setAppOpen] = useState(false);
  const [appForm, setAppForm] = useState({
    id: null,
    job_id: "",
    candidate_id: "",
    stage: "screen",
    status: "active",
    notes: "",
  });

  /* interview rounds */
  const [rounds, setRounds] = useState([]);
  const [roundOpen, setRoundOpen] = useState(false);
  const [roundForm, setRoundForm] = useState({
    id: null,
    application_id: "",
    round_no: 1,
    scheduled_at: "",
    interviewer_uid: "",
    mode: "video",
    result: "pending",
    rating: null,
    feedback: "",
  });

  /* boot */
  useEffect(() => {
    (async () => {
      // whoami
      try {
        const { data } = await supabase.rpc("app_whoami");
        const row = Array.isArray(data) && data.length ? data[0] : data || {};
        setWho({ ...(row || {}), loading: false });
      } catch {
        setWho({ roles: [], loading: false });
      }
      // masters + lists
      await Promise.all([loadMasters(), reloadAll()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadAll() {
    await Promise.all([loadJobs(), loadRollups(), loadCands(), loadApps(), loadStats(range.start, range.end)]);
  }

  /* loaders */
  async function loadMasters() {
  // Departments (unchanged)
  const d = await supabase
    .from("department_master")
    .select("id,department_id,department_name")
    .order("department_id", { ascending: true });
  if (d.error) toast.error("Dept load failed");
  else setDepartments(d.data || []);

  // Employees — read from vw_user_management_ext_v2 (no schema changes required)
  const e = await supabase
    .from("vw_user_management_ext_v2")
    .select("user_id, employee_id, full_name, status")
    .order("employee_id", { ascending: true });

  const rows = (e.data || [])
    .filter((x) => (x.status || "Active") === "Active")
    .map((r) => {
      const first = (r.full_name || "").split(" ")[0] || "";
      const last  = (r.full_name || "").split(" ").slice(1).join(" ") || "";
      return {
        id: r.user_id,                 // keep same key name app already uses
        employee_id: r.employee_id,
        first_name: first,
        last_name: last,
        status: r.status || "Active",
      };
    });

  setEmployees(rows);
}

  async function loadJobs() {
    setLoadingJobs(true);
    try {
      const res = await supabase.from("vw_job_post_dx").select("*").order("created_at", { ascending: false });
      if (!res.error) { setJobs(res.data || []); return; }
      // fallback to base table if view missing
      const fb = await supabase.from("job_post").select("*").order("created_at", { ascending: false });
      setJobs(fb.data || []);
    } finally {
      setLoadingJobs(false);
    }
  }

  async function loadRollups() {
    const { data, error } = await supabase.from("vw_job_rollup_dx").select("*").order("post_date", { ascending: false });
    setJobRoll(error ? [] : data || []);
  }

  async function loadCands() {
    setLoadingCands(true);
    try {
      const { data, error } = await supabase.from("candidate").select("*").order("created_at", { ascending: false });
      setCands(error ? [] : data || []);
    } finally {
      setLoadingCands(false);
    }
  }

  async function loadApps() {
    setLoadingApps(true);
    try {
      const res = await supabase.from("vw_application_dx").select("*").order("applied_at", { ascending: false });
      setApps(res.error ? [] : res.data || []);
    } finally {
      setLoadingApps(false);
    }
  }

  async function loadRounds(application_id) {
    const { data, error } = await supabase
      .from("vw_interview_round_dx")
      .select("*")
      .eq("application_id", application_id)
      .order("round_no", { ascending: true });
    setRounds(error ? [] : data || []);
    return error ? [] : data || [];
  }

  async function loadStats(start, end) {
    setLoadingStats(true);
    try {
      const { data, error } = await supabase.rpc("recruitment_dashboard_stats", { p_start: start, p_end: end });
      const row =
        (Array.isArray(data) && data.length ? data[0] : data) ||
        { open_jobs: 0, new_candidates: 0, new_applications: 0, interviews_upcoming: 0 };
      setStats(error ? { open_jobs: 0, new_candidates: 0, new_applications: 0, interviews_upcoming: 0 } : row);
    } finally {
      setLoadingStats(false);
    }
  }

  /* ---------------- JOBS ---------------- */
  function openJobModal(blank = false) {
    setJobForm(
      blank
        ? {
            id: null,
            title: "",
            department_uid: "",
            status: "open",
            post_date: "",
            close_date: "",
            location: "",
            tags: "",
            description: "",
            requirements: "",
          }
        : jobForm
    );
    setJobOpen(true);
  }

  async function saveJob(e) {
    e?.preventDefault?.();
    if (!canWrite) return toast.error("Not authorized");
    if (!jobForm.title) return toast.error("Title required");

    const row = {
      title: jobForm.title,
      department_uid: jobForm.department_uid || null,
      status: jobForm.status || "open",
      post_date: jobForm.post_date || null,
      close_date: jobForm.close_date || null,
      location: jobForm.location || null,
      description: jobForm.description || null,
      requirements: jobForm.requirements || null,
      tags: (jobForm.tags || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    const q = jobForm.id
      ? supabase.from("job_post").update(row).eq("id", jobForm.id)
      : supabase.from("job_post").insert([row]);

    await tp(q, { loading: "Saving job…", success: "Job saved", error: (e) => e.message });
    setJobOpen(false);
    setJobForm({
      id: null,
      title: "",
      department_uid: "",
      status: "open",
      post_date: "",
      close_date: "",
      location: "",
      tags: "",
      description: "",
      requirements: "",
    });
    await Promise.all([loadJobs(), loadRollups()]);
  }

  function editJob(r) {
    setJobForm({ ...r, tags: (r.tags || []).join(", ") });
    setJobOpen(true);
  }

  async function delJob(id) {
    if (!canWrite) return toast.error("Not authorized");
    if (!window.confirm("Delete this job?")) return;
    await tp(supabase.from("job_post").delete().eq("id", id), {
      loading: "Deleting…",
      success: "Job deleted",
      error: (e) => e.message,
    });
    await Promise.all([loadJobs(), loadRollups()]);
  }

  /* ---------------- CANDIDATES ---------------- */
  function openCandModal(blank = false) {
    setCandForm(
      blank
        ? { id: null, full_name: "", email: "", phone: "", source: "", tags: "", file: null }
        : candForm
    );
    setCandOpen(true);
  }

  async function saveCandidate(e) {
    e?.preventDefault?.();
    if (!canWrite) return toast.error("Not authorized");
    if (!candForm.full_name) return toast.error("Full name required");

    let resume_path = null;
    const f = candForm.file || fileRef.current?.files?.[0] || null;
    if (f) {
      const safe = f.name.replace(/[^\w.\-]+/g, "_");
      const key = `${Date.now()}_${safe}`;
      await tp(
        supabase.storage.from(RESUME_BUCKET).upload(key, f, { upsert: false }),
        { loading: "Uploading resume…", success: "Uploaded", error: (e) => e.message }
      );
      const up = await supabase.storage.from(RESUME_BUCKET).upload(key, f, { upsert: false });
      if (!up.error) resume_path = up.data.path; // (tp already threw if error)
    }

    const row = {
      full_name: candForm.full_name,
      email: candForm.email || null,
      phone: candForm.phone || null,
      source: candForm.source || null,
      resume_path,
      tags: (candForm.tags || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    const q = candForm.id
      ? supabase.from("candidate").update(row).eq("id", candForm.id)
      : supabase.from("candidate").insert([row]);

    await tp(q, { loading: "Saving candidate…", success: "Candidate saved", error: (e) => e.message });
    setCandOpen(false);
    setCandForm({ id: null, full_name: "", email: "", phone: "", source: "", tags: "", file: null });
    if (fileRef.current) fileRef.current.value = "";
    await loadCands();
  }

  function editCandidate(r) {
    setCandForm({ ...r, tags: (r.tags || []).join(", "), file: null });
    setCandOpen(true);
  }

  async function delCandidate(id) {
    if (!canWrite) return toast.error("Not authorized");
    if (!window.confirm("Delete candidate?")) return;
    await tp(supabase.from("candidate").delete().eq("id", id), {
      loading: "Deleting…",
      success: "Candidate deleted",
      error: (e) => e.message,
    });
    await loadCands();
  }

  async function downloadResume(path) {
    try {
      const { data, error } = await supabase.storage.from(RESUME_BUCKET).createSignedUrl(path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      toast.error("Download failed");
    }
  }

  /* ---------------- APPLICATIONS ---------------- */
  function openAppModal(blank = false) {
    setAppForm(
      blank
        ? { id: null, job_id: "", candidate_id: "", stage: "screen", status: "active", notes: "" }
        : appForm
    );
    setAppOpen(true);
  }

  async function saveApplication(e) {
    e?.preventDefault?.();
    if (!canWrite) return toast.error("Not authorized");
    if (!appForm.job_id || !appForm.candidate_id) return toast.error("Job and Candidate required");

    const row = {
      job_id: appForm.job_id,
      candidate_id: appForm.candidate_id,
      stage: appForm.stage || "screen",
      status: appForm.status || "active",
      notes: appForm.notes || null,
    };
    const q = appForm.id
      ? supabase.from("application").update(row).eq("id", appForm.id)
      : supabase.from("application").insert([row]);

    await tp(q, { loading: "Saving application…", success: "Application saved", error: (e) => e.message });
    setAppOpen(false);
    setAppForm({ id: null, job_id: "", candidate_id: "", stage: "screen", status: "active", notes: "" });
    await Promise.all([loadApps(), loadRollups()]);
  }

  function editApplication(r) {
    setAppForm({ ...r });
    setAppOpen(true);
  }

  async function delApplication(id) {
    if (!canWrite) return toast.error("Not authorized");
    if (!window.confirm("Delete application?")) return;
    await tp(supabase.from("application").delete().eq("id", id), {
      loading: "Deleting…",
      success: "Application deleted",
      error: (e) => e.message,
    });
    await Promise.all([loadApps(), loadRollups()]);
  }

  /* ---------------- ROUNDS ---------------- */
  async function openRounds(app) {
    const list = await loadRounds(app.id);
    const nextNo = (Array.isArray(list) && list.length ? list[list.length - 1].round_no : 0) + 1;
    setRoundForm({
      id: null,
      application_id: app.id,
      round_no: nextNo,
      scheduled_at: "",
      interviewer_uid: "",
      mode: "video",
      result: "pending",
      rating: null,
      feedback: "",
    });
    setRoundOpen(true);
  }

  async function saveRound(e) {
    e?.preventDefault?.();
    if (!canWrite) return toast.error("Not authorized");
    if (!roundForm.application_id || !roundForm.round_no) return toast.error("App & round no required");

    const row = {
      application_id: roundForm.application_id,
      round_no: Number(roundForm.round_no),
      scheduled_at: roundForm.scheduled_at || null,
      interviewer_uid: roundForm.interviewer_uid || null,
      mode: roundForm.mode || null,
      result: roundForm.result || "pending",
      rating: roundForm.rating ? Number(roundForm.rating) : null,
      feedback: roundForm.feedback || null,
    };

    const q = roundForm.id
      ? supabase.from("interview_round").update(row).eq("id", roundForm.id)
      : supabase.from("interview_round").insert([row]);

    await tp(q, { loading: "Saving round…", success: "Round saved", error: (e) => e.message });
    const list = await loadRounds(roundForm.application_id);
    const nextNo = (Array.isArray(list) && list.length ? list[list.length - 1].round_no : 0) + 1;
    setRoundForm({
      id: null,
      application_id: roundForm.application_id,
      round_no: nextNo,
      scheduled_at: "",
      interviewer_uid: "",
      mode: "video",
      result: "pending",
      rating: null,
      feedback: "",
    });
  }

  async function delRound(id) {
    if (!canWrite) return toast.error("Not authorized");
    if (!window.confirm("Delete round?")) return;
    await tp(supabase.from("interview_round").delete().eq("id", id), {
      loading: "Deleting…",
      success: "Round deleted",
      error: (e) => e.message,
    });
    await loadRounds(roundForm.application_id);
  }

  /* -------- derived -------- */
  const allJobTags = useMemo(() => {
    const s = new Set();
    jobRoll.forEach((r) => (r.tags || []).forEach((t) => s.add((t || "").toLowerCase())));
    return Array.from(s).sort();
  }, [jobRoll]);

  const rollById = useMemo(() => Object.fromEntries(jobRoll.map((r) => [r.id, r])), [jobRoll]);

  const filteredJobs = useMemo(() => {
    let arr = jobs;
    if (tagFilter) {
      const tl = tagFilter.toLowerCase();
      const ids = new Set(
        jobRoll
          .filter((r) => Array.isArray(r.tags) && r.tags.map((t) => t.toLowerCase()).includes(tl))
          .map((r) => r.id)
      );
      arr = arr.filter((j) => ids.has(j.id));
    }
    if (!search.trim()) return arr;
    const q = search.toLowerCase();
    return arr.filter((j) => j.title?.toLowerCase().includes(q) || j.department_name?.toLowerCase().includes(q));
  }, [jobs, jobRoll, tagFilter, search]);

  const filteredCands = useMemo(() => {
    if (!search.trim()) return cands;
    const q = search.toLowerCase();
    return cands.filter((c) => c.full_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  }, [cands, search]);

  const filteredApps = useMemo(() => {
    if (!search.trim()) return apps;
    const q = search.toLowerCase();
    return apps.filter((a) => a.job_title?.toLowerCase().includes(q) || a.candidate_name?.toLowerCase().includes(q));
  }, [apps, search]);

  const empLabel = (e) => (e ? `${e.employee_id} — ${e.first_name} ${e.last_name}` : "—");

  /* ---------------- UI ---------------- */
  return (
    <div className="p-3">
      <Card className="p-0 overflow-hidden">
        {/* BRANDING HEADER (title only) */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 text-white px-4 py-3">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-white/90" />
            Recruitment
            {writeOverride && (
              <span className="ml-2 text-xs bg-white/20 rounded px-2 py-0.5">Demo edit ON</span>
            )}
          </h2>
        </div>

        {/* BODY */}
        <div className="p-3 space-y-3">
          {/* search + tabs */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="relative max-w-xl w-full">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
              <input
                className="w-full border rounded pl-8 pr-2 py-1.5 text-sm"
                placeholder="Search jobs, candidates, applications"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="inline-flex rounded border overflow-hidden self-start md:self-auto">
              <button
                onClick={() => setTab("jobs")}
                className={`px-3 py-1.5 text-sm ${tab === "jobs" ? "bg-blue-600 text-white" : "bg-white"}`}
              >
                Jobs
              </button>
              <button
                onClick={() => setTab("cands")}
                className={`px-3 py-1.5 text-sm ${tab === "cands" ? "bg-blue-600 text-white" : "bg-white"}`}
              >
                Candidates
              </button>
              <button
                onClick={() => setTab("apps")}
                className={`px-3 py-1.5 text-sm ${tab === "apps" ? "bg-blue-600 text-white" : "bg-white"}`}
              >
                Applications
              </button>
            </div>
          </div>

          {/* tiles */}
          <Card className="p-3">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
              <div>
                <label className="block text-xs mb-1">Start</label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-blue-600" />
                  <input
                    type="date"
                    className="border rounded pl-8 pr-2 py-1.5 text-sm w-full"
                    value={range.start}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRange(({ end }) => ({ start: v, end }));
                      loadStats(v, range.end);
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1">End</label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-blue-600" />
                  <input
                    type="date"
                    className="border rounded pl-8 pr-2 py-1.5 text-sm w-full"
                    value={range.end}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRange(({ start }) => ({ start, end: v }));
                      loadStats(range.start, v);
                    }}
                  />
                </div>
              </div>

              {["Open Jobs", "New Candidates", "New Applications", "Interviews (range)"].map(
                (label, i) => (
                  <div key={label} className="border rounded p-3">
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="text-2xl font-bold">
                      {loadingStats ? <Skeleton className="h-6 w-12" /> : [stats.open_jobs, stats.new_candidates, stats.new_applications, stats.interviews_upcoming][i] || 0}
                    </div>
                  </div>
                )
              )}
            </div>
          </Card>

          {/* ===== JOBS TAB ===== */}
          {tab === "jobs" && (
            <Card className="p-0">
              <div className="p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className="text-xs text-gray-600">Tags:</span>
                  <button
                    onClick={() => setTagFilter("")}
                    className={`px-2 py-0.5 rounded text-xs border ${tagFilter === "" ? "bg-blue-600 text-white" : "bg-white"}`}
                  >
                    All
                  </button>
                  {allJobTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTagFilter(t)}
                      className={`px-2 py-0.5 rounded text-xs border inline-flex items-center gap-1 ${
                        tagFilter === t ? "bg-blue-600 text-white" : "bg-white"
                      }`}
                    >
                      <TagIcon className="h-3 w-3 text-blue-700" />
                      {t}
                    </button>
                  ))}
                </div>
                {canWrite && (
                  <Button onClick={() => openJobModal(true)} className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add Job
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 border text-left">Title</th>
                      <th className="p-2 border text-left">Dept</th>
                      <th className="p-2 border text-left">Status</th>
                      <th className="p-2 border text-left">Tags</th>
                      <th className="p-2 border text-left">By Stage</th>
                      <th className="p-2 border text-left">Apps</th>
                      <th className="p-2 border text-left">Next 7d</th>
                      <th className="p-2 border text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingJobs ? (
                      [...Array(4)].map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <td key={j} className="p-2 border">
                              <Skeleton className="h-4 w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : filteredJobs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-3 text-center text-gray-500">
                          No jobs
                        </td>
                      </tr>
                    ) : (
                      filteredJobs.map((j) => {
                        const r = rollById[j.id] || {};
                        const tags = (r.tags || []).slice(0, 4);
                        return (
                          <tr key={j.id}>
                            <td className="p-2 border">
                              <div className="flex items-center gap-2">
                                <Briefcase className="h-4 w-4 text-blue-700" />
                                {j.title}
                              </div>
                            </td>
                            <td className="p-2 border">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-blue-700" />
                                {j.department_name || "—"}
                              </div>
                            </td>
                            <td className="p-2 border">{badge(j.status || "—", jobTone(j.status))}</td>
                            <td className="p-2 border">
                              <div className="flex flex-wrap gap-1">
                                {tags.map((t) => (
                                  <span
                                    key={t}
                                    className="px-1 py-0.5 border rounded text-xs bg-white"
                                  >
                                    {t}
                                  </span>
                                ))}
                                {(r.tags || []).length > 4 && (
                                  <span className="text-xs text-gray-500">+{(r.tags || []).length - 4}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-2 border">
                              <div className="flex flex-wrap gap-1 text-xs">
                                <span className="px-1 border rounded bg-white">screen:{r.stage_screen || 0}</span>
                                <span className="px-1 border rounded bg-white">interview:{r.stage_interview || 0}</span>
                                <span className="px-1 border rounded bg-white">offer:{r.stage_offer || 0}</span>
                                <span className="px-1 border rounded bg-white">hired:{r.stage_hired || 0}</span>
                              </div>
                            </td>
                            <td className="p-2 border">{r.applications_total || 0}</td>
                            <td className="p-2 border">{r.interviews_next7 || 0}</td>
                            <td className="p-2 border">
                              <div className="inline-flex gap-2">
                                {canWrite && (
                                  <button
                                    onClick={() => editJob(j)}
                                    className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                    Edit
                                  </button>
                                )}
                                {canWrite && (
                                  <button
                                    onClick={() => delJob(j.id)}
                                    className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ===== CANDIDATES TAB ===== */}
          {tab === "cands" && (
            <Card className="p-0">
              <div className="p-3 flex justify-end">
                {canWrite && (
                  <Button onClick={() => openCandModal(true)} className="inline-flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Add Candidate
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 border text-left">Name</th>
                      <th className="p-2 border text-left">Email</th>
                      <th className="p-2 border text-left">Phone</th>
                      <th className="p-2 border text-left">Status</th>
                      <th className="p-2 border text-left">Resume</th>
                      <th className="p-2 border text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingCands ? (
                      [...Array(4)].map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j} className="p-2 border">
                              <Skeleton className="h-4 w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : filteredCands.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-3 text-center text-gray-500">
                          No candidates
                        </td>
                      </tr>
                    ) : (
                      filteredCands.map((r) => (
                        <tr key={r.id}>
                          <td className="p-2 border">
                            <div className="flex items-center gap-2">
                              <UserCircle2 className="h-4 w-4 text-blue-700" />
                              {r.full_name}
                            </div>
                          </td>
                          <td className="p-2 border">{r.email || "—"}</td>
                          <td className="p-2 border">{r.phone || "—"}</td>
                          <td className="p-2 border capitalize">{badge(r.status || "—", "teal")}</td>
                          <td className="p-2 border">
                            {r.resume_path ? (
                              <button
                                onClick={() => downloadResume(r.resume_path)}
                                className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-2 border">
                            <div className="inline-flex gap-2">
                              {canWrite && (
                                <button
                                  onClick={() => editCandidate(r)}
                                  className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                              )}
                              {canWrite && (
                                <button
                                  onClick={() => delCandidate(r.id)}
                                  className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ===== APPLICATIONS TAB ===== */}
          {tab === "apps" && (
            <Card className="p-0">
              <div className="p-3 flex justify-end">
                {canWrite && (
                  <Button onClick={() => openAppModal(true)} className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Add Application
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 border text-left">Job</th>
                      <th className="p-2 border text-left">Candidate</th>
                      <th className="p-2 border text-left">Stage</th>
                      <th className="p-2 border text-left">Status</th>
                      <th className="p-2 border text-left">Applied</th>
                      <th className="p-2 border text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingApps ? (
                      [...Array(4)].map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j} className="p-2 border">
                              <Skeleton className="h-4 w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : filteredApps.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-3 text-center text-gray-500">
                          No applications
                        </td>
                      </tr>
                    ) : (
                      filteredApps.map((r) => (
                        <tr key={r.id}>
                          <td className="p-2 border">{r.job_title}</td>
                          <td className="p-2 border">{r.candidate_name}</td>
                          <td className="p-2 border capitalize">{badge(r.stage || "—", "violet")}</td>
                          <td className="p-2 border capitalize">{badge(r.status || "—", appTone(r.status))}</td>
                          <td className="p-2 border">{fmtDate(r.applied_at)}</td>
                          <td className="p-2 border">
                            <div className="inline-flex gap-2">
                              <button
                                onClick={() => openRounds(r)}
                                className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                              >
                                <CalendarClock className="h-3.5 w-3.5" />
                                Rounds
                              </button>
                              {canWrite && (
                                <button
                                  onClick={() => editApplication(r)}
                                  className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                              )}
                              {canWrite && (
                                <button
                                  onClick={() => delApplication(r.id)}
                                  className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </Card>

      {/* JOB MODAL */}
      {jobOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold inline-flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-blue-600" />
                {jobForm.id ? "Edit Job" : "Add Job"}
              </div>
              <button onClick={() => setJobOpen(false)}>✕</button>
            </div>
            <form onSubmit={saveJob} className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <label className="block text-xs font-medium mb-1">Title</label>
                  <input
                    className="border rounded w-full p-2 text-sm"
                    value={jobForm.title}
                    onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Department</label>
                  <select
                    className="border rounded w-full p-2 text-sm"
                    value={jobForm.department_uid || ""}
                    onChange={(e) => setJobForm({ ...jobForm, department_uid: e.target.value })}
                  >
                    <option value="">—</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.department_id} — {d.department_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Status</label>
                  <select
                    className="border rounded w-full p-2 text-sm"
                    value={jobForm.status}
                    onChange={(e) => setJobForm({ ...jobForm, status: e.target.value })}
                  >
                    {JOB_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <label className="block text-xs font-medium mb-1">Location</label>
                  <input
                    className="border rounded w-full p-2 text-sm pl-8"
                    value={jobForm.location}
                    onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                  />
                  <MapPin className="absolute left-2 top-[34px] h-4 w-4 text-blue-600" />
                </div>
                <div className="relative">
                  <label className="block text-xs font-medium mb-1">Post Date</label>
                  <input
                    type="date"
                    className="border rounded w-full p-2 text-sm"
                    value={jobForm.post_date || ""}
                    onChange={(e) => setJobForm({ ...jobForm, post_date: e.target.value })}
                  />
                </div>
                <div className="relative">
                  <label className="block text-xs font-medium mb-1">Close Date</label>
                  <input
                    type="date"
                    className="border rounded w-full p-2 text-sm"
                    value={jobForm.close_date || ""}
                    onChange={(e) => setJobForm({ ...jobForm, close_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="relative">
                <label className="block text-xs font-medium mb-1">Tags (comma)</label>
                <input
                  className="border rounded w-full p-2 text-sm pl-8"
                  value={jobForm.tags}
                  onChange={(e) => setJobForm({ ...jobForm, tags: e.target.value })}
                />
                <ListChecks className="absolute left-2 top-[34px] h-4 w-4 text-blue-600" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <textarea
                  className="border rounded w-full p-2 text-sm"
                  rows={3}
                  value={jobForm.description}
                  onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Requirements</label>
                <textarea
                  className="border rounded w-full p-2 text-sm"
                  rows={3}
                  value={jobForm.requirements}
                  onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setJobOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANDIDATE MODAL */}
      {candOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold inline-flex items-center gap-2">
                <UserCircle2 className="h-4 w-4 text-blue-600" />
                {candForm.id ? "Edit Candidate" : "Add Candidate"}
              </div>
              <button onClick={() => setCandOpen(false)}>✕</button>
            </div>
            <form onSubmit={saveCandidate} className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Full Name</label>
                  <input
                    className="border rounded w-full p-2 text-sm"
                    value={candForm.full_name}
                    onChange={(e) => setCandForm({ ...candForm, full_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Email</label>
                  <input
                    className="border rounded w-full p-2 text-sm"
                    value={candForm.email || ""}
                    onChange={(e) => setCandForm({ ...candForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Phone</label>
                  <input
                    className="border rounded w-full p-2 text-sm"
                    value={candForm.phone || ""}
                    onChange={(e) => setCandForm({ ...candForm, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Source</label>
                  <input
                    className="border rounded w-full p-2 text-sm"
                    value={candForm.source || ""}
                    onChange={(e) => setCandForm({ ...candForm, source: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Tags (comma)</label>
                <input
                  className="border rounded w-full p-2 text-sm"
                  value={candForm.tags || ""}
                  onChange={(e) => setCandForm({ ...candForm, tags: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Resume File</label>
                <input
                  ref={fileRef}
                  type="file"
                  className="block w-full text-sm"
                  onChange={(e) => setCandForm({ ...candForm, file: e.target.files?.[0] || null })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setCandOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="inline-flex items-center gap-2">
                  <UploadCloud className="h-4 w-4" />
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* APPLICATION MODAL */}
      {appOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold inline-flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                {appForm.id ? "Edit Application" : "Add Application"}
              </div>
              <button onClick={() => setAppOpen(false)}>✕</button>
            </div>
            <form onSubmit={saveApplication} className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Job</label>
                  <select
                    className="border rounded w-full p-2 text-sm"
                    value={appForm.job_id}
                    onChange={(e) => setAppForm({ ...appForm, job_id: e.target.value })}
                    required
                  >
                    <option value="">Select</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Candidate</label>
                  <select
                    className="border rounded w-full p-2 text-sm"
                    value={appForm.candidate_id}
                    onChange={(e) => setAppForm({ ...appForm, candidate_id: e.target.value })}
                    required
                  >
                    <option value="">Select</option>
                    {cands.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Stage</label>
                  <select
                    className="border rounded w-full p-2 text-sm"
                    value={appForm.stage}
                    onChange={(e) => setAppForm({ ...appForm, stage: e.target.value })}
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Status</label>
                  <select
                    className="border rounded w-full p-2 text-sm"
                    value={appForm.status}
                    onChange={(e) => setAppForm({ ...appForm, status: e.target.value })}
                  >
                    {APP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notes</label>
                <textarea
                  className="border rounded w-full p-2 text-sm"
                  rows={3}
                  value={appForm.notes || ""}
                  onChange={(e) => setAppForm({ ...appForm, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setAppOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROUNDS DRAWER */}
      {roundOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold inline-flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                Interview Rounds
              </div>
              <button onClick={() => setRoundOpen(false)}>✕</button>
            </div>
            <div className="p-4 space-y-3">
              {canWrite && (
                <form onSubmit={saveRound} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium mb-1">Round No</label>
                    <input
                      type="number"
                      className="border rounded w-full p-2 text-sm"
                      value={roundForm.round_no}
                      onChange={(e) => setRoundForm({ ...roundForm, round_no: e.target.value })}
                      min={1}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Scheduled</label>
                    <input
                      type="datetime-local"
                      className="border rounded w-full p-2 text-sm"
                      value={roundForm.scheduled_at || ""}
                      onChange={(e) => setRoundForm({ ...roundForm, scheduled_at: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Interviewer</label>
                    <select
                      className="border rounded w-full p-2 text-sm"
                      value={roundForm.interviewer_uid || ""}
                      onChange={(e) => setRoundForm({ ...roundForm, interviewer_uid: e.target.value })}
                    >
                      <option value="">—</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {empLabel(e)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Mode</label>
                    <select
                      className="border rounded w-full p-2 text-sm"
                      value={roundForm.mode || "video"}
                      onChange={(e) => setRoundForm({ ...roundForm, mode: e.target.value })}
                    >
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Result</label>
                    <select
                      className="border rounded w-full p-2 text-sm"
                      value={roundForm.result || "pending"}
                      onChange={(e) => setRoundForm({ ...roundForm, result: e.target.value })}
                    >
                      {["pending", "pass", "fail"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Rating</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className="border rounded w-full p-2 text-sm"
                      value={roundForm.rating || ""}
                      onChange={(e) => setRoundForm({ ...roundForm, rating: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium mb-1">Feedback</label>
                    <textarea
                      className="border rounded w-full p-2 text-sm"
                      rows={2}
                      value={roundForm.feedback || ""}
                      onChange={(e) => setRoundForm({ ...roundForm, feedback: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-3 flex justify-end gap-2">
                    <Button type="submit">Save Round</Button>
                  </div>
                </form>
              )}

              <Card className="p-0 overflow-x-auto">
                <table className="w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 border text-left">Round</th>
                      <th className="p-2 border text-left">Scheduled</th>
                      <th className="p-2 border text-left">Interviewer</th>
                      <th className="p-2 border text-left">Mode</th>
                      <th className="p-2 border text-left">Result</th>
                      <th className="p-2 border text-left">Rating</th>
                      <th className="p-2 border text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rounds.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-3 text-center text-gray-500">
                          No rounds
                        </td>
                      </tr>
                    ) : (
                      rounds.map((r) => (
                        <tr key={r.id}>
                          <td className="p-2 border">{r.round_no}</td>
                          <td className="p-2 border">{fmtDate(r.scheduled_at)}</td>
                          <td className="p-2 border">
                            {r.interviewer_empid
                              ? `${r.interviewer_empid} — ${r.interviewer_first_name} ${r.interviewer_last_name}`
                              : "—"}
                          </td>
                          <td className="p-2 border">{r.mode || "—"}</td>
                          <td className="p-2 border capitalize">{badge(r.result || "pending", r.result === "pass" ? "green" : r.result === "fail" ? "red" : "gray")}</td>
                          <td className="p-2 border">{r.rating || "—"}</td>
                          <td className="p-2 border">
                            {canWrite && (
                              <div className="inline-flex gap-2">
                                <button
                                  onClick={() => setRoundForm({ ...r })}
                                  className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => delRound(r.id)}
                                  className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

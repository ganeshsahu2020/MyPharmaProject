// src/components/submodules/hr/HRSettings.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import { Card } from '../../ui/card';
import Button from '../../ui/button';               // Default import
import Input from '../../ui/Input';                 // Default import
import { Skeleton } from '../../ui/skeleton';
import toast from 'react-hot-toast';

import {
  Shield,
  Save,
  RotateCcw,
  Mail,
  Archive,
  LayoutGrid,
  Clock4,
  BellRing,
  Tag,
  FileText,
} from 'lucide-react';

/* ------------------------------ helpers ------------------------------ */
const toArr = (s = '') => s.split(',').map(t => t.trim()).filter(Boolean);
const toCsv = (a = []) => a.join(', ');

// simple add/remove helpers for CSV “chips”
function addTag(csvStr, value) {
  const arr = toArr(csvStr);
  const v = String(value || '').trim();
  if (!v || arr.includes(v)) return csvStr;
  return toCsv([...arr, v]);
}
function removeTag(csvStr, value) {
  const arr = toArr(csvStr).filter(x => x !== value);
  return toCsv(arr);
}

const DEFAULTS = {
  email_notifications_enabled: true,
  default_interview_duration_minutes: 45,
  allowed_resume_mime_types: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  reminder_days_before_interview: 1,
  auto_archive_filled_jobs: true,
  candidate_tag_suggestions: [],
  job_tag_suggestions: [],
  dashboard_show_interviews_widget: true,
};

const HRSettings = () => {
  const [who, setWho] = useState({ email: '', roles: [], loading: true });

  const [row, setRow] = useState(null);
  const [mimeCSV, setMimeCSV] = useState('');
  const [candTagsCSV, setCandTagsCSV] = useState('');
  const [jobTagsCSV, setJobTagsCSV] = useState('');

  // add-input states for interactive chips
  const [mimeNew, setMimeNew] = useState('');
  const [candNew, setCandNew] = useState('');
  const [jobNew, setJobNew] = useState('');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const canWrite = useMemo(
    () => (who.roles || []).some((r) => ['Super Admin', 'Admin', 'HR'].includes(r)),
    [who.roles]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // whoami — use try/catch (don’t chain .catch() after await)
        let meRow = null;
        const { data: whoamiData, error: whoErr } = await supabase.rpc('app_whoami');
        if (!whoErr && whoamiData) {
          // support both single-row and array results
          const raw = Array.isArray(whoamiData) ? whoamiData[0] : whoamiData;
          // normalize roles if it comes as JSON/text
          let roles = [];
          if (Array.isArray(raw?.roles)) roles = raw.roles;
          else if (typeof raw?.roles === 'string') {
            try {
              const j = JSON.parse(raw.roles);
              roles = Array.isArray(j) ? j : [raw.roles];
            } catch {
              roles = [raw.roles];
            }
          }
          meRow = { email: raw?.email || '', roles };
        }
        setWho({ ...(meRow || { email: '', roles: [] }), loading: false });

        // settings (merge with defaults)
        const { data } = await supabase.from('hr_settings').select('*').limit(1).maybeSingle();
        const merged = { ...DEFAULTS, ...(data || {}) };
        setRow(merged);
        setMimeCSV(toCsv(merged.allowed_resume_mime_types));
        setCandTagsCSV(toCsv(merged.candidate_tag_suggestions));
        setJobTagsCSV(toCsv(merged.job_tag_suggestions));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ------------------------------ save/reset ------------------------------ */
  const save = async () => {
    if (!row) return;
    setSaving(true);

    const payload = {
      email_notifications_enabled: !!row.email_notifications_enabled,
      default_interview_duration_minutes: Number(row.default_interview_duration_minutes || 45),
      allowed_resume_mime_types: toArr(mimeCSV),
      reminder_days_before_interview: Number(row.reminder_days_before_interview || 1),
      auto_archive_filled_jobs: !!row.auto_archive_filled_jobs,
      candidate_tag_suggestions: toArr(candTagsCSV),
      job_tag_suggestions: toArr(jobTagsCSV),
      dashboard_show_interviews_widget: !!row.dashboard_show_interviews_widget,
      is_singleton: true,
    };

    const doSave = async () => {
      const { data: existing } = await supabase
        .from('hr_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { data, error } = await supabase
          .from('hr_settings')
          .update(payload)
          .eq('id', existing.id)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return data || payload;
      } else {
        const { data, error } = await supabase
          .from('hr_settings')
          .insert(payload)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return data || payload;
      }
    };

    await toast
      .promise(doSave(), {
        loading: 'Saving settings…',
        success: 'Settings saved',
        error: 'Failed to save settings',
      })
      .then((saved) => {
        setRow({ ...DEFAULTS, ...(saved || payload) });
      })
      .finally(() => setSaving(false));
  };

  const resetToDefaults = () => {
    if (!canWrite) return;
    setRow(DEFAULTS);
    setMimeCSV(toCsv(DEFAULTS.allowed_resume_mime_types));
    setCandTagsCSV(toCsv(DEFAULTS.candidate_tag_suggestions));
    setJobTagsCSV(toCsv(DEFAULTS.job_tag_suggestions));
    toast.success('Reverted to defaults (not saved yet)');
  };

  /* ------------------------------ render ------------------------------ */
  return (
    <div className="p-3 space-y-4">
      {/* Branding-only header (title) */}
      <div className="rounded-xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 px-4 py-4 text-white">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">HR Settings</h2>
        </div>

        {/* Body */}
        <div className="bg-white p-3 md:p-4 space-y-4">
          {/* Capability line */}
          <div className="flex items-center justify-between">
            <div className="text-xs inline-flex items-center gap-1 text-blue-800">
              <Shield className="w-4 h-4" />
              {canWrite ? 'You can edit' : 'Read-only (need HR/Admin)'}
            </div>

            {!loading && (
              <div className="flex items-center gap-2">
                <Button onClick={save} disabled={!canWrite || saving} className="inline-flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetToDefaults}
                  disabled={!canWrite || saving}
                  className="inline-flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset to defaults
                </Button>
              </div>
            )}
          </div>

          {/* Content */}
          {loading || !row ? (
            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-28 w-full md:col-span-2" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </Card>
          ) : (
            <Card className="p-4 space-y-4">
              {/* Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-2">
                      <Mail className="w-4 h-4 text-blue-700 mt-0.5" />
                      <div>
                        <div className="font-medium">Email notifications</div>
                        <div className="text-xs text-gray-500">Send reminders & updates.</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="w-5 h-5"
                      checked={!!row.email_notifications_enabled}
                      onChange={(e) =>
                        setRow((r) => ({ ...r, email_notifications_enabled: e.target.checked }))
                      }
                      disabled={!canWrite}
                      aria-label="Enable email notifications"
                    />
                  </div>
                </div>

                <div className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-2">
                      <Archive className="w-4 h-4 text-blue-700 mt-0.5" />
                      <div>
                        <div className="font-medium">Auto-archive filled jobs</div>
                        <div className="text-xs text-gray-500">Move jobs to “closed”.</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="w-5 h-5"
                      checked={!!row.auto_archive_filled_jobs}
                      onChange={(e) =>
                        setRow((r) => ({ ...r, auto_archive_filled_jobs: e.target.checked }))
                      }
                      disabled={!canWrite}
                      aria-label="Auto-archive filled jobs"
                    />
                  </div>
                </div>

                <div className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-2">
                      <LayoutGrid className="w-4 h-4 text-blue-700 mt-0.5" />
                      <div>
                        <div className="font-medium">Show interviews widget</div>
                        <div className="text-xs text-gray-500">On the HR dashboard.</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="w-5 h-5"
                      checked={!!row.dashboard_show_interviews_widget}
                      onChange={(e) =>
                        setRow((r) => ({ ...r, dashboard_show_interviews_widget: e.target.checked }))
                      }
                      disabled={!canWrite}
                      aria-label="Show interviews widget"
                    />
                  </div>
                </div>

                {/* Numbers */}
                <div className="border rounded p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <Clock4 className="h-4 w-4 absolute left-2 top-2.5 text-blue-700" />
                      <div className="font-medium mb-1 text-sm pl-6">Default interview mins</div>
                      <Input
                        type="number"
                        min={5}
                        max={240}
                        value={row.default_interview_duration_minutes}
                        onChange={(e) =>
                          setRow((r) => ({
                            ...r,
                            default_interview_duration_minutes: e.target.value,
                          }))
                        }
                        disabled={!canWrite}
                        className="pl-8"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-label="Default interview duration in minutes"
                      />
                    </div>
                    <div className="relative">
                      <BellRing className="h-4 w-4 absolute left-2 top-2.5 text-blue-700" />
                      <div className="font-medium mb-1 text-sm pl-6">Reminder days</div>
                      <Input
                        type="number"
                        min={0}
                        max={14}
                        value={row.reminder_days_before_interview}
                        onChange={(e) =>
                          setRow((r) => ({
                            ...r,
                            reminder_days_before_interview: e.target.value,
                          }))
                        }
                        disabled={!canWrite}
                        className="pl-8"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-label="Reminder days before interview"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Allowed resume MIME types (interactive chips) */}
              <div className="md:col-span-2 border rounded p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-blue-700" />
                  <div className="font-medium text-sm">Allowed resume MIME types</div>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {toArr(mimeCSV).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => !canWrite ? null : setMimeCSV(removeTag(mimeCSV, m))}
                      className={`px-2 py-0.5 rounded-full border text-[11px] bg-white ${canWrite ? 'hover:bg-red-50 hover:border-red-300' : ''}`}
                      title={canWrite ? 'Remove' : undefined}
                    >
                      {m}{canWrite && <span className="ml-1">×</span>}
                    </button>
                  ))}
                  {toArr(mimeCSV).length === 0 && <span className="text-xs text-gray-500">None</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    placeholder="e.g. application/pdf"
                    value={mimeNew}
                    onChange={e => setMimeNew(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && canWrite) {
                        setMimeCSV(addTag(mimeCSV, mimeNew)); setMimeNew('');
                      }
                    }}
                    className="border rounded p-2 text-sm flex-1"
                    disabled={!canWrite}
                    inputMode="text"
                    aria-label="Add MIME type"
                  />
                  <Button
                    type="button"
                    onClick={() => { setMimeCSV(addTag(mimeCSV, mimeNew)); setMimeNew(''); }}
                    disabled={!canWrite || !mimeNew.trim()}
                    className="shrink-0"
                  >
                    Add
                  </Button>
                </div>
                <input type="hidden" value={mimeCSV} readOnly />
              </div>

              {/* Candidate tag suggestions (interactive chips) */}
              <div className="border rounded p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="h-4 w-4 text-blue-700" />
                  <div className="font-medium text-sm">Candidate tag suggestions</div>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {toArr(candTagsCSV).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => !canWrite ? null : setCandTagsCSV(removeTag(candTagsCSV, t))}
                      className={`px-2 py-0.5 rounded-full border bg-white text-[11px] ${canWrite ? 'hover:bg-red-50 hover:border-red-300' : ''}`}
                      title={canWrite ? 'Remove' : undefined}
                    >
                      {t}{canWrite && <span className="ml-1">×</span>}
                    </button>
                  ))}
                  {toArr(candTagsCSV).length === 0 && <span className="text-xs text-gray-500">None</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    placeholder="e.g. junior"
                    value={candNew}
                    onChange={e => setCandNew(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && canWrite) {
                        setCandTagsCSV(addTag(candTagsCSV, candNew)); setCandNew('');
                      }
                    }}
                    className="border rounded p-2 text-sm flex-1"
                    disabled={!canWrite}
                    inputMode="text"
                    aria-label="Add candidate tag"
                  />
                  <Button
                    type="button"
                    onClick={() => { setCandTagsCSV(addTag(candTagsCSV, candNew)); setCandNew(''); }}
                    disabled={!canWrite || !candNew.trim()}
                    className="shrink-0"
                  >
                    Add
                  </Button>
                </div>
                <input type="hidden" value={candTagsCSV} readOnly />
              </div>

              {/* Job tag suggestions (interactive chips) */}
              <div className="border rounded p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="h-4 w-4 text-blue-700" />
                  <div className="font-medium text-sm">Job tag suggestions</div>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {toArr(jobTagsCSV).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => !canWrite ? null : setJobTagsCSV(removeTag(jobTagsCSV, t))}
                      className={`px-2 py-0.5 rounded-full border bg-white text-[11px] ${canWrite ? 'hover:bg-red-50 hover:border-red-300' : ''}`}
                      title={canWrite ? 'Remove' : undefined}
                    >
                      {t}{canWrite && <span className="ml-1">×</span>}
                    </button>
                  ))}
                  {toArr(jobTagsCSV).length === 0 && <span className="text-xs text-gray-500">None</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    placeholder="e.g. urgent"
                    value={jobNew}
                    onChange={e => setJobNew(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && canWrite) {
                        setJobTagsCSV(addTag(jobTagsCSV, jobNew)); setJobNew('');
                      }
                    }}
                    className="border rounded p-2 text-sm flex-1"
                    disabled={!canWrite}
                    inputMode="text"
                    aria-label="Add job tag"
                  />
                  <Button
                    type="button"
                    onClick={() => { setJobTagsCSV(addTag(jobTagsCSV, jobNew)); setJobNew(''); }}
                    disabled={!canWrite || !jobNew.trim()}
                    className="shrink-0"
                  >
                    Add
                  </Button>
                </div>
                <input type="hidden" value={jobTagsCSV} readOnly />
              </div>

              {/* Bottom actions */}
              <div className="flex flex-wrap items-center gap-2 justify-end pt-1">
                <Button onClick={save} disabled={!canWrite || saving} className="inline-flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetToDefaults}
                  disabled={!canWrite || saving}
                  className="inline-flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset to defaults
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default HRSettings;

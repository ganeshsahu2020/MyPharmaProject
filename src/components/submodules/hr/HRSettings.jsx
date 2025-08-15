// src/components/submodules/hr/HRSettings.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Check, RotateCcw, Save, Shield } from 'lucide-react';

const csv = (arr) => (Array.isArray(arr) ? arr.join(', ') : '');
const toArr = (s) =>
  (s || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

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
  const [saving, setSaving] = useState(false);

  const canWrite = useMemo(
    () => (who.roles || []).some((r) => ['Super Admin', 'Admin', 'HR'].includes(r)),
    [who.roles]
  );

  useEffect(() => {
    const boot = async () => {
      const me = await supabase.rpc('app_whoami').single();
      setWho({ ...(me.data || {}), loading: false });

      const { data } = await supabase.from('hr_settings').select('*').limit(1).maybeSingle();
      const merged = { ...DEFAULTS, ...(data || {}) };
      setRow(merged);
      setMimeCSV(csv(merged.allowed_resume_mime_types));
      setCandTagsCSV(csv(merged.candidate_tag_suggestions));
      setJobTagsCSV(csv(merged.job_tag_suggestions));
    };
    boot();
  }, []);

  async function save() {
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

    // Safe "upsert": read one row then update/insert
    const { data: existing } = await supabase.from('hr_settings').select('id').limit(1).maybeSingle();

    let res;
    if (existing?.id) {
      res = await supabase
        .from('hr_settings')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .maybeSingle();
    } else {
      res = await supabase.from('hr_settings').insert(payload).select('*').maybeSingle();
    }

    if (res.error) console.error(res.error.message);
    else setRow({ ...DEFAULTS, ...(res.data || payload) });

    setSaving(false);
  }

  function resetToDefaults() {
    setRow(DEFAULTS);
    setMimeCSV(csv(DEFAULTS.allowed_resume_mime_types));
    setCandTagsCSV(csv(DEFAULTS.candidate_tag_suggestions));
    setJobTagsCSV(csv(DEFAULTS.job_tag_suggestions));
  }

  if (!row) {
    return (
      <div className="p-3">
        <Card className="p-4">Loading settings…</Card>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">HR Settings</h2>
          <div className="text-xs inline-flex items-center gap-1 text-gray-600">
            <Shield className="w-4 h-4" />
            {canWrite ? 'You can edit' : 'Read-only (need HR/Admin)'}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* toggles */}
          <div className="border rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Email notifications</div>
                <div className="text-xs text-gray-500">Send reminders & updates.</div>
              </div>
              <input
                type="checkbox"
                className="w-5 h-5"
                checked={!!row.email_notifications_enabled}
                onChange={(e) =>
                  setRow((r) => ({ ...r, email_notifications_enabled: e.target.checked }))
                }
                disabled={!canWrite}
              />
            </div>
          </div>

          <div className="border rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Auto-archive filled jobs</div>
                <div className="text-xs text-gray-500">Move jobs to “closed”.</div>
              </div>
              <input
                type="checkbox"
                className="w-5 h-5"
                checked={!!row.auto_archive_filled_jobs}
                onChange={(e) =>
                  setRow((r) => ({ ...r, auto_archive_filled_jobs: e.target.checked }))
                }
                disabled={!canWrite}
              />
            </div>
          </div>

          <div className="border rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Show interviews widget</div>
                <div className="text-xs text-gray-500">On the HR dashboard.</div>
              </div>
              <input
                type="checkbox"
                className="w-5 h-5"
                checked={!!row.dashboard_show_interviews_widget}
                onChange={(e) =>
                  setRow((r) => ({ ...r, dashboard_show_interviews_widget: e.target.checked }))
                }
                disabled={!canWrite}
              />
            </div>
          </div>

          <div className="border rounded p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="font-medium mb-1 text-sm">Default interview mins</div>
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
                />
              </div>
              <div>
                <div className="font-medium mb-1 text-sm">Reminder days</div>
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
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 border rounded p-3">
            <div className="font-medium mb-1 text-sm">Allowed resume MIME types (CSV)</div>
            <Input
              placeholder="application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              value={mimeCSV}
              onChange={(e) => setMimeCSV(e.target.value)}
              disabled={!canWrite}
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {toArr(mimeCSV).map((m) => (
                <span
                  key={m}
                  className="px-2 py-0.5 rounded border text-[10px] bg-gray-50"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          <div className="border rounded p-3">
            <div className="font-medium mb-1 text-sm">Candidate tag suggestions (CSV)</div>
            <Input
              placeholder="junior, senior, referral"
              value={candTagsCSV}
              onChange={(e) => setCandTagsCSV(e.target.value)}
              disabled={!canWrite}
            />
          </div>

          <div className="border rounded p-3">
            <div className="font-medium mb-1 text-sm">Job tag suggestions (CSV)</div>
            <Input
              placeholder="remote, urgent, campus"
              value={jobTagsCSV}
              onChange={(e) => setJobTagsCSV(e.target.value)}
              disabled={!canWrite}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={save} disabled={!canWrite || saving} className="inline-flex items-center gap-2">
            <Save className="w-4 h-4" />
            Save
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
          {!saving && (
            <span className="text-xs text-gray-500 inline-flex items-center gap-1">
              <Check className="w-3 h-3" />
              Saved to the single <code>hr_settings</code> row
            </span>
          )}
        </div>
      </Card>
    </div>
  );
};

export default HRSettings;

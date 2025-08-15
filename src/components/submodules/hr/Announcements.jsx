import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';

const csvToArr = (s) =>
  (s || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

const Announcements = () => {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    id: null,
    title: '',
    message: '',
    scope: 'all', // all|dept|employee
    department_uid: '',
    employee_uid: '',
    tags: '',
  });
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const boot = async () => {
      const [a, d, e] = await Promise.all([
        supabase.from('hr_announcement').select('*').order('created_at', { ascending: false }),
        supabase.from('department_master').select('id,department_id,department_name').order('department_id', { ascending: true }),
        supabase.from('vw_user_management_ext').select('id,employee_id,first_name,last_name,status').order('employee_id', { ascending: true }),
      ]);
      setRows(a.data || []);
      setDepartments(d.data || []);
      setEmployees((e.data || []).filter((x) => x.status === 'Active'));
    };
    boot();
  }, []);

  const scopedEmployees = useMemo(() => employees, [employees]);

  async function save(e) {
    e?.preventDefault?.();
    const payload = {
      title: form.title,
      message: form.message,
      scope: form.scope,
      department_uid: form.scope === 'dept' ? form.department_uid || null : null,
      employee_uid: form.scope === 'employee' ? form.employee_uid || null : null,
      tags: csvToArr(form.tags),
    };
    const q = form.id
      ? supabase.from('hr_announcement').update(payload).eq('id', form.id)
      : supabase.from('hr_announcement').insert([payload]);
    const { error } = await q;
    if (error) {
      console.error(error.message);
      return;
    }
    const { data } = await supabase.from('hr_announcement').select('*').order('created_at', { ascending: false });
    setRows(data || []);
    setForm({ id: null, title: '', message: '', scope: 'all', department_uid: '', employee_uid: '', tags: '' });
  }

  function edit(r) {
    setForm({
      id: r.id,
      title: r.title || '',
      message: r.message || '',
      scope: r.scope || 'all',
      department_uid: r.department_uid || '',
      employee_uid: r.employee_uid || '',
      tags: (r.tags || []).join(', '),
    });
  }

  async function del(id) {
    if (!window.confirm('Delete this announcement?')) return;
    const { error } = await supabase.from('hr_announcement').delete().eq('id', id);
    if (error) return console.error(error.message);
    setRows((rows) => rows.filter((r) => r.id !== id));
  }

  return (
    <div className="p-3 space-y-4">
      <Card className="p-3">
        <div className="text-sm font-semibold mb-2">{form.id ? 'Edit Announcement' : 'New Announcement'}</div>
        <form onSubmit={save} className="space-y-2">
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <textarea
            className="border rounded p-2 w-full text-sm"
            rows={3}
            placeholder="Message"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            required
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              className="border rounded p-2 text-sm"
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value })}
            >
              <option value="all">All</option>
              <option value="dept">Department</option>
              <option value="employee">Employee</option>
            </select>

            <select
              className="border rounded p-2 text-sm"
              value={form.department_uid}
              onChange={(e) => setForm({ ...form, department_uid: e.target.value })}
              disabled={form.scope !== 'dept'}
            >
              <option value="">Department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.department_id} — {d.department_name}
                </option>
              ))}
            </select>

            <select
              className="border rounded p-2 text-sm"
              value={form.employee_uid}
              onChange={(e) => setForm({ ...form, employee_uid: e.target.value })}
              disabled={form.scope !== 'employee'}
            >
              <option value="">Employee</option>
              {scopedEmployees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.employee_id} — {u.first_name} {u.last_name}
                </option>
              ))}
            </select>
          </div>

          <Input
            placeholder="tags: csv"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
          />

          <div className="flex items-center gap-2">
            <Button type="submit">{form.id ? 'Update' : 'Save'}</Button>
            {form.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setForm({ id: null, title: '', message: '', scope: 'all', department_uid: '', employee_uid: '', tags: '' })
                }
              >
                Clear
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Title</th>
              <th className="p-2 text-left">Scope</th>
              <th className="p-2 text-left">Tags</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-3 text-center text-gray-500">
                  No announcements
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-gray-600">{r.message}</div>
                  </td>
                  <td className="p-2 capitalize">{r.scope}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.tags || []).map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded border text-[10px] bg-gray-50">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <div className="inline-flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => edit(r)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => del(r.id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default Announcements;

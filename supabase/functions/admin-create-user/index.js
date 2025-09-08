// supabase/functions/create-user/index.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';

    if (!url || !service) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
        { status: 500, headers: cors }
      );
    }

    const admin = createClient(url, service);

    const body = await req.json().catch(() => null);
    const {
      email,
      temp_password,
      employee_id,
      first_name,
      last_name,
      phone_no,
      plant_uid,
      subplant_uid,
      department_uid,
      roles,
      status,
      admin_username,
    } = body || {};

    if (!email) {
      return new Response(JSON.stringify({ error: 'email required' }), {
        status: 400,
        headers: cors,
      });
    }

    // 1) Create or fetch existing auth user
    let auth_uid;
    const pw = temp_password || crypto.randomUUID().slice(0, 12);

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
    });

    if (cErr) {
      const msg = (cErr.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('exists')) {
        const r = await fetch(
          `${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
          {
            headers: {
              apikey: anon || service,
              Authorization: `Bearer ${service}`,
            },
          }
        );
        if (!r.ok) {
          return new Response(
            JSON.stringify({ error: `auth lookup failed ${r.status}` }),
            { status: 400, headers: cors }
          );
        }
        const j = await r.json();
        auth_uid = j?.users?.[0]?.id;
        if (!auth_uid) {
          return new Response(
            JSON.stringify({ error: 'auth user exists but id not found' }),
            { status: 400, headers: cors }
          );
        }
      } else {
        return new Response(JSON.stringify({ error: cErr.message }), {
          status: 400,
          headers: cors,
        });
      }
    } else {
      auth_uid = created?.user?.id;
    }

    // 2) Upsert business row via RPC
    const payload = {
      p_id: null,
      p_employee_id: employee_id || email,
      p_first_name: first_name || '',
      p_last_name: last_name || null,
      p_email: email,
      p_phone_no: phone_no || null,
      p_plant_uid: plant_uid || null,
      p_subplant_uid: subplant_uid || null,
      p_department_uid: department_uid || null,
      p_role: Array.isArray(roles) && roles.length ? roles : null,
      p_status: status || 'Active',
      p_password: null,
      p_admin_username: admin_username || 'SYSTEM',
    };

    const { error: sErr } = await admin.rpc('um_save', payload);
    if (sErr) {
      return new Response(JSON.stringify({ error: sErr.message }), {
        status: 400,
        headers: cors,
      });
    }

    // 3) Link auth_uid
    const { error: lErr } = await admin
      .from('user_management')
      .update({ auth_uid })
      .eq('email', email);

    if (lErr) {
      return new Response(JSON.stringify({ error: lErr.message }), {
        status: 400,
        headers: cors,
      });
    }

    return new Response(JSON.stringify({ ok: true, auth_uid }), {
      status: 200,
      headers: cors,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 500, headers: cors }
    );
  }
});

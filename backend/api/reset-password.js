import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // 🔑 Use Service Role Key here
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // ✅ Update user's password via Supabase Admin API
    const { error } = await supabaseAdmin.auth.admin.updateUserByEmail(email, {
      password: newPassword
    });

    if (error) {
      console.error('Password reset error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    console.error('API error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

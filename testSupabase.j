import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config() // Load .env file (optional if using system env vars)

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymjnholeztepjnbcbjcr.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
if (!supabaseKey) {
  console.error('VITE_SUPABASE_ANON_KEY is not set in the environment.')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('asset')
      .select('public_token, asset_code, name')
      .eq('public_token', 'ebf083b3-ee12-403b-af2a-85bf68b74447')
    if (error) throw error
    console.log('Data:', data)
  } catch (error) {
    console.error('Error:', error.message)
  }
}

testConnection()
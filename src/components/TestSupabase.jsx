import { useEffect, useState } from 'react';

const TestSupabase = () => {
  const [status, setStatus] = useState('Checking...');
  const [data, setData] = useState(null);

  useEffect(() => {
    const testConnection = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/check-supabase`);
        const json = await res.json();
        console.log('🔍 API Response:', json);
        if (json.status === 'connected') {
          setStatus('✅ Connected to Supabase via Backend');
          setData(json.data);
        } else {
          setStatus(`❌ Error: ${json.message}`);
        }
      } catch (err) {
        console.error('Fetch Error:', err);
        setStatus('❌ Failed to connect to Backend');
      }
    };

    testConnection();
  }, []);

  return (
    <div className="p-6 bg-white rounded shadow mt-6">
      <h2 className="text-xl font-bold mb-2">🔗 Supabase Connection Test</h2>
      <p className="text-gray-700 mb-4">{status}</p>
      {data && (
        <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default TestSupabase;

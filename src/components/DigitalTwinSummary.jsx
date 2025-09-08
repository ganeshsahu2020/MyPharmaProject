// src/components/DigitalTwinSummary.jsx
import React, { useState, useEffect } from 'react';
import ProcessFlowDiagram from './ProcessFlowDiagram'; // Import the diagram component
import { supabase } from '../../utils/supabaseClient'; // Assuming you're using Supabase

const DigitalTwinSummary = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // Fetch logs from Supabase (or any other source)
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from('material_tracking')
        .select('*')
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('Error fetching logs:', error);
      } else {
        setLogs(data);
      }
    };

    fetchLogs();
  }, []);

  return (
    <div>
      <h1>Digital Twin Summary</h1>

      <section>
        <h2>Process Flow Diagram</h2>
        {/* Pass logs to the ProcessFlowDiagram component */}
        <ProcessFlowDiagram logs={logs} />
      </section>
    </div>
  );
};

export default DigitalTwinSummary;

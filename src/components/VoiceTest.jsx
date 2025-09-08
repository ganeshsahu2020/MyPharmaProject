// src/components/VoiceTest.jsx
import React, { useState } from "react";
import { ask } from "../utils/askVoice";

const VoiceTest = () => {
  const [q, setQ] = useState("list our modules and submodules");
  const [out, setOut] = useState("");

  const run = async () => {
    setOut("…");
    try {
      const r = await ask(q, { schemas: ["public"], speak: true });
      setOut(JSON.stringify(r, null, 2));
    } catch (e) {
      setOut(String(e?.message || e));
    }
  };

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-semibold">AI Voice Quick Test</h2>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="border px-3 py-2 w-full rounded"
        placeholder="Ask something…"
      />
      <div className="flex gap-2">
        <button onClick={run} className="px-3 py-2 rounded bg-black text-white">
          Ask &amp; Speak
        </button>
        <button
          onClick={() => window.speechSynthesis?.cancel()}
          className="px-3 py-2 rounded border"
        >
          Stop Voice
        </button>
      </div>
      <pre className="bg-slate-900 text-white text-xs p-3 rounded overflow-auto">
        {out}
      </pre>
    </div>
  );
};

export default VoiceTest;

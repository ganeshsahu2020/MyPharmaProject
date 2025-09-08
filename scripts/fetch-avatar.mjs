#!/usr/bin/env node
// downloads a GLB into public/avatar.glb (or custom path)
// usage: npm run fetch:avatar -- "<GLB URL>" [public/custom.glb]

import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const url = process.argv[2];
const out = process.argv[3] || "public/avatar.glb";

if (!url) {
  console.error('Usage: npm run fetch:avatar -- "<GLB URL>" [outputPath]');
  process.exit(1);
}

try {
  console.log(`Downloading ${url} -> ${out}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const buf = Buffer.from(await res.arrayBuffer());
  // ensure folder exists
  const dir = out.split("/").slice(0, -1).join("/") || ".";
  await mkdir(dir, { recursive: true });
  await writeFile(out, buf);

  console.log("Saved:", out);
} catch (err) {
  console.error("Failed:", err?.message || err);
  process.exit(2);
}

// src/utils/globalResolver.js
// Robust input → route resolver used by sidebar "Scan & lookup", /scan, etc.
// Supports JSON QR payloads, URLs, UUIDs, WO HR codes, asset codes/serials/tokens,
// part codes, BIN-* codes, and legacy "Plant|BIN" strings.

/** @typedef {{ from: (table:string)=>any, rpc: (fn:string,args:any)=>any }} Supabase */

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUUID = (v) => UUID_RX.test(String(v || ""));

// Accept base36 HR codes like "WO-1SJ44WH" or "1SJ44WH" (5–12)
const pickHrCode = (s) => {
  const str = String(s || "").toUpperCase().trim();
  let m = str.match(/^WO[\s-]*([A-Z0-9]{5,12})$/);
  if (m) return m[1];
  m = str.match(/^[A-Z0-9]{5,12}$/);
  return m ? m[0] : null;
};

// ----- route builders (must match App.jsx routes) -----
const toPmWo = (ref) => `/pm/wo/${encodeURIComponent(ref)}`; // UUID or HR code
const toEquipment = (id) => `/equipment/${encodeURIComponent(id)}`;

/**
 * Build the inventory route used by the Engineering/Inventory module.
 * Accepts an object or URLSearchParams.
 */
const toInventory = (params) => {
  const qs =
    params instanceof URLSearchParams
      ? params.toString()
      : new URLSearchParams(params || {}).toString();
  return `/engineering/inventory-spare-parts-management${qs ? `?${qs}` : ""}`;
};

// ----- helpers that talk to Supabase (all guarded) -----
async function findAssetIdByToken(supabase, token) {
  if (!supabase?.from) return null;
  // Try asset.qr_token then asset.public_token
  let q = await supabase.from("asset").select("id").eq("qr_token", token).maybeSingle();
  if (!q?.error && q?.data?.id) return q.data.id;

  q = await supabase.from("asset").select("id").eq("public_token", token).maybeSingle();
  if (!q?.error && q?.data?.id) return q.data.id;

  return null;
}

async function findAssetIdByIdOrCode(supabase, input) {
  if (!supabase?.from) return null;

  // 1) Direct id (UUID)
  if (isUUID(input)) {
    const q = await supabase.from("asset").select("id").eq("id", input).maybeSingle();
    if (!q?.error && q?.data?.id) return q.data.id;
  }
  // 2) By asset_code
  let q = await supabase.from("asset").select("id").eq("asset_code", input).maybeSingle();
  if (!q?.error && q?.data?.id) return q.data.id;

  // 3) By serial_no
  q = await supabase.from("asset").select("id").eq("serial_no", input).maybeSingle();
  if (!q?.error && q?.data?.id) return q.data.id;

  return null;
}

async function resolveHrWoToUuid(supabase, hr) {
  if (!supabase?.rpc) return null;
  try {
    const r = await supabase.rpc("pm_resolve_wo_hr", { p_code: hr });
    if (!r?.error && r?.data) return r.data; // uuid
  } catch {
    /* ignore */
  }
  return null;
}

async function findPartUidByCode(supabase, code) {
  if (!supabase?.from) return null;

  // exact
  let q = await supabase.from("part_master").select("id").eq("part_code", code).maybeSingle();
  if (!q?.error && q?.data?.id) return q.data.id;

  // ilike exact (case-insensitive)
  q = await supabase
    .from("part_master")
    .select("id")
    .ilike("part_code", code)
    .limit(1)
    .maybeSingle();
  if (!q?.error && q?.data?.id) return q.data.id;

  return null;
}

/**
 * Main resolver.
 * @param {string} rawInput
 * @param {Supabase} supabase
 * @returns {Promise<string|null>} path to navigate or null
 */
export async function resolveInputToPath(rawInput, supabase) {
  const s = String(rawInput || "").trim();
  if (!s) return null;

  // 1) JSON QR payloads (new + legacy keys)
  try {
    const o = JSON.parse(s);
    const type = o.type || o.t;

    if (type === "pm_wo" || type === "PM" || type === "pm") {
      const wo = o.wo || o.id || o.ref;
      if (isUUID(wo)) return toPmWo(wo);
      const hr = pickHrCode(wo);
      if (hr) {
        const uuid = await resolveHrWoToUuid(supabase, hr); // best-effort
        return toPmWo(uuid || hr);
      }
      if (isUUID(o.token)) return toPmWo(o.token);
      return null;
    }

    if (type === "part") {
      const part_uid = o.part_uid || o.uid || null;
      const part_code = o.part_code || o.code || null;
      const plant_id = o.plant_id || o.plant || null;
      const bin_code = o.bin_code || o.bin || null;

      const params = {};
      if (part_uid) params.part = String(part_uid);
      if (!part_uid && part_code) params.part_code = String(part_code);
      if (plant_id) params.plant_id = String(plant_id);
      if (bin_code) params.bin_code = String(bin_code);

      return toInventory(params);
    }

    if (type === "bin") {
      const plant_id = o.plant_id || o.plant || "Plant1";
      const bin_code = o.bin_code || o.bin;
      if (bin_code) return toInventory({ plant_id, bin_code });
      return null;
    }

    if (type === "asset" || type === "equipment") {
      const id = o.id || o.asset_id || null;
      const code = o.code || o.asset_code || null;
      if (id && isUUID(id)) return toEquipment(id);
      if (code) {
        const assetId = await findAssetIdByIdOrCode(supabase, code);
        if (assetId) return toEquipment(assetId);
      }
      if (o.token && isUUID(o.token)) {
        const idByTok = await findAssetIdByToken(supabase, o.token);
        if (idByTok) return toEquipment(idByTok);
      }
      return null;
    }

    if (o.token && isUUID(o.token)) {
      // token could be either asset token or PM WO ref
      const idByTok = await findAssetIdByToken(supabase, o.token);
      return idByTok ? toEquipment(idByTok) : toPmWo(o.token);
    }
  } catch {
    // not JSON
  }

  // 2) URLs we issued or users paste
  try {
    const u = new URL(s);
    const pm = u.pathname.match(/\/pm\/wo\/([^/?#]+)/i);
    if (pm) return toPmWo(decodeURIComponent(pm[1]));

    const eq = u.pathname.match(/\/equipment\/([^/?#]+)/i);
    if (eq) return toEquipment(decodeURIComponent(eq[1]));

    const qid =
      u.searchParams.get("id") ||
      u.searchParams.get("token") ||
      u.searchParams.get("qr");
    if (qid && isUUID(qid)) {
      const idByTok = await findAssetIdByToken(supabase, qid);
      return idByTok ? toEquipment(idByTok) : toPmWo(qid);
    }
  } catch {
    // not a URL — continue
  }

  // 3) HR WO code
  const hr = pickHrCode(s);
  if (hr) {
    const uuid = await resolveHrWoToUuid(supabase, hr);
    return toPmWo(uuid || hr);
  }

  // 4) UUID — prioritize assets (id/tokens), otherwise PM WO
  if (isUUID(s)) {
    const id = await findAssetIdByIdOrCode(supabase, s);
    if (id) return toEquipment(id);
    const idByTok = await findAssetIdByToken(supabase, s);
    if (idByTok) return toEquipment(idByTok);
    return toPmWo(s);
  }

  // 5) BIN-* → inventory by bin
  if (/^BIN-/i.test(s)) {
    return toInventory({ plant_id: "Plant1", bin_code: s });
  }

  // 6) Legacy "Plant|BIN"
  if (s.includes("|")) {
    const [plant_id, bin_code] = s.split("|");
    if (plant_id && bin_code) {
      return toInventory({ plant_id, bin_code });
    }
  }

  // 7) Asset by code/serial
  {
    const assetId = await findAssetIdByIdOrCode(supabase, s);
    if (assetId) return toEquipment(assetId);
  }

  // 8) Part by code
  {
    const partUid = await findPartUidByCode(supabase, s);
    if (partUid) return toInventory({ part: String(partUid) });
  }

  return null;
}

// default export for convenience
export default resolveInputToPath;

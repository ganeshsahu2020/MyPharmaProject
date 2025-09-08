import { supabase } from "../utils/supabaseClient";

/* small helpers */
const d = (x) => (x ? new Date(x).toISOString() : null);
const n = (x) => (x == null ? null : Number(x));

/* ---- movement timeline builder (uses vw_material_location_norm) ----
   We synthesize qty/container_count per hop:
   - First row (PUT-IN): use label_net_qty / label_containers if known
   - Subsequent rows (MOVE): keep running qty/ctn; deltas = 0
   Replace with a real “events” view later to compute true deltas. */
function buildEventsFromLocationHistory(rows = [], labelSeed = null) {
  if (!rows.length) return [];

  let runningQty = n(labelSeed?.label_net_qty);
  let runningCtn = n(labelSeed?.label_containers);

  const events = [];
  let prev = null;

  rows.forEach((r, idx) => {
    const isFirst = idx === 0;
    const event = {
      event_at: d(r.placed_at) || d(r.updated_at),
      created_at: d(r.updated_at),
      event_type: isFirst ? "PUT-IN" : "MOVE",
      from_location: isFirst ? null : prev?.location_code || null,
      to_location: r.location_code || null,
      qty: runningQty,                 // synthetic – held constant without a history view
      delta_qty: isFirst ? runningQty : 0,
      container_count: runningCtn,     // synthetic – held constant without a history view
      delta_containers: isFirst ? runningCtn : 0,
      done_by: null,
      movement_reason: r.status || null,
      movement_note: null,
    };
    events.push(event);
    prev = r;
  });

  return events;
}

/* ---- aggregate across multiple labels for a material code ---- */
function summarizeMaterialRows(rows = []) {
  if (!rows.length) return null;
  const first = rows[0];
  const totalQty = rows.reduce((s, r) => s + Number(r.live_qty || 0), 0);
  const totalCtn = rows.reduce((s, r) => s + Number(r.live_containers || 0), 0);

  return {
    material: {
      code: first.material_code || null,
      desc: first.material_desc || null,
      uom: first.uom || null,
    },
    current: {
      location_code:
        rows.length > 1 ? `Multiple (${rows.length} labels)` : (first.location_code || null),
      status: rows.length > 1 ? "MIXED" : (first.status || null),
      qty: totalQty,
      containers: totalCtn,
      placed_at: d(first.placed_at),
      updated_at: d(first.updated_at),
    },
  };
}

/* ------------------------ by Label UID ------------------------ */
async function fetchByLabel(uid) {
  // 1) main “card”
  const cols = [
    "uid",
    "location_code","status","live_qty","live_containers","placed_at","updated_at",
    "grn_no","line_no","item_code","material_code","material_desc",
    "uom","uom_name","uom_decimals",
    "label_net_qty","label_containers","container_index",
    "item_batch_no","invoice_no","printed_by","printed_at",
    "vendor_code","vendor_batch_no","manufacturer",
    "mfg_date","exp_date","next_inspection_date",
    "lr_no","lr_date","transporter_name","vehicle",
    "storage_condition","pack_size"
  ].join(",");

  let { data: card, error: cardErr } = await supabase
    .from("vw_palletize_cards")
    .select(cols)
    .eq("uid", uid)
    .limit(1)
    .maybeSingle();

  // fallback: case-insensitive (if caller typed different case)
  if (!card && !cardErr) {
    const { data } = await supabase
      .from("vw_palletize_cards")
      .select(cols)
      .ilike("uid", uid)
      .limit(1)
      .maybeSingle();
    card = data || null;
  }
  if (cardErr) throw cardErr;

  if (!card) {
    // nothing found – return a minimal shape so UI renders gracefully
    return {
      label: { uid },
      material: null,
      current: null,
      qc: null,
      header_extra: null,
      events: [],
      meta: {},
    };
  }

  const facts = {
    label: {
      uid: card.uid,
      grn_no: card.grn_no,
      line_no: card.line_no,
      item_code: card.item_code,
      material_code: card.material_code,
      material_desc: card.material_desc,
      uom: card.uom,
      net_qty: n(card.label_net_qty),
      num_containers: n(card.label_containers),
      item_batch_no: card.item_batch_no,
      invoice_no: card.invoice_no,
      printed_by: card.printed_by,
      printed_at: d(card.printed_at),
      vendor_code: card.vendor_code,
      vendor_batch_no: card.vendor_batch_no,
      manufacturer: card.manufacturer,
      exp_date: d(card.exp_date),
      next_inspection_date: d(card.next_inspection_date),
    },
    material: {
      code: card.material_code,
      desc: card.material_desc,
      uom: card.uom,
    },
    current: {
      location_code: card.location_code,
      status: card.status,
      qty: n(card.live_qty),
      containers: n(card.live_containers),
      placed_at: d(card.placed_at),
      updated_at: d(card.updated_at),
    },
    header_extra: {
      lr_no: card.lr_no,
      lr_date: d(card.lr_date),
      transporter: card.transporter_name,
      vehicle: card.vehicle,
      storage_condition: card.storage_condition,
      pack_size: card.pack_size,
    },
    qc: null,
    events: [],
    meta: {},
  };

  // 2) QC
  const { data: qcRow } = await supabase
    .from("vw_material_quality_latest")
    .select("quality_status, quality_changed_at, quality_reason")
    .eq("label_uid", card.uid)
    .order("quality_changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qcRow) {
    facts.qc = {
      quality_status: qcRow.quality_status || null,
      quality_changed_at: d(qcRow.quality_changed_at),
      quality_reason: qcRow.quality_reason || null,
    };
  }

  // 3) movement history
  const { data: locRows } = await supabase
    .from("vw_material_location_norm")
    .select("location_code,status,placed_at,updated_at")
    .eq("label_uid", card.uid)
    .order("placed_at", { ascending: true });

  const events = buildEventsFromLocationHistory(locRows || [], {
    label_net_qty: card.label_net_qty,
    label_containers: card.label_containers,
  });
  facts.events = events;

  // 4) meta
  if (events.length) {
    facts.meta.first_event = events[0].event_at;
    facts.meta.last_event = events[events.length - 1].event_at;
  } else {
    facts.meta.first_event = d(card.placed_at);
    facts.meta.last_event = d(card.updated_at);
  }

  // sanity: if card missed the latest loc, use last loc row
  if ((!facts.current?.location_code || !facts.current?.status) && locRows?.length) {
    const last = locRows[locRows.length - 1];
    facts.current = {
      ...(facts.current || {}),
      location_code: last.location_code || facts.current?.location_code || null,
      status: last.status || facts.current?.status || null,
      placed_at: d(last.placed_at) || facts.current?.placed_at || null,
      updated_at: d(last.updated_at) || facts.current?.updated_at || null,
    };
  }

  return facts;
}

/* ------------------------ by Material Code ------------------------ */
async function fetchByMaterialCode(matCode) {
  const cols = [
    "uid",
    "location_code","status","live_qty","live_containers","placed_at","updated_at",
    "material_code","material_desc","uom"
  ].join(",");

  const { data: rows, error } = await supabase
    .from("vw_palletize_cards")
    .select(cols)
    .eq("material_code", matCode);

  if (error) throw error;

  if (!rows?.length) {
    return {
      material: { code: matCode, desc: null, uom: null },
      current: null,
      qc: null,
      header_extra: null,
      events: [],
      meta: {},
    };
  }

  // aggregate snapshot
  const agg = summarizeMaterialRows(rows);

  // QC rollup = latest across all labels
  const uids = rows.map((r) => r.uid).filter(Boolean);
  let qc = null;

  if (uids.length) {
    const { data: qcRows } = await supabase
      .from("vw_material_quality_latest")
      .select("label_uid, quality_status, quality_changed_at")
      .in("label_uid", uids)
      .order("quality_changed_at", { ascending: false });

    if (qcRows?.length) {
      const latest = qcRows[0];
      const statuses = new Set(qcRows.map((r) => r.quality_status).filter(Boolean));
      qc = {
        quality_status: statuses.size > 1 ? "MIXED" : latest.quality_status,
        quality_changed_at: d(latest.quality_changed_at),
      };
    }
  }

  return {
    ...agg,
    qc,
    header_extra: null,
    events: [], // per-material timeline omitted (would need to stitch all labels)
    meta: {},
  };
}

/* ------------------------ public API ------------------------ */
export async function getPalletFacts(token) {
  const q = String(token || "").trim();
  if (!q) return null;

  if (/^LBL[-_]/i.test(q)) {
    return fetchByLabel(q);
  }
  return fetchByMaterialCode(q);
}

export default getPalletFacts;

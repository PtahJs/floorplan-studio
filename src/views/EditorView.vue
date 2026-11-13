<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { createEngine, disposeEngine } from "../engine";
import { MATS, ROOMS, WALLS, area, fmt, norm, perim } from "../engine/floorplan/data";
import { furnSVG } from "../engine/floorplan/svg-legend";

const container = ref(null);
// shallowRef: sel/undoLen inside the store are refs; a plain deep ref would make them reactive and unwrap them
const plan = shallowRef(null);
let engine = null;
let disposed = false;

onMounted(async () => {
    engine = createEngine(container.value);
    await engine.ready; // only render panels after plugins are installed (plan/world/view2d attached in onComplete)
    if (disposed) return;
    plan.value = engine.plan;
    bindEngineHooks();
});

onBeforeUnmount(() => {
    disposed = true;
    disposeEngine(engine);
    engine = null;
    plan.value = null;
});

/* ============ Selection panel data ============ */
const sel = computed(() => plan.value?.sel.value ?? null);
const selFurn = computed(() => (sel.value?.kind === "furn" && plan.value.getF(sel.value.id)) || null);
const selRoom = computed(() => (sel.value?.kind === "room" ? ROOMS.find(r => r.id === sel.value.id) : null));
const selRoomSt = computed(() => (selRoom.value && plan.value.state.rooms[selRoom.value.id]) || null);

/* ============ View mode (2D/3D) ============ */
const view = ref("2d");
const busy = ref(false); // during transition: the reference page locks the seg via body.busy
async function setView(m) {
    if (!plan.value || busy.value || m === view.value) return;
    busy.value = true;
    const done = await engine.viewmode.set(m);
    view.value = done;
    busy.value = false;
    syncTip();
}

/* ============ Header common ============ */
const undoLen = computed(() => plan.value?.undoLen.value ?? 0);
const redoLen = computed(() => plan.value?.redoLen.value ?? 0);
function undo() { plan.value?.undo(); }
function redo() { plan.value?.redo(); }

function clearLayout() {
    const n = plan.value?.state.furniture.length ?? 0;
    if (!n) return toastMsg("There is no furniture to clear");
    if (!confirm(`Remove all ${n} furniture / appliance items?\nWalls, flooring and measurements are kept. You can Undo this.`)) return;
    plan.value.setSel(null);
    plan.value.clearLayout();
    toastMsg("Layout cleared — Undo to restore");
}

/* ============ 2D tools / layers / zoom ============ */
const tool = ref("select");
function setTool(t) {
    tool.value = t;
    engine.view2d.setTool(t);
    syncModeHint();
}
const layerOn = ref({ dims: true, labels: true, furn: true, grid: false, bearing: false, wallSnap: true });
function toggleLayer(k) {
    const L = engine.view2d.layers;
    L[k] = !L[k];
    layerOn.value[k] = L[k];
    if (k !== "wallSnap") engine.view2d.renderAll();
}
const scalebar = ref({ text: "1 m", w: 60 });
const ratioTxt = ref("—");
const hoverRoom = ref("");
const cursorMM = ref({ x: null, y: null });

/* ============ 3D view: mode / cut / day-night / walk ============ */
const mode = ref("orbit");
const cut = ref(2.8);
const night = ref(false);
const labels3d = ref(true);
const furn3d = ref(true);
const hour = ref(10);
const hourTxt = computed(() => `${String(Math.floor(hour.value)).padStart(2, "0")}:${String(Math.round((hour.value - Math.floor(hour.value)) * 60)).padStart(2, "0")}`);

function setMode(m) {
    if (m === mode.value) return;
    mode.value = m;
    engine.world.opt.mode = m;
    if (m === "walk") {
        plan.value.setSel(null);
        engine.walk.enter();
        syncTip();
    } else {
        engine.walk.exit();
        engine.cameraRig.goIso();
    }
}
function setCut(v) {
    if (mode.value === "walk") return;
    cut.value = v;
    engine.world.opt.cut = v;
    engine.world.sync();
}
function setNight(v) {
    night.value = v;
    engine.world.opt.night = v;
    engine.world.applyLight();
}
function setLabels(v) {
    labels3d.value = v;
    engine.world.showLabels(v);
}
function setFurn3d(v) {
    furn3d.value = v;
    engine.world.opt.furn = v;
    engine.world.furnGroup.visible = v;
    if (!v && plan.value.sel.value?.kind === "furn") plan.value.setSel(null);
}
function setHour(v) {
    hour.value = +v;
    engine.world.opt.hour = hour.value;
    engine.world.applyLight();
}

/* ============ File: import / export / reset ============ */
const fileIn = ref(null);
function exportPNG() {
    if (view.value === "3d") engine.interact.shot3d?.();
    else engine.view2d.exportPNG();
}
function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportJson() {
    download(`${"floor-plan-design"}.json`, new Blob([JSON.stringify(plan.value.state, null, 2)], { type: "application/json" }));
}
function onImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(txt => {
        try {
            const s = JSON.parse(txt);
            if (!plan.value.importState(s)) throw 0;
            toastMsg("Plan imported");
        } catch (err) { toastMsg("Invalid file format"); }
    });
    e.target.value = "";
}
function resetPlan() {
    if (confirm("Reset to the default design? (undoable)")) plan.value.resetState();
}

/* ============ Overview panel data ============ */
const totArea = computed(() => ROOMS.filter(r => r.counted !== false).reduce((a, r) => a + area(r.poly), 0));
const matCost = computed(() => {
    const byMat = {};
    ROOMS.forEach(r => { const m = plan.value?.state.rooms[r.id]?.mat; if (m) byMat[m] = (byMat[m] || 0) + area(r.poly); });
    let cost = 0;
    const rows = Object.entries(byMat).map(([m, a]) => {
        const c = a * MATS[m].price * 1.05;
        cost += c;
        return { m, name: MATS[m].name, sw: MATS[m].sw, a, c };
    });
    return { rows, cost };
});
const demLen = computed(() => plan.value?.state.demolished.reduce((a, id) => a + Math.max(WALLS[+id.slice(1)][2] - WALLS[+id.slice(1)][0], WALLS[+id.slice(1)][3] - WALLS[+id.slice(1)][1]), 0) / 1000 ?? 0);
const roomRows = computed(() => ROOMS.map(r => ({ id: r.id, name: plan.value?.state.rooms[r.id]?.name || r.name, sw: MATS[plan.value?.state.rooms[r.id]?.mat || r.mat]?.sw, a: area(r.poly), counted: r.counted !== false })));
function pickRoom(id) {
    plan.value.setSel({ kind: "room", id });
    if (view.value === "3d") engine.cameraRig.flyToRoom(id);
}

/* ============ Room panel: furniture inside ============ */
const roomInside = computed(() => {
    if (!selRoom.value) return [];
    const [x0, y0, x1, y1] = selRoom.value.poly.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]);
    return plan.value?.state.furniture.filter(f => f.cx > x0 && f.cx < x1 && f.cy > y0 && f.cy < y1) ?? [];
});

/* ============ Furniture library ============ */
function libDown(item, e) { engine.view2d.beginLibDrag(item, e); }
const libHint = "Furniture is drawn at real size (mm). Click to add at the center, or drag onto the plan / 3D floor. Edit size and color in the right panel afterwards.";

/* ============ Sidebar collapse (reference page drawer / wide-screen collapse) ============ */
const libOpen = ref(true);
const panelOpen = ref(true);
const paneCls = computed(() => ({ "hide-lib": !libOpen.value, "hide-panel": !panelOpen.value, in3d: view.value === "3d" }));
function togglePane(which) {
    if (which === "lib") libOpen.value = !libOpen.value;
    else panelOpen.value = !panelOpen.value;
}

/* ============ Floating toolbar (fab) ============ */
const fabFurn = computed(() => (sel.value?.kind === "furn" && plan.value.getF(sel.value.id)) || null);
const fabRoom = computed(() => (sel.value?.kind === "room" && ROOMS.find(r => r.id === sel.value.id)) || null);
function fabAct(a) {
    const f = fabFurn.value;
    if (a === "rotL" && f) plan.value.rotateFurn(f.id, -90);
    else if (a === "rotR" && f) plan.value.rotateFurn(f.id, 90);
    else if (a === "dup" && f) plan.value.duplicateFurn(f.id);
    else if (a === "del" && f) plan.value.removeFurn(f.id);
    else if (a === "done") plan.value.setSel(null);
}

/* ============ Furniture panel numeric inputs ============ */
function furnNum(f, key, e) {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) plan.value.editFurn(f.id, { [key]: key === "w" || key === "d" ? Math.max(50, Math.round(v)) : key === "rot" ? norm(v) : v });
}

/* ============ Hint bar / toast / language ============ */
const modehint = ref("");
const tip = ref("");
const toastMsg_ = ref("");
let toastT;
function toastMsg(msg) {
    toastMsg_.value = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => (toastMsg_.value = ""), 1800);
}
function syncModeHint() {
    const hints = {
        select: "",
        measure: "Click two points (or drag) to measure · snaps to walls · Shift locks horizontal/vertical · Esc cancels",
        demolish: "Click a grey non-bearing wall to remove it, click again to restore · black bearing walls cannot be removed",
    };
    modehint.value = hints[tool.value] ?? "";
}
function syncTip() {
    tip.value = matchMedia("(pointer:coarse)").matches
        ? (view.value === "2d"
            ? "Tap or drag from the library · 1 finger pans · pinch zooms · bottom bar rotates / duplicates / deletes"
            : "1 finger orbits · 2 fingers zoom / pan · tap furniture or floor to edit · tap doors to open")
        : (view.value === "2d"
            ? "Drag furniture onto the plan · scroll to zoom · drag empty space to pan · T for 3D"
            : "3D stays in sync with the plan · panel edits apply instantly · T for 2D");
}
/* ============ Engine hooks (scalebar / footer coords / hovered room) ============ */
function bindEngineHooks() {
    engine.view2d.hooks.onView = v => {
        ratioTxt.value = "1:" + Math.round(v.ratio);
        scalebar.value = { text: v.nice >= 1000 ? `${v.nice / 1000} m` : `${v.nice} mm`, w: v.nice * engine.view2d.view.s };
    };
    engine.view2d.hooks.onHover = p => { cursorMM.value = p; };
    engine.view2d.hooks.onRoomHover = id => {
        hoverRoom.value = id
            ? `<b>${plan.value.state.rooms[id]?.name || ROOMS.find(r => r.id === id)?.name}</b> ${fmt(area(ROOMS.find(r => r.id === id).poly))} m²`
            : "";
    };
    engine.toast = toastMsg;
    syncTip();
    syncModeHint();
}
</script>

<template>
    <div class="app" :class="paneCls">
        <!-- main area: 3D canvas container + 2D SVG overlay (the engine builds .fp-view2d inside tri-container itself) -->
        <div class="stage-wrap">
            <div ref="container" class="tri-container"></div>
            <!-- Floating toolbar (in stage-wrap, not tri-container: EventManager captures pointers inside the container) -->
            <div id="fab" :class="{ show: !!fabFurn || !!fabRoom }">
                <template v-if="fabFurn">
                    <span class="name">{{ fabFurn.name }}</span>
                    <button class="btn" @click="fabAct('rotL')">↺</button>
                    <button class="btn" @click="fabAct('rotR')">↻ "Rotate"</button>
                    <button class="btn" @click="fabAct('dup')">"Duplicate"</button>
                    <button class="btn danger" @click="fabAct('del')">"Delete"</button>
                    <span class="sep"></span>
                    <button class="btn" @click="fabAct('done')">"Done"</button>
                </template>
                <template v-else-if="fabRoom">
                    <span class="name">{{ plan.state.rooms[fabRoom.id]?.name || fabRoom.name }}</span>
                    <button class="btn" @click="fabAct('done')">"Done"</button>
                </template>
            </div>
            <div class="scalebar only2d"><span>{{ scalebar.text }}</span><div class="bar" :style="{ width: scalebar.w + 'px' }"></div></div>
            <div class="modehint" :class="{ show: !!modehint }">{{ modehint }}</div>
        </div>

        <!-- Top bar (same structure as the reference page header) -->
        <header v-if="plan">
            <div class="grp">
                <button class="btn chip" :class="{ on: libOpen }" @click="togglePane('lib')">◧ "Library"</button>
                <button class="btn chip" :class="{ on: panelOpen }" @click="togglePane('panel')">"Properties" ◨</button>
            </div>
            <div class="brand"><b>"3BR 2LR 2BA · Interior Design"</b><span>"Original scale 1:60" · "Units: mm"</span></div>
            <div class="grp seg" :class="{ busy }" title="Switch 2D / 3D (T)">
                <span class="pill" :style="{ transform: view === '3d' ? 'translateX(84px)' : '' }"></span>
                <button class="btn" :class="{ light: view === '2d' }" @click="setView('2d')">"2D Plan"</button>
                <button class="btn" :class="{ light: view === '3d' }" @click="setView('3d')">"3D Scene"</button>
            </div>
            <div class="grp only2d">
                <button class="btn" :class="{ on: tool === 'select' }" title="Select / Move (V)" @click="setTool('select')">"Select"</button>
                <button class="btn" :class="{ on: tool === 'measure' }" title="Measure (M)" @click="setTool('measure')">"Measure"</button>
                <button class="btn" :class="{ on: tool === 'demolish' }" title="Demolish non-bearing walls (X)" @click="setTool('demolish')">"Demolish"</button>
            </div>
            <div class="grp only2d">
                <button class="btn" title="Zoom out" @click="engine.view2d.zoomBy(0.8)">−</button>
                <button class="btn" title="Zoom in" @click="engine.view2d.zoomBy(1.25)">＋</button>
                <button class="btn" title="Fit to window (F)" @click="engine.view2d.fitView()">"Fit"</button>
                <button class="btn" title="Show at 1:60" @click="engine.view2d.setRatio(60); toastMsg('Showing at 1:60 (same scale as the original plan)')">1:60</button>
                <button class="btn" title="Show at 1:100" @click="engine.view2d.setRatio(100)">1:100</button>
            </div>
            <div class="grp only3d">
                <button class="btn" :class="{ on: mode === 'orbit' }" @click="setMode('orbit')">"Orbit"</button>
                <button class="btn" :class="{ on: mode === 'walk' }" @click="setMode('walk')">"Walk"</button>
            </div>
            <div class="grp only3d">
                <button class="btn" @click="engine.cameraRig.goIso()">"Iso"</button>
                <button class="btn" @click="engine.cameraRig.goTop()">"Top"</button>
            </div>
            <div class="grp">
                <button class="btn" :disabled="!undoLen" :style="{ opacity: undoLen ? 1 : 0.4 }" title="Undo (Ctrl+Z)" @click="undo">"Undo"</button>
                <button class="btn" :disabled="!redoLen" :style="{ opacity: redoLen ? 1 : 0.4 }" title="Redo (Ctrl+Shift+Z)" @click="redo">"Redo"</button>
                <button class="btn danger" title="Remove all furniture and appliances (undoable)" @click="clearLayout">"Clear"</button>
            </div>
            <div class="grp only2d">
                <button class="btn chip" :class="{ on: layerOn.dims }" @click="toggleLayer('dims')">"Dims"</button>
                <button class="btn chip" :class="{ on: layerOn.labels }" @click="toggleLayer('labels')">"Rooms"</button>
                <button class="btn chip" :class="{ on: layerOn.furn }" @click="toggleLayer('furn')">"Furniture"</button>
                <button class="btn chip" :class="{ on: layerOn.grid }" @click="toggleLayer('grid')">"Grid"</button>
                <button class="btn chip" :class="{ on: layerOn.bearing }" @click="toggleLayer('bearing')">"Bearing walls"</button>
                <button class="btn chip" :class="{ on: layerOn.wallSnap }" title="Snap furniture to walls while dragging" @click="toggleLayer('wallSnap')">"Wall snap"</button>
            </div>
            <div class="grp only3d">
                <button class="btn chip" :class="{ on: cut === 2.8 }" @click="setCut(2.8)">"Full walls"</button>
                <button class="btn chip" :class="{ on: cut === 1.2 }" @click="setCut(1.2)">"Cut walls"</button>
            </div>
            <div class="grp only3d">
                <button class="btn chip" :class="{ on: furn3d }" @click="setFurn3d(!furn3d)">"Furniture"</button>
                <button class="btn chip" :class="{ on: labels3d }" @click="setLabels(!labels3d)">"Labels"</button>
                <button class="btn chip" :class="{ on: night }" @click="setNight(!night)">"Night"</button>
            </div>
            <div class="grp only3d"><label class="range"><span>"Sun"</span> <input type="range" min="7" max="18" step="0.25" :value="hour" style="width:84px" @input="setHour($event.target.value)"><span>{{ hourTxt }}</span></label></div>
            <span class="spacer"></span>
            <details class="menu">
                <summary class="btn">"File ▾"</summary>
                <div class="menu-pop">
                    <button class="btn" @click="exportPNG">"Export image"</button>
                    <button class="btn" @click="exportJson">"Export plan JSON"</button>
                    <button class="btn" @click="fileIn.click()">"Import plan"</button>
                    <button class="btn danger" @click="resetPlan">"Reset to default"</button>
                </div>
            </details>
            <input ref="fileIn" type="file" accept=".json,application/json" hidden @change="onImportFile" />
        </header>

        <!-- Left: 3D room list + furniture library -->
        <aside class="lib" v-if="plan">
            <div class="only3d">
                <h4>"Rooms · click to fly there"</h4>
                <div id="roomList">
                    <button v-for="r in roomRows.filter(x => x.counted)" :key="r.id" @click="pickRoom(r.id)"><span>{{ r.name }}</span><small>{{ r.a.toFixed(2) }} m²</small></button>
                    <button @click="engine.cameraRig.goIso()"><span>"Whole home"</span><small>{{ totArea.toFixed(2) }} m²</small></button>
                </div>
            </div>
            <div id="lib">
                <template v-for="(c, ci) in plan.catalog" :key="c.cat">
                    <h4>{{ c.cat }}</h4>
                    <div class="lib-grid">
                        <div v-for="(it, ii) in c.items" :key="ii" class="item" title="Click to add, or drag onto the plan" @pointerdown="libDown(it, $event)">
                            <svg :viewBox="`${-it[2] / 2 - Math.max(it[2], it[3]) * 0.08} ${-it[3] / 2 - Math.max(it[2], it[3]) * 0.08} ${it[2] + 2 * Math.max(it[2], it[3]) * 0.08} ${it[3] + 2 * Math.max(it[2], it[3]) * 0.08}`" v-html="furnSVG(it[0], it[2], it[3], it[4])"></svg>
                            <b>{{ it[1] }}</b><small>{{ it[2] }}×{{ it[3] }}</small>
                        </div>
                    </div>
                </template>
                <div class="hint">{{ libHint }}</div>
            </div>
        </aside>

        <!-- Right panel (overview / room / furniture) -->
        <aside class="right" v-if="plan">
            <div id="panel">
                <!-- Furniture panel -->
                <section v-if="selFurn">
                    <h3>"Furniture"</h3>
                    <div class="form">
                        <label class="full">"Name"<input :value="selFurn.name" @change="plan.editFurn(selFurn.id, { name: $event.target.value.trim() || selFurn.name })"></label>
                        <label>"Width" (mm)<input type="number" :value="selFurn.w" min="50" step="10" @change="furnNum(selFurn, 'w', $event)"></label>
                        <label>"Depth" (mm)<input type="number" :value="selFurn.d" min="50" step="10" @change="furnNum(selFurn, 'd', $event)"></label>
                        <label>"Center" X (mm)<input type="number" :value="Math.round(selFurn.cx)" step="10" @change="furnNum(selFurn, 'cx', $event)"></label>
                        <label>"Center" Y (mm)<input type="number" :value="Math.round(selFurn.cy)" step="10" @change="furnNum(selFurn, 'cy', $event)"></label>
                        <label>"Rotation" (°)<input type="number" :value="selFurn.rot" step="15" @change="furnNum(selFurn, 'rot', $event)"></label>
                        <label>"Color"<input type="color" :value="selFurn.color" @change="plan.setFurnColor(selFurn.id, $event.target.value)"></label>
                    </div>
                    <div class="muted" style="margin-top:8px">"Footprint" {{ fmt(selFurn.w * selFurn.d / 1e6) }} m²</div>
                    <div class="actions">
                        <button class="btn" @click="plan.rotateFurn(selFurn.id, 90)">"Rotate 90°"</button>
                        <button class="btn" @click="plan.duplicateFurn(selFurn.id)">"Duplicate"</button>
                        <button class="btn" @click="plan.orderFurn(selFurn.id, false)">"Bring to front"</button>
                        <button class="btn" @click="plan.orderFurn(selFurn.id, true)">"Send to back"</button>
                        <button class="btn danger" @click="plan.removeFurn(selFurn.id)">"Delete"</button>
                        <button class="btn" @click="plan.setSel(null)">← "Back"</button>
                    </div>
                </section>

                <!-- Room panel -->
                <template v-else-if="selRoomSt">
                    <section>
                        <h3>"Room"</h3>
                        <div class="form">
                            <label class="full">"Name"<input :value="selRoomSt.name" @change="plan.setRoomName(selRoom.value.id, $event.target.value.trim() || selRoomSt.name)"></label>
                        </div>
                        <div class="stats" style="margin-top:10px">
                            <div><small>"Floor area"</small><span class="big">{{ fmt(area(selRoom.poly)) }}</span> m²</div>
                            <div><small>"Perimeter"</small><span class="big">{{ fmt(perim(selRoom.poly), 1) }}</span> m</div>
                        </div>
                    </section>
                    <section>
                        <h3>"Flooring"</h3>
                        <div class="mats">
                            <button v-for="(m, k) in MATS" :key="k" class="mat" :class="{ on: selRoomSt.mat === k }" @click="plan.setRoomMat(selRoom.value.id, k)">
                                <i :style="{ background: m.sw }"></i><span>{{ m.name }}<small>¥{{ m.price }}/m²</small></span>
                            </button>
                        </div>
                        <div class="total"><span>"Estimated cost"</span><b>¥{{ Math.round(area(selRoom.poly) * MATS[selRoomSt.mat].price * 1.05).toLocaleString() }}</b></div>
                    </section>
                    <section>
                        <h3>"Furniture in room" <small>{{ roomInside.length }} "items"</small></h3>
                        <table>
                            <tr v-for="f in roomInside" :key="f.id" class="click" @click="plan.setSel({ kind: 'furn', id: f.id })"><td>{{ f.name }}</td><td class="r muted">{{ f.w }}×{{ f.d }}</td></tr>
                        </table>
                        <div class="actions"><button class="btn" @click="plan.setSel(null)">← "Back to overview"</button></div>
                    </section>
                </template>

                <!-- Overview panel -->
                <template v-else>
                    <section>
                        <h3>"Room Areas" <small>"Click to view / change flooring"</small></h3>
                        <table>
                            <tr v-for="r in roomRows" :key="r.id" class="click" @click="pickRoom(r.id)">
                                <td><span class="sw" :style="{ background: r.sw }"></span>{{ r.name }}<span v-if="!r.counted" class="muted"> *</span></td>
                                <td class="r">{{ r.a.toFixed(2) }} m²</td>
                            </tr>
                        </table>
                        <div class="total"><span>"Net floor area"</span><b>{{ fmt(totArea) }} m²</b></div>
                        <div class="muted" style="font-size:11px;margin-top:4px">"* Bay windows are excluded; areas use net inner wall dimensions"</div>
                    </section>
                    <section>
                        <h3>"Flooring Estimate" <small>"incl. 5% waste"</small></h3>
                        <table>
                            <tr v-for="row in matCost.rows" :key="row.m">
                                <td><span class="sw" :style="{ background: row.sw }"></span>{{ row.name }}</td>
                                <td class="r">{{ fmt(row.a, 1) }} m²</td>
                                <td class="r">¥{{ Math.round(row.c).toLocaleString() }}</td>
                            </tr>
                        </table>
                        <div class="total"><span>"Flooring total"</span><b>¥{{ Math.round(matCost.cost).toLocaleString() }}</b></div>
                    </section>
                    <section>
                        <h3>"Plan Stats"</h3>
                        <div class="stats">
                            <div><small>"Furniture"</small><span class="big">{{ plan.state.furniture.length }}</span></div>
                            <div><small>"Walls removed"</small><span class="big">{{ fmt(demLen, 1) }}</span> m</div>
                        </div>
                        <div class="actions">
                            <button class="btn" @click="plan.clearMeasures()">"Clear measures" ({{ plan.state.measures.length }})</button>
                            <button class="btn danger" @click="clearLayout">"Clear layout"</button>
                        </div>
                    </section>
                    <section>
                        <h3>"Keyboard Shortcuts"</h3>
                        <div class="kbd">
                            <kbd>"Drag"</kbd><span>"Drag furniture onto the plan"</span>
                            <kbd>V</kbd><span>"Select / move"</span>
                            <kbd>M</kbd><span>"Measure (Shift: horizontal/vertical)"</span>
                            <kbd>X</kbd><span>"Demolish non-bearing walls (black = bearing)"</span>
                            <kbd>R</kbd><span>"Rotate 90° (Shift reverses)"</span>
                            <kbd>"Arrows"</kbd><span>"Nudge 10mm (Shift 100mm)"</span>
                            <kbd>⌘/Ctrl D</kbd><span>"Duplicate"</span>
                            <kbd>Delete</kbd><span>"Delete"</span>
                            <kbd>⌘/Ctrl Z</kbd><span>"Undo"</span>
                            <kbd>T</kbd><span>"Toggle 2D / 3D"</span>
                            <kbd>F</kbd><span>"Fit to window"</span>
                            <kbd>Esc</kbd><span>"Deselect"</span>
                        </div>
                    </section>
                </template>
            </div>
        </aside>

        <!-- Status bar (same structure as the reference page footer) -->
        <footer v-if="plan">
            <span class="only2d">X <b>{{ cursorMM.x != null ? cursorMM.x + " mm" : "—" }}</b></span>
            <span class="only2d">Y <b>{{ cursorMM.y != null ? cursorMM.y + " mm" : "—" }}</b></span>
            <span class="only2d">"Scale" <b>{{ ratioTxt }}</b></span>
            <span id="hover" class="only2d" v-html="hoverRoom"></span>
            <span class="spacer"></span>
            <span id="tip">{{ tip }}</span>
        </footer>

        <div class="toast" :class="{ show: !!toastMsg_ }">{{ toastMsg_ }}</div>
    </div>
</template>

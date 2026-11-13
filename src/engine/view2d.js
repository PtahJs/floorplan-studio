import { DOORS, LIB, MATS, ROOMS, SLIDES, WALLS, WINS, area, aabb, bbox, esc, fmt, norm } from "./floorplan/data";
import { buildDefs, furnSVG, NOLABEL } from "./floorplan/svg-legend";

/**
 * 2D SVG plan editor (port of the reference page's 2D rendering + pointer interaction + view transform).
 * Shares state with the plan store (furniture / rooms / demolished walls / measures); drags mutate state
 * directly and commit to the undo stack on release. Renders via innerHTML fragment strings (like the
 * reference page); view transform view = {x0, y0, s} (s: screen pixels per mm).
 */

const PX_MM = 25.4 / 96; // 1 CSS px = 0.2646 mm
const BOUNDS = { x: -1850, y: -1750, w: 15600, h: 14100 };
const TAP = matchMedia("(pointer:coarse)").matches ? 9 : 4; // pointer must move this many px to count as a drag

/** Wall 2D fill (b=bearing dark red-black / e=exterior / n=removable / low=low wall; demolished state draws a dashed outline) */
function wallFill(k, bearingOn) {
    return k === "b" ? (bearingOn ? "#b8412c" : "#26241f") : k === "low" ? "#e9e3d8" : k === "e" ? "#8f897d" : "#a7a195";
}

/**
 * @param {HTMLElement} host mount container (creates the <svg> inside)
 * @param {import("../stores/plan").PlanStore} plan floor-plan state store
 * @param {object} hooks { addItemAt(item, x, y), onToggleView(), is2dActive(), groundAt(x,y) }
 */
export function createView2d(host, plan, hooks = {}) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "fp-plan";
    svg.setAttribute("font-family", "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif");
    svg.innerHTML = `<defs id="fp-defs"></defs>
<g id="fp-gGrid"></g><g id="fp-gRooms"></g><g id="fp-gFurn"></g><g id="fp-gWalls"></g>
<g id="fp-gOpen"></g><g id="fp-gLabels" pointer-events="none"></g><g id="fp-gDims" pointer-events="none"></g>
<g id="fp-gMeasure" pointer-events="none"></g><g id="fp-gSel"></g>`;
    host.appendChild(svg);
    svg.querySelector("#fp-defs").innerHTML = buildDefs();

    /** Layer toggles (wallSnap only affects snapping, no redraw) */
    const layers = { furn: true, labels: true, dims: true, grid: true, wallSnap: true, bearing: false };
    /** Tools: select / measure / demolish */
    let tool = "select";
    const view = { x0: 0, y0: 0, s: 0.06 };
    let mA = null, mCur = null; // measure start point / transient end point while dragging
    let drag = null;            // {kind: move|rot|size|measure|pan, ...}
    const touches = new Map();
    let pinch = null;
    let disposed = false;

    const $ = id => svg.querySelector("#" + id);
    const snapRects = () => WALLS.filter((_, i) => !plan.state.demolished.includes("w" + i));

    /* ======================= View transform ======================= */

    function applyView() {
        const W = svg.clientWidth, H = svg.clientHeight;
        svg.setAttribute("viewBox", `${view.x0} ${view.y0} ${W / view.s} ${H / view.s}`);
        hooks.onView?.({ ratio: 1 / (view.s * PX_MM), nice: [100, 200, 500, 1000, 2000, 5000].find(v => v * view.s >= 60) || 5000 });
        renderMeasure(); renderSel();
    }

    function fitView() {
        const W = svg.clientWidth || host.clientWidth, H = svg.clientHeight || host.clientHeight;
        if (!W || !H) return;
        view.s = Math.min(W / BOUNDS.w, H / BOUNDS.h);
        view.x0 = BOUNDS.x - (W / view.s - BOUNDS.w) / 2;
        view.y0 = BOUNDS.y - (H / view.s - BOUNDS.h) / 2;
        applyView();
    }

    function zoomAt(ns, mx, my) {
        ns = Math.max(0.012, Math.min(2, ns));
        const px = view.x0 + mx / view.s, py = view.y0 + my / view.s;
        view.s = ns; view.x0 = px - mx / ns; view.y0 = py - my / ns;
        applyView();
    }

    /** Screen coords → plan mm */
    function toMM(x, y) {
        const r = svg.getBoundingClientRect();
        return { x: view.x0 + (x - r.left) / view.s, y: view.y0 + (y - r.top) / view.s };
    }

    /** Current 2D viewport → 3D planPose params (viewport center mm + visible height mm) */
    function getViewport() {
        const W = svg.clientWidth, H = svg.clientHeight;
        return { cx: view.x0 + W / 2 / view.s, cy: view.y0 + H / 2 / view.s, visH: H / view.s };
    }

    /* ======================= Rendering ======================= */

    function renderGrid() {
        $("fp-gGrid").innerHTML = `<rect x="-20000" y="-20000" width="55000" height="55000" fill="${layers.grid ? "url(#grid)" : "transparent"}" data-bg="1"/>`;
    }

    function renderRooms() {
        let s = "";
        ROOMS.forEach(r => s += `<polygon class="room" data-room="${r.id}" points="${r.poly.map(p => p.join(",")).join(" ")}" fill="url(#m-${plan.state.rooms[r.id]?.mat || r.mat})"/>`);
        const sill = ([a, b, c, d]) => `<rect x="${a}" y="${b}" width="${c - a}" height="${d - b}" fill="#e2dacb" stroke="#b9b0a0" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
        DOORS.forEach(d => s += sill(d.rect));
        SLIDES.forEach(d => s += sill(d.rect));
        $("fp-gRooms").innerHTML = s;
    }

    function renderFurn() {
        const g = $("fp-gFurn");
        g.setAttribute("display", layers.furn ? "inline" : "none");
        g.innerHTML = plan.state.furniture.map(f => {
            const fs = Math.max(80, Math.min(170, Math.min(f.w, f.d) * 0.2));
            const label = Math.min(f.w, f.d) >= 380 && !NOLABEL.includes(f.type)
                ? `<text transform="rotate(${-f.rot})" font-size="${fs}" text-anchor="middle" dominant-baseline="central" fill="#4a443c" opacity=".8" pointer-events="none">${esc(f.name)}</text>` : "";
            return `<g class="furn" data-fid="${f.id}" transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">${furnSVG(f.type, f.w, f.d, f.color)}${label}</g>`;
        }).join("");
    }

    function renderWalls() {
        $("fp-gWalls").innerHTML = WALLS.map((w, i) => {
            const [x0, y0, x1, y1, k] = w, id = "w" + i;
            const dem = plan.state.demolished.includes(id);
            let fill = wallFill(k, layers.bearing), ex = k === "low" ? 'stroke="#8f897d" stroke-width="1" vector-effect="non-scaling-stroke"' : "";
            if (dem) { fill = "rgba(198,91,58,.12)"; ex = 'stroke="#c65b3a" stroke-width="1.2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"'; }
            return `<rect class="wall" data-wall="${id}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${fill}" ${ex}/>`;
        }).join("");
    }

    function renderOpenings() {
        const WS = 'stroke="#4f7394" stroke-width="1" vector-effect="non-scaling-stroke"';
        const DS = 'stroke="#3d3a34" stroke-width="1" vector-effect="non-scaling-stroke"';
        let s = "";
        WINS.forEach(([x0, y0, x1, y1]) => {
            const w = x1 - x0, h = y1 - y0;
            s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#f7fbfd" ${WS}/>`;
            if (w >= h) [1 / 3, 2 / 3].forEach(t => s += `<line x1="${x0}" y1="${y0 + h * t}" x2="${x1}" y2="${y0 + h * t}" ${WS}/>`);
            else [1 / 3, 2 / 3].forEach(t => s += `<line x1="${x0 + w * t}" y1="${y0}" x2="${x0 + w * t}" y2="${y1}" ${WS}/>`);
        });
        DOORS.forEach(d => {
            const [hx, hy] = d.h, L = d.len, T = 40;
            const ox = hx + d.o[0] * L, oy = hy + d.o[1] * L, cx = hx + d.c[0] * L, cy = hy + d.c[1] * L;
            const sweep = d.o[0] * d.c[1] - d.o[1] * d.c[0] > 0 ? 1 : 0;
            const col = d.entry ? "#b5653a" : "#3d3a34";
            s += `<polygon points="${hx},${hy} ${ox},${oy} ${ox + d.c[0] * T},${oy + d.c[1] * T} ${hx + d.c[0] * T},${hy + d.c[1] * T}" fill="#fff" stroke="${col}" stroke-width="${d.entry ? 1.8 : 1}" vector-effect="non-scaling-stroke"/>`;
            s += `<path d="M${ox} ${oy}A${L} ${L} 0 0 ${sweep} ${cx} ${cy}" fill="none" ${DS} stroke-dasharray="5 3" opacity=".7"/>`;
        });
        SLIDES.forEach(({ rect: [x0, y0, x1, y1], v }) => {
            if (v) { const L = y1 - y0, m = (x0 + x1) / 2; s += `<rect x="${m - 45}" y="${y0}" width="40" height="${L * 0.55}" fill="#fff" ${DS}/><rect x="${m + 5}" y="${y1 - L * 0.55}" width="40" height="${L * 0.55}" fill="#fff" ${DS}/>`; }
            else { const L = x1 - x0, m = (y0 + y1) / 2; s += `<rect x="${x0}" y="${m - 45}" width="${L * 0.55}" height="40" fill="#fff" ${DS}/><rect x="${x1 - L * 0.55}" y="${m + 5}" width="${L * 0.55}" height="40" fill="#fff" ${DS}/>`; }
        });
        $("fp-gOpen").innerHTML = s;
    }

    function renderLabels() {
        const g = $("fp-gLabels");
        g.setAttribute("display", layers.labels ? "inline" : "none");
        g.innerHTML = ROOMS.filter(r => r.at).map(r => {
            const [x, y] = r.at;
            const halo = 'stroke="#fbf9f4" stroke-width="45" paint-order="stroke" stroke-linejoin="round"';
            return `<text x="${x}" y="${y}" font-size="250" font-weight="600" text-anchor="middle" fill="#2b2824" ${halo}>${esc(plan.state.rooms[r.id]?.name || r.name)}</text>
<text x="${x}" y="${y + 260}" font-size="175" text-anchor="middle" fill="#7d7366" ${halo}>${fmt(area(r.poly))} m²</text>`;
        }).join("");
    }

    function renderDims() {
        const DC = "#7d7160";
        const LS = `stroke="${DC}" stroke-width="1" vector-effect="non-scaling-stroke"`;
        const TK = `stroke="${DC}" stroke-width="2" vector-effect="non-scaling-stroke"`;
        const txt = (x, y, v, rot) => `<text x="${x}" y="${y}" font-size="${v < 400 ? 140 : 200}" text-anchor="middle" fill="${DC}" ${rot ? `transform="rotate(-90 ${x} ${y})"` : ""}>${v}</text>`;
        const chain = (horiz, at, start, segs) => {
            const pts = [start];
            segs.forEach(v => pts.push(pts[pts.length - 1] + v));
            let s = horiz ? `<line x1="${pts[0]}" y1="${at}" x2="${pts[pts.length - 1]}" y2="${at}" ${LS}/>` : `<line x1="${at}" y1="${pts[0]}" x2="${at}" y2="${pts[pts.length - 1]}" ${LS}/>`;
            pts.forEach(p => s += horiz
                ? `<line x1="${p}" y1="${at - 170}" x2="${p}" y2="${at + 170}" ${LS}/><line x1="${p - 80}" y1="${at + 80}" x2="${p + 80}" y2="${at - 80}" ${TK}/>`
                : `<line x1="${at - 170}" y1="${p}" x2="${at + 170}" y2="${p}" ${LS}/><line x1="${at - 80}" y1="${p + 80}" x2="${at + 80}" y2="${p - 80}" ${TK}/>`);
            segs.forEach((v, i) => { const mid = (pts[i] + pts[i + 1]) / 2; s += horiz ? txt(mid, at - 70, v) : txt(at - 70, mid, v, true); });
            return s;
        };
        $("fp-gDims").innerHTML =
            chain(true, -750, 0, [1580, 240, 2760, 240, 1540, 240, 3670]) + chain(true, -1250, 0, [10270]) +
            chain(true, 11350, 0, [2180, 240, 2160, 240, 5450, 240, 1340]) + chain(true, 11850, 0, [11850]) +
            chain(false, -800, 0, [3370, 1580, 240, 2770, 240, 2360]) + chain(false, -1300, 0, [10560]) +
            chain(false, 12750, 0, [3370, 240, 2760, 240, 3950]) + chain(false, 13250, 0, [10560]);
    }

    function renderMeasure() {
        const k = 1 / view.s, fs = 12 * k;
        const one = (a, b, tmp) => {
            const L = Math.hypot(b.x - a.x, b.y - a.y);
            if (L < 1) return "";
            let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
            if (ang > 90 || ang < -90) ang += 180;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, nx = (-(b.y - a.y) / L) * 5 * k, ny = ((b.x - a.x) / L) * 5 * k;
            const col = tmp ? "#2f5d62" : "#b5653a";
            const S = `stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"`;
            return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${S}/>
<line x1="${a.x - nx}" y1="${a.y - ny}" x2="${a.x + nx}" y2="${a.y + ny}" ${S}/><line x1="${b.x - nx}" y1="${b.y - ny}" x2="${b.x + nx}" y2="${b.y + ny}" ${S}/>
<text x="${mx}" y="${my - 5 * k}" font-size="${fs}" text-anchor="middle" fill="${col}" font-weight="600" transform="rotate(${ang} ${mx} ${my})" stroke="#fff" stroke-width="${3.5 * k}" paint-order="stroke">${Math.round(L)} mm</text>`;
        };
        let s = plan.state.measures.map(m => one(m.a, m.b)).join("");
        if (mA && mCur) s += one(mA, mCur, true);
        if (mA) s += `<circle cx="${mA.x}" cy="${mA.y}" r="${3 / view.s}" fill="#2f5d62"/>`;
        $("fp-gMeasure").innerHTML = s;
    }

    function renderSel() {
        const k = 1 / view.s;
        let s = "";
        const sel = plan.sel.value;
        if (sel?.kind === "furn") {
            const f = plan.getF(sel.id);
            if (f) {
                const p = 5 * k, A = 'stroke="#b5653a" vector-effect="non-scaling-stroke"';
                const hs = matchMedia("(pointer:coarse)").matches ? 1.7 : 1;
                const ro = (matchMedia("(pointer:coarse)").matches ? 40 : 26) * k, hit = (matchMedia("(pointer:coarse)").matches ? 24 : 11) * k;
                const sx = f.w / 2 + p, sy = f.d / 2 + p;
                s += `<g transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">
<rect x="${-f.w / 2 - p}" y="${-f.d / 2 - p}" width="${f.w + 2 * p}" height="${f.d + 2 * p}" fill="none" ${A} stroke-width="1.5" stroke-dasharray="5 3" pointer-events="none"/>
<line x1="0" y1="${-f.d / 2 - p}" x2="0" y2="${-f.d / 2 - ro}" ${A} stroke-width="1" pointer-events="none"/>
<circle data-handle="rot" cx="0" cy="${-f.d / 2 - ro}" r="${hit}" fill="transparent"/>
<circle data-handle="rot" cx="0" cy="${-f.d / 2 - ro}" r="${6 * hs * k}" fill="#fff" ${A} stroke-width="1.5"><title>${"Drag to rotate (Shift for free angle)"}</title></circle>
<circle data-handle="size" cx="${sx}" cy="${sy}" r="${hit}" fill="transparent"/>
<rect data-handle="size" x="${sx - 5 * hs * k}" y="${sy - 5 * hs * k}" width="${10 * hs * k}" height="${10 * hs * k}" fill="#b5653a"><title>${"Drag to resize"}</title></rect></g>`;
                const { hh } = aabb(f);
                s += `<text x="${f.cx}" y="${f.cy + hh + 24 * k}" font-size="${12 * k}" text-anchor="middle" fill="#b5653a" font-weight="600" pointer-events="none" stroke="#fff" stroke-width="${3 * k}" paint-order="stroke">${f.w} × ${f.d}</text>`;
            }
        } else if (sel?.kind === "room") {
            const r = ROOMS.find(o => o.id === sel.id);
            if (r) s += `<polygon points="${r.poly.map(p => p.join(",")).join(" ")}" fill="rgba(181,101,58,.08)" stroke="#b5653a" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
        }
        $("fp-gSel").innerHTML = s;
    }

    function renderAll() {
        renderGrid(); renderRooms(); renderFurn(); renderWalls(); renderOpenings(); renderLabels(); renderMeasure(); renderSel(); renderDims();
        $("fp-gDims").setAttribute("display", layers.dims ? "inline" : "none");
    }

    /* ======================= Snapping ======================= */

    function snapMove(f, cx, cy) {
        let nx = Math.round(cx / 10) * 10, ny = Math.round(cy / 10) * 10;
        if (!layers.wallSnap) return [nx, ny];
        const { hw, hh } = aabb(f), tol = 10 / view.s;
        let bx = tol, by = tol;
        for (const r of snapRects()) {
            if (!(r[3] < cy - hh - tol || r[1] > cy + hh + tol))
                for (const ex of [r[0], r[2]]) for (const c of [ex + hw, ex - hw])
                    if (Math.abs(c - cx) < bx) { bx = Math.abs(c - cx); nx = c; }
            if (!(r[2] < cx - hw - tol || r[0] > cx + hw + tol))
                for (const ey of [r[1], r[3]]) for (const c of [ey + hh, ey - hh])
                    if (Math.abs(c - cy) < by) { by = Math.abs(c - cy); ny = c; }
        }
        return [nx, ny];
    }

    function snapPoint(p, shift) {
        let x = Math.round(p.x / 10) * 10, y = Math.round(p.y / 10) * 10;
        const tol = 8 / view.s;
        let bx = tol, by = tol;
        for (const r of snapRects()) {
            for (const ex of [r[0], r[2]]) if (Math.abs(ex - p.x) < bx) { bx = Math.abs(ex - p.x); x = ex; }
            for (const ey of [r[1], r[3]]) if (Math.abs(ey - p.y) < by) { by = Math.abs(ey - p.y); y = ey; }
        }
        if (shift && mA) { if (Math.abs(x - mA.x) > Math.abs(y - mA.y)) y = mA.y; else x = mA.x; }
        return { x, y };
    }

    /* ======================= Actions ======================= */

    function setTool(t) {
        tool = t; mA = null; mCur = null;
        svg.setAttribute("class", "fp-tool-" + t);
        renderMeasure();
        hooks.onTool?.(t);
    }

    function toggleWall(id) {
        const w = WALLS[+id.slice(1)];
        if (w[4] === "b") return hooks.toast?.("Load-bearing walls (black) cannot be removed");
        if (w[4] === "e") return hooks.toast?.("Exterior walls are part of the building envelope and should not be removed");
        const on = plan.toggleWall(id);
        hooks.toast?.(on ? `Marked ${Math.max(w[2] - w[0], w[3] - w[1])} mm of wall for removal` : "Wall restored");
    }

    /** End the current drag: a moved furniture item goes into the undo stack */
    function endDrag(cancel) {
        const d = drag;
        drag = null;
        if (!d) return;
        if (d.kind === "measure") {
            if (cancel) { mA = mCur = null; renderMeasure(); return; }
            if (d.moved && mA && mCur && Math.hypot(mCur.x - mA.x, mCur.y - mA.y) > 20) {
                const a = mA, b = mCur;
                mA = mCur = null;
                plan.addMeasures([{ a, b }]);
            }
            renderMeasure(); return; // no drag: keep the start point, wait for the second click
        }
        if (d.kind === "pan") {
            if (!cancel && !d.moved && tool === "select") plan.setSel(d.room ? { kind: "room", id: d.room } : null);
            return;
        }
        if (d.moved) plan.commit(d.before); // onChange → 3D incremental rebuild
    }

    /* ======================= Pointer interaction ======================= */

    function onPointerMove(e) {
        if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch) {
            if (touches.size < 2) return;
            const [a, b] = [...touches.values()];
            const r = svg.getBoundingClientRect();
            const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
            const c = [(a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top];
            const ns = Math.max(0.012, Math.min(2, pinch.s * d / pinch.d));
            view.s = ns; view.x0 = pinch.px - c[0] / ns; view.y0 = pinch.py - c[1] / ns;
            applyView(); return;
        }
        const p = toMM(e.clientX, e.clientY);
        hooks.onHover?.({ x: Math.round(p.x), y: Math.round(p.y) });
        if (!drag) {
            const el = e.target?.closest?.("[data-room]");
            hooks.onRoomHover?.(el ? el.dataset.room : null);
            if (tool === "measure" && mA) { mCur = snapPoint(p, e.shiftKey); renderMeasure(); }
            return;
        }
        const far = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) >= TAP;
        if (drag.kind === "measure") {
            if (far) drag.moved = true;
            mCur = snapPoint(p, e.shiftKey); renderMeasure(); return;
        }
        if (drag.kind === "pan") {
            if (!drag.moved && !far) return;
            drag.moved = true;
            view.x0 = drag.x0 - (e.clientX - drag.sx) / view.s;
            view.y0 = drag.y0 - (e.clientY - drag.sy) / view.s;
            applyView(); return;
        }
        const f = plan.getF(drag.id);
        if (!f) return;
        if (!drag.moved && !far) return; // a light tap on furniture must not jostle it
        drag.moved = true;
        if (drag.kind === "move") {
            [f.cx, f.cy] = snapMove(f, p.x - drag.ox, p.y - drag.oy);
        } else if (drag.kind === "rot") {
            let a = Math.atan2(p.y - f.cy, p.x - f.cx) * 180 / Math.PI + 90;
            f.rot = norm(e.shiftKey ? a : Math.round(a / 15) * 15);
        } else if (drag.kind === "size") {
            const a = (f.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
            const dx = p.x - f.cx, dy = p.y - f.cy, lx = dx * c + dy * s, ly = -dx * s + dy * c;
            const ax = -f.w / 2, ay = -f.d / 2;
            const nw = Math.max(100, Math.round((lx - ax) / 10) * 10), nd = Math.max(100, Math.round((ly - ay) / 10) * 10);
            const mx = ax + nw / 2, my = ay + nd / 2;
            f.cx += mx * c - my * s; f.cy += mx * s + my * c; f.w = nw; f.d = nd;
        }
        renderFurn(); renderSel();
    }

    function onPointerEnd(e) {
        touches.delete(e.pointerId);
        if (pinch) { if (touches.size < 2) pinch = null; return; }
        endDrag(e.type === "pointercancel");
    }

    svg.addEventListener("pointerdown", e => {
        if (e.button === 1 || e.button === 2) return;
        if (e.pointerType !== "mouse") {
            touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touches.size >= 2) {
                endDrag(drag?.kind === "measure" || drag?.kind === "pan");
                const [a, b] = [...touches.values()];
                const r = svg.getBoundingClientRect();
                const c = [(a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top];
                pinch = { d: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), c, s: view.s, px: view.x0 + c[0] / view.s, py: view.y0 + c[1] / view.s };
                return;
            }
        }
        if (pinch) return;
        const p = toMM(e.clientX, e.clientY), t = e.target;
        if (tool === "measure") {
            const q = snapPoint(p, e.shiftKey);
            if (!mA) { mA = q; mCur = q; drag = { kind: "measure", sx: e.clientX, sy: e.clientY, moved: false }; }
            else {
                const a = mA; mA = null; mCur = null;
                if (Math.hypot(q.x - a.x, q.y - a.y) > 20) plan.addMeasures([{ a, b: q }]);
            }
            renderMeasure(); return;
        }
        const h = t.closest?.("[data-handle]");
        if (h && plan.sel.value?.kind === "furn") {
            drag = { kind: h.dataset.handle, id: plan.sel.value.id, sx: e.clientX, sy: e.clientY, before: plan.snap(), moved: false };
        } else if (tool === "demolish" && t.closest?.("[data-wall]")) {
            toggleWall(t.closest("[data-wall]").dataset.wall); return;
        } else if (tool === "select" && t.closest?.("[data-fid]")) {
            const f = plan.getF(t.closest("[data-fid]").dataset.fid);
            if (f) {
                if (plan.sel.value?.id !== f.id) plan.setSel({ kind: "furn", id: f.id });
                drag = { kind: "move", id: f.id, sx: e.clientX, sy: e.clientY, ox: p.x - f.cx, oy: p.y - f.cy, before: plan.snap(), moved: false };
            }
        } else {
            const room = t.closest?.("[data-room]");
            drag = { kind: "pan", sx: e.clientX, sy: e.clientY, x0: view.x0, y0: view.y0, room: room?.dataset.room, moved: false };
        }
    });

    // pointermove/up/cancel are bound on window: the tri-3d EventManager calls setPointerCapture
    // on the container at pointerdown, stealing the SVG's capture and redirecting events to the
    // container — window-level listeners are the only reliable ones
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    svg.addEventListener("wheel", e => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        zoomAt(view.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    svg.addEventListener("dblclick", e => {
        const g = e.target.closest?.("[data-fid]");
        if (tool === "select" && g) plan.rotateFurn(g.dataset.fid, 90);
    });
    svg.addEventListener("contextmenu", e => {
        if (tool === "measure") { e.preventDefault(); mA = null; renderMeasure(); }
    });

    /* ======================= Keyboard (responds only while 2D is active) ======================= */

    function onKey(e) {
        if (!hooks.is2dActive?.() || e.target.matches?.("input,select,textarea")) return;
        const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
        if (mod && k === "z") { e.preventDefault(); e.shiftKey ? plan.redo() : plan.undo(); return; }
        if (mod && k === "y") { e.preventDefault(); plan.redo(); return; }
        if (mod) return;
        if (k === "t") { hooks.onToggleView?.(); return; }
        if (k === "v") setTool("select");
        else if (k === "m") setTool("measure");
        else if (k === "x") setTool("demolish");
        else if (k === "f") fitView();
        else if (k === "r" && plan.sel.value?.kind === "furn") plan.rotateFurn(plan.sel.value.id, e.shiftKey ? -90 : 90);
        else if (k === "delete" || k === "backspace") {
            e.preventDefault();
            if (plan.sel.value?.kind === "furn") plan.removeFurn(plan.sel.value.id);
        } else if (k === "escape") {
            if (mA) { mA = null; renderMeasure(); }
            else { if (tool !== "select") setTool("select"); plan.setSel(null); }
        } else if (k.startsWith("arrow") && plan.sel.value?.kind === "furn") {
            e.preventDefault();
            const st = e.shiftKey ? 100 : 10, f = plan.getF(plan.sel.value.id);
            if (!f) return;
            const patch = { cx: f.cx, cy: f.cy };
            if (k === "arrowleft") patch.cx -= st;
            if (k === "arrowright") patch.cx += st;
            if (k === "arrowup") patch.cy -= st;
            if (k === "arrowdown") patch.cy += st;
            plan.editFurn(f.id, patch);
        } else if (k === "+" || k === "=") zoomAt(view.s * 1.25, svg.clientWidth / 2, svg.clientHeight / 2);
        else if (k === "-") zoomAt(view.s * 0.8, svg.clientWidth / 2, svg.clientHeight / 2);
    }
    document.addEventListener("keydown", onKey);

    /* ======================= Library drag-and-drop (ghost image) ======================= */

    let libDrag = null;
    /** Called by the app on a library item's pointerdown; drop onto the 2D plan or the 3D floor */
    function beginLibDrag(item, e) {
        if (e.button) return;
        libDrag = { item, id: e.pointerId, sx: e.clientX, sy: e.clientY, ghost: null };
        window.addEventListener("pointermove", onWinMove);
        window.addEventListener("pointerup", upOk);
        window.addEventListener("pointercancel", upCancel);
    }

    function onWinMove(e) {
        if (!libDrag || e.pointerId !== libDrag.id) return;
        const { item } = libDrag;
        if (!libDrag.ghost) {
            if (Math.hypot(e.clientX - libDrag.sx, e.clientY - libDrag.sy) < TAP) return;
            const g = (libDrag.ghost = document.createElement("div"));
            g.className = "fp-lib-ghost";
            g.innerHTML = `<svg viewBox="${-item[2] / 2} ${-item[3] / 2} ${item[2]} ${item[3]}">${furnSVG(item[0], item[2], item[3], item[4])}</svg>`;
            document.body.appendChild(g);
        }
        // the ghost image renders at real size using the scale at the drop point
        const is2d = hooks.is2dActive?.();
        const p = is2d ? toMM(e.clientX, e.clientY) : hooks.groundAt?.(e.clientX, e.clientY);
        const s = Math.max((is2d ? view.s : p?.s) || (is2d ? view.s : 0.05), 0.02);
        Object.assign(libDrag.ghost.style, { width: Math.max(28, item[2] * s) + "px", height: Math.max(20, item[3] * s) + "px", left: e.clientX + "px", top: e.clientY + "px" });
    }

    function onWinUp(e, ok) {
        if (!libDrag || e.pointerId !== libDrag.id) return;
        const d = libDrag;
        libDrag = null;
        window.removeEventListener("pointermove", onWinMove);
        window.removeEventListener("pointerup", upOk);
        window.removeEventListener("pointercancel", upCancel);
        if (d.ghost) {
            d.ghost.remove();
            if (!ok) return;
            const is2d = hooks.is2dActive?.();
            const p = is2d ? toMM(e.clientX, e.clientY) : hooks.groundAt?.(e.clientX, e.clientY);
            if (p) hooks.addItemAt?.(d.item, p.x, p.y);
            return;
        }
        if (!ok) return;
        // light tap: drop at the selected room's center, else the view center (3D uses the screen center's floor position)
        let p = null;
        const sel = plan.sel.value;
        if (sel?.kind === "room") {
            const b = bbox(ROOMS.find(r => r.id === sel.id).poly);
            p = { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 };
        } else if (hooks.is2dActive?.()) {
            p = { x: view.x0 + svg.clientWidth / 2 / view.s, y: view.y0 + svg.clientHeight / 2 / view.s };
        } else {
            const r = host.getBoundingClientRect();
            p = hooks.groundAt?.(r.left + r.width / 2, r.top + r.height / 2);
        }
        if (p) hooks.addItemAt?.(d.item, p.x, p.y);
    }
    const upOk = e => onWinUp(e, true);
    const upCancel = e => onWinUp(e, false);

    /* ======================= Subscription / sizing ======================= */

    // state changes (undo/redo/3D panel actions) → redraw 2D; drags redraw manually here, and the onChange redraw is idempotent
    const offChange = plan.onChange(() => renderAll());

    const ro = new ResizeObserver(() => {
        const w = svg.clientWidth, h = svg.clientHeight;
        if (!w || !h) return;
        if (!svg.dataset.sized) { fitView(); svg.dataset.sized = "1"; }
        else applyView();
    });
    ro.observe(svg);

    /* ======================= Export (2D PNG) ======================= */

    function exportPNG() {
        const clone = svg.cloneNode(true);
        const W = 3200, H = Math.round((W * BOUNDS.h) / BOUNDS.w);
        clone.setAttribute("viewBox", `${BOUNDS.x} ${BOUNDS.y} ${BOUNDS.w} ${BOUNDS.h}`);
        clone.setAttribute("width", W); clone.setAttribute("height", H);
        clone.querySelector("#fp-gSel").innerHTML = "";
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        Object.entries({ x: -20000, y: -20000, width: 55000, height: 55000, fill: "#f7f4ee" }).forEach(([k, v]) => bg.setAttribute(k, v));
        clone.insertBefore(bg, clone.querySelector("#fp-gGrid"));
        const img = new Image();
        img.onload = () => {
            const cv = document.createElement("canvas");
            cv.width = W; cv.height = H;
            cv.getContext("2d").drawImage(img, 0, 0, W, H);
            cv.toBlob(b => hooks.download?.(`${"floor-plan-design"}-2d.png`, b));
        };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    }

    fitView();
    renderAll();

    return {
        layers,
        /** Hooks object (the app can attach onView/onHover/onRoomHover callbacks later) */
        hooks,
        /** View transform {x0,y0,s} (used by the scale bar) */
        view,
        get tool() { return tool; },
        setTool,
        fitView,
        getViewport,
        beginLibDrag,
        /** Center zoom / fixed-ratio display (used by the header zoom buttons) */
        zoomBy: k => zoomAt(view.s * k, svg.clientWidth / 2, svg.clientHeight / 2),
        setRatio: r => zoomAt(1 / (r * PX_MM), svg.clientWidth / 2, svg.clientHeight / 2),
        exportPNG,
        /** Plan coords of the view center / selected room center (used for tap-to-place) */
        centerMM() {
            const sel = plan.sel.value;
            if (sel?.kind === "room") {
                const b = bbox(ROOMS.find(r => r.id === sel.id).poly);
                return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 };
            }
            return { x: view.x0 + svg.clientWidth / 2 / view.s, y: view.y0 + svg.clientHeight / 2 / view.s };
        },
        renderAll,
        dispose() {
            if (disposed) return;
            disposed = true;
            offChange();
            ro.disconnect();
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerEnd);
            window.removeEventListener("pointercancel", onPointerEnd);
            document.removeEventListener("keydown", onKey);
            svg.remove();
        },
    };
}

/** Library item data accessor (app-side catalog item → beginLibDrag param) */
export const libItemOf = (catalog, ci, ii) => LIB[ci]?.items[ii];

import { reactive, ref } from "vue";
import { LIB, MATS, WALLS, aabb, defaultState, norm } from "../engine/floorplan/data";

/** Furniture instance id (duplicates go through this too) */
const uid = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/**
 * Floor-plan store (framework-style port of the reference page's "state / history / storage" section).
 * Vue reactive holds the state for direct panel binding; the undo stack stores JSON snapshots (150 steps, matching the reference).
 * 3D/2D (phase 4) share the same instance; the world side subscribes via onChange to trigger incremental rebuilds.
 */

// v2: data.js names are English natively; the old v1 key held saves with Chinese names (pre-i18n-removal), ignored on purpose
const STORE_KEY = "floorplan-studio";

function fixState(s) {
    const d = defaultState();
    s.rooms = Object.assign(d.rooms, s.rooms || {});
    s.demolished = s.demolished || [];
    s.measures = s.measures || [];
    if (!Array.isArray(s.furniture)) s.furniture = [];
    return s;
}

function load() {
    try {
        const s = JSON.parse(localStorage.getItem(STORE_KEY));
        if (s && Array.isArray(s.furniture)) return fixState(s);
    } catch (e) { /* corrupt old save falls back to the default plan */ }
    return null;
}

/** Panel color palette (furniture recolor) */
export const PALETTE = ["#c9d6df", "#d8c7dc", "#e8d5b5", "#b7c4b0", "#c3cbd6", "#d6b99a", "#e0b98f", "#9dbb8c", "#e2cfb4", "#4a4f55"];

/**
 * @returns {PlanStore}
 * @typedef {object} PlanStore
 * @property {object} state { furniture, rooms, demolished, measures } (reactive)
 * @property {import("vue").Ref<{kind: "furn"|"room"|null, id: string}|null>} sel current selection
 * @property {import("vue").Ref<number>} undoLen / redoLen undo stack length (grays out panel buttons)
 */
export function createPlan() {
    const reactiveState = reactive(fixState(load() || defaultState()));
    const sel = ref(null);
    const undoLen = ref(0), redoLen = ref(0);
    const undoStack = [], redoStack = [];
    const listeners = new Set();

    const notify = () => listeners.forEach(fn => fn());
    const snap = () => JSON.stringify(reactiveState);

    function save() {
        try { localStorage.setItem(STORE_KEY, snap()); } catch (e) { /* private mode etc.: write failures are non-fatal */ }
    }

    /** Commit a change: `before` is the pre-change snapshot; clears the redo stack and notifies subscribers */
    function commit(before) {
        undoStack.push(before);
        if (undoStack.length > 150) undoStack.shift();
        redoStack.length = 0;
        undoLen.value = undoStack.length; redoLen.value = 0;
        save(); notify();
    }

    function mutate(fn) {
        const b = snap();
        fn(reactiveState);
        commit(b);
    }

    function restore(json) {
        const next = JSON.parse(json);
        // replace the reactive object in place so panel references stay valid
        Object.keys(reactiveState).forEach(k => delete reactiveState[k]);
        Object.assign(reactiveState, next);
        undoLen.value = undoStack.length; redoLen.value = redoStack.length;
        save(); notify();
    }

    function undo() {
        if (!undoStack.length) return false;
        redoStack.push(snap());
        restore(undoStack.pop());
        return true;
    }

    function redo() {
        if (!redoStack.length) return false;
        undoStack.push(snap());
        restore(redoStack.pop());
        return true;
    }

    const getF = id => reactiveState.furniture.find(f => f.id === id);

    function validateSel() {
        const s = sel.value;
        if (s?.kind === "furn" && !getF(s.id)) sel.value = null;
    }

    /** Select (validates furniture existence; null clears).
     *  Notifies listeners: the 2D selection box redraws via onChange (sel is not in the undo stack,
     *  not a mutate) — otherwise the panel (Vue reactive) switches while the 2D selection box stays on the old item. */
    function setSel(v) {
        if (v?.kind === "furn" && !getF(v.id)) return;
        const next = v ? { kind: v.kind, id: v.id } : null;
        if (sel.value?.kind === next?.kind && sel.value?.id === next?.id) return;
        sel.value = next;
        notify();
    }

    function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

    /* ============ Panel actions (all go through mutate into the undo stack) ============ */

    function setRoomName(id, name) {
        mutate(st => { if (st.rooms[id]) st.rooms[id].name = name; });
    }

    function setRoomMat(id, mat) {
        mutate(st => { if (st.rooms[id]) st.rooms[id].mat = mat; });
    }

    /** Furniture recolor (same-color calls would add an extra undo step; the reference leaves that check to callers) */
    function setFurnColor(id, color) {
        const f = getF(id);
        if (f && f.color !== color) mutate(() => { f.color = color; });
    }

    function rotateFurn(id, delta) {
        const f = getF(id);
        if (f) mutate(() => { f.rot = norm(f.rot + delta); });
    }

    function removeFurn(id) {
        const i = reactiveState.furniture.findIndex(f => f.id === id);
        if (i >= 0) {
            mutate(st => st.furniture.splice(st.furniture.findIndex(f => f.id === id), 1));
            if (sel.value?.id === id) sel.value = null;
        }
    }

    /** Drop from the furniture library: placed staggered near the plan center; the user drags it to its target afterwards */
    function addFurniture(item, cx = 6000, cy = 5300) {
        const [type, name, w, d, color] = item;
        const f = { id: uid(), type, name, cx, cy, w, d, rot: 0, color };
        mutate(st => (type === "rug" ? st.furniture.unshift(f) : st.furniture.push(f)));
        sel.value = { kind: "furn", id: f.id };
        return f;
    }

    /* ============ 2D editing actions (phase 4) ============ */

    /** Edit one furniture item's geometry directly (cx/cy/w/d/rot/color); goes into the undo stack */
    function editFurn(id, patch) {
        const f = getF(id);
        if (f) mutate(() => Object.assign(f, patch));
    }

    function duplicateFurn(id) {
        const f = getF(id);
        if (!f) return null;
        const n = { ...f, id: uid(), cx: f.cx + 200, cy: f.cy + 200 };
        mutate(st => st.furniture.push(n));
        sel.value = { kind: "furn", id: n.id };
        return n;
    }

    /** Front/back ordering: rugs stay at the bottom; everything else draws in array order */
    function orderFurn(id, toBack) {
        const i = reactiveState.furniture.findIndex(f => f.id === id);
        if (i < 0) return;
        const [it] = reactiveState.furniture.splice(i, 1);
        mutate(st => (toBack ? st.furniture.unshift(it) : st.furniture.push(it)));
    }

    /** Demolish/restore wall (bearing walls b and exterior walls e are intercepted with a toast by the 2D layer; this only toggles) */
    function toggleWall(id) {
        const on = reactiveState.demolished.includes(id);
        mutate(st => (st.demolished = on ? st.demolished.filter(x => x !== id) : [...st.demolished, id]));
        return !on;
    }

    /** If a freshly dropped item overlaps a wall/window, push it out along the shallower penetration axis (reference-page pushOut) */
    function pushOut(f) {
        const rects = WALLS.filter((_, i) => !reactiveState.demolished.includes("w" + i));
        for (let n = 0; n < 4; n++) {
            let moved = false;
            for (const r of rects) {
                const { hw, hh } = aabb(f);
                const ox = Math.min(f.cx + hw, r[2]) - Math.max(f.cx - hw, r[0]);
                const oy = Math.min(f.cy + hh, r[3]) - Math.max(f.cy - hh, r[1]);
                if (ox <= 0 || oy <= 0) continue;
                if (ox < oy) f.cx = f.cx < (r[0] + r[2]) / 2 ? r[0] - hw : r[2] + hw;
                else f.cy = f.cy < (r[1] + r[3]) / 2 ? r[1] - hh : r[3] + hh;
                moved = true;
            }
            if (!moved) return;
        }
    }

    function addMeasures(list) { mutate(st => st.measures.push(...list)); }
    function clearMeasures() { if (reactiveState.measures.length) mutate(st => (st.measures = [])); }

    function clearLayout() {
        if (!reactiveState.furniture.length) return false;
        mutate(st => (st.furniture = []));
        sel.value = null;
        return true;
    }

    /** Import plan JSON (validated before entering the store; undoable) */
    function importState(s) {
        if (!s || !Array.isArray(s.furniture)) return false;
        const b = snap();
        const next = fixState(JSON.parse(JSON.stringify(s)));
        Object.keys(reactiveState).forEach(k => delete reactiveState[k]);
        Object.assign(reactiveState, next);
        sel.value = null;
        commit(b);
        return true;
    }

    /** Reset to the default plan (undoable) */
    function resetState() {
        const b = snap();
        const next = fixState(defaultState());
        Object.keys(reactiveState).forEach(k => delete reactiveState[k]);
        Object.assign(reactiveState, next);
        sel.value = null;
        commit(b);
        return true;
    }

    return {
        state: reactiveState, sel, undoLen, redoLen,
        snap, commit, mutate, undo, redo, getF, validateSel, setSel, onChange,
        setRoomName, setRoomMat, setFurnColor, rotateFurn, removeFurn, addFurniture,
        editFurn, duplicateFurn, orderFurn, toggleWall, pushOut,
        addMeasures, clearMeasures, clearLayout, importState, resetState,
        catalog: LIB, mats: MATS,
    };
}

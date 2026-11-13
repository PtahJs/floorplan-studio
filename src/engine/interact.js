import { BoxHelper, Plane, Raycaster, Vector2, Vector3 } from "three/webgpu";
import { SERVICE } from "@ptahjs/tri-3d";
import { OX, OY, WALLS, aabb, wx, wz } from "./floorplan/data";
import { glassMat } from "./floorplan/materials";

/**
 * 3D interaction layer (port of the reference page's pick / groundAt / updateSel / furniture dragging / tap-to-toggle doors).
 * Pick semantics match the reference: glass does not block; the first hit decides the meaning
 * (door → toggle, furniture → select, room floor → select room, blocked by a wall → clear selection);
 * dragging preempts OrbitControls via capture-phase listeners.
 */

const TAP = matchMedia("(pointer:coarse)").matches ? 9 : 4; // pointer must move this many px to count as a drag
const GRID = 10;                                            // grid snap step, mm
const WALL_TOL = 80;                                        // 3D drag wall-snap tolerance, mm (the reference scales it with the 2D viewport; a fixed value here)

/** Grid snapping + wall-edge attachment (reference page snapMove; demolished walls do not participate) */
function snapMove(f, cx, cy, snapRects) {
    let nx = Math.round(cx / GRID) * GRID, ny = Math.round(cy / GRID) * GRID;
    const { hw, hh } = aabb(f);
    let bx = WALL_TOL, by = WALL_TOL;
    for (const r of snapRects) {
        if (!(r[3] < cy - hh - WALL_TOL || r[1] > cy + hh + WALL_TOL))
            for (const ex of [r[0], r[2]]) for (const c of [ex + hw, ex - hw])
                if (Math.abs(c - cx) < bx) { bx = Math.abs(c - cx); nx = c; }
        if (!(r[2] < cx - hw - WALL_TOL || r[0] > cx + hw + WALL_TOL))
            for (const ey of [r[1], r[3]]) for (const c of [ey + hh, ey - hh])
                if (Math.abs(c - cy) < by) { by = Math.abs(c - cy); ny = c; }
    }
    return [nx, ny];
}

/**
 * @param {import("@ptahjs/tri-3d").Tri3D} engine
 * @param {import("./floorplan/world").FloorplanWorld} world
 * @param {import("../stores/plan").PlanStore} plan
 */
export function createInteract(engine, world, plan) {
    const cv = engine.container.querySelector("canvas");
    const camera = () => engine.services.get(SERVICE.CAMERA_MANAGER)?.currentCamera;
    const orbit = () => engine.services.get(SERVICE.ORBIT_CONTROLS)?.instance;

    const ray = new Raycaster(), ptr = new Vector2();
    const ground0 = new Plane(new Vector3(0, 1, 0), 0);
    const hitV = new Vector3();

    let selHelper = null, selKey = null, selDirty = true;
    let downAt = null, fdrag = null, hoverAt = 0;

    const snapRects = () => WALLS.filter((_, i) => !plan.state.demolished.includes("w" + i));

    /* ============ Picking ============ */

    function pick(x, y) {
        const cam = camera();
        if (!cam) return null;
        const r = cv.getBoundingClientRect();
        ptr.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ptr, cam);
        const hits = ray.intersectObjects([...(world.opt.furn ? [world.furnGroup] : []), world.archUp, world.archFloor], true);
        for (const h of hits) {
            let o = h.object;
            if (o.material === glassMat || Array.isArray(o.material) && o.material.includes(glassMat)) continue;
            if (o.userData.door) return { door: o.userData.door, dist: h.distance };
            if (o.userData.room) return { room: o.userData.room };
            while (o && !o.userData.fid && o.parent) o = o.parent;
            if (o?.userData.fid) return { fid: o.userData.fid, dist: h.distance };
            return null; // blocked by a wall
        }
        return null;
    }

    /** Tolerant picking (thin small pieces need not be pixel-perfect): an exact door/furniture hit wins;
     *  otherwise the nearest furniture hit within a ±tol px grid. Wall semantics stay exact (an exact wall hit
     *  → no selecting through the wall). */
    function pickTolerant(x, y, tol = 8) {
        const exact = pick(x, y);
        if (exact?.fid || exact?.door) return exact;
        let best = null;
        for (let dx = -tol; dx <= tol; dx += 4)
            for (let dy = -tol; dy <= tol; dy += 4) {
                if (!dx && !dy) continue;
                const h = pick(x + dx, y + dy);
                if (h?.fid && (!best || h.dist < best.dist)) best = h;
            }
        return best ?? exact;
    }

    /** Screen point → ground plan coords (mm); if the ray hits a wall first, the drop point is at the wall (no dropping through walls) */
    function groundAt(x, y) {
        const cam = camera();
        if (!cam) return null;
        const r = cv.getBoundingClientRect();
        ptr.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ptr, cam);
        if (!ray.ray.intersectPlane(ground0, hitV) || hitV.distanceTo(cam.position) > 60) return null;
        const wall = ray.intersectObjects([world.archUp, world.archFloor], true)
            .find(h => h.object.material !== glassMat && h.object.visible);
        if (wall && wall.distance < hitV.distanceTo(cam.position) - 0.01) hitV.set(wall.point.x, 0, wall.point.z);
        // s = screen pixels per mm at the drop point (same as the reference page's groundAt): the library drag ghost renders at real size via this (bigger when closer)
        const px = v => new Vector2(v.x * r.width / 2, v.y * r.height / 2);
        const a = px(hitV.clone().project(cam));
        const s = Math.max(
            a.distanceTo(px(hitV.clone().add(new Vector3(1, 0, 0)).project(cam))),
            a.distanceTo(px(hitV.clone().add(new Vector3(0, 0, 1)).project(cam))),
        ) / 1000;
        return { x: hitV.x * 1000 + OX, y: hitV.z * 1000 + OY, s };
    }

    /* ============ Selection helper box ============ */

    function clearHelper() {
        if (selHelper) {
            world.engineScene.remove(selHelper);
            selHelper.geometry.dispose();
            selHelper = null;
        }
    }

    function updateSel() {
        const s = plan.sel.value;
        const key = s?.kind === "furn" ? s.id : "";
        if (key !== selKey || (key && selDirty)) {
            selKey = key; selDirty = false;
            clearHelper();
            const g = key && world.furnGroup.children.find(o => o.userData.fid === key);
            if (g) { selHelper = new BoxHelper(g, 0xb5653a); world.engineScene.add(selHelper); }
        }
        if (selHelper) selHelper.update();
    }

    /* ============ Pointer interaction ============ */

    function onDown(e) {
        downAt = [e.clientX, e.clientY];
        // Dragging the selected furniture: capture phase preempts OrbitControls to avoid rotating the camera at the same time
        // (same guard as the reference page: no dragging during transitions / walk mode)
        if (!e.isPrimary || fdrag || engine.viewmode?.busy || world.opt.mode !== "orbit" || plan.sel.value?.kind !== "furn") return;
        const h = pickTolerant(e.clientX, e.clientY), f = h?.fid === plan.sel.value.id && plan.getF(h.fid);
        const g = f && groundAt(e.clientX, e.clientY);
        if (!g) return;
        fdrag = { id: f.id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox: g.x - f.cx, oy: g.y - f.cy, before: plan.snap(), moved: false };
        if (orbit()) orbit().enabled = false;
        cv.setPointerCapture(e.pointerId);
    }

    function onMove(e) {
        // Hover feedback (when not dragging): over furniture/door → pointer cursor, hinting it's clickable (picking is tolerant, throttled to ~30Hz)
        if (!fdrag && engine.viewmode?.mode === "3d" && world.opt.mode === "orbit") {
            const now = performance.now();
            if (now - hoverAt > 33) {
                hoverAt = now;
                cv.style.cursor = pickTolerant(e.clientX, e.clientY)?.fid || pick(e.clientX, e.clientY)?.door ? "pointer" : "";
            }
        }
        if (!fdrag || e.pointerId !== fdrag.pid) return;
        if (!fdrag.moved && Math.hypot(e.clientX - fdrag.sx, e.clientY - fdrag.sy) < TAP) return;
        const f = plan.getF(fdrag.id), g = groundAt(e.clientX, e.clientY);
        if (!f || !g) return;
        fdrag.moved = true;
        cv.style.cursor = "grabbing";
        [f.cx, f.cy] = snapMove(f, g.x - fdrag.ox, g.y - fdrag.oy, snapRects());
        // while dragging, only move the model (no whole-tree rebuild); commit the full sync on release
        world.furnGroup.children.find(o => o.userData.fid === f.id)?.position.set(wx(f.cx), 0, wz(f.cy));
    }

    function endDrag(e) {
        if (!fdrag || e.pointerId !== fdrag.pid) return;
        const d = fdrag;
        fdrag = null;
        if (orbit()) orbit().enabled = true;
        cv.style.cursor = ""; // hover cursor restored by onMove
        if (d.moved) plan.commit(d.before); // onChange → world.sync
    }

    function onUp(e) {
        endDrag(e);
        const tap = downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) <= TAP;
        downAt = null;
        if (!tap || engine.viewmode?.busy || world.opt.mode !== "orbit") return; // no tap-select during transitions / walk mode (reference guard)
        const h = pickTolerant(e.clientX, e.clientY);
        if (h?.door) h.door.open = !h.door.open;
        else if (h?.fid) plan.setSel({ kind: "furn", id: h.fid });
        else if (h?.room) plan.setSel({ kind: "room", id: h.room });
        else plan.setSel(null);
    }

    /* ============ Frame driver: door easing + selection box ============ */

    const af = engine.services.get(SERVICE.ANIMATION_FRAME);
    const unframe = af?.frame(dt => {
        const k = Math.min(1, dt * 6);
        world.doors.forEach(d => {
            const tg = d.open ? d.a1 : d.a0;
            d.cur += (tg - d.cur) * k;
            d.pivot.rotation.y = d.cur;
        });
        updateSel();
    });

    // after a state rebuild the furniture group is a fresh object; the selection box must re-attach
    const offChange = plan.onChange(() => { selDirty = true; plan.validateSel(); });
    cv.addEventListener("pointerdown", onDown, true); // capture phase preempts OrbitControls
    // pointermove/up/cancel bound on window: EventManager calls setPointerCapture on the container at
    // pointerdown, so pointerup gets redirected to the container and a canvas listener never fires
    // (root cause of "3D tap-select not working"; same pitfall as the 2D stuck-mouse bug)
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", endDrag);

    /** 3D screenshot (reference page View3D.shot: export the canvas as PNG on the next frame) */
    function shot3d() {
        requestAnimationFrame(() => {
            const a = document.createElement("a");
            a.href = cv.toDataURL("image/png");
            a.download = `${"floor-plan-design"}-3d.png`;
            a.click();
        });
    }

    return {
        pick, pickTolerant, groundAt, shot3d,
        invalidateSel: () => { selDirty = true; },
        dispose() {
            offChange();
            unframe?.();
            cv.removeEventListener("pointerdown", onDown, true);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", endDrag);
            clearHelper();
        },
    };
}

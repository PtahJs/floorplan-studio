import { Euler, MathUtils, Vector3 } from "three/webgpu";
import { SERVICE } from "@ptahjs/tri-3d";
import { H, wx, wz } from "./floorplan/data";

/**
 * Walk mode (port of the reference page's setMode('walk') / blocked / stepWalk / lookBy).
 * No PointerLock dependency: on desktop, hold and drag on the canvas to look around (no conflict since
 * OrbitControls has yielded); WASD / arrow keys move, Shift runs; collision uses colliders AABBs plus
 * door-leaf segment radius blocking. During walk mode OrbitControls is disabled and the engine runs continuous(true).
 */

const clamp01 = t => Math.max(0, Math.min(1, t));
const keys = {};

/**
 * @param {import("@ptahjs/tri-3d").Tri3D} engine
 * @param {import("./floorplan/world").FloorplanWorld} world
 */
export function createWalk(engine, world) {
    const cam = () => engine.services.get(SERVICE.CAMERA_MANAGER)?.currentCamera;
    const orbit = () => engine.services.get(SERVICE.ORBIT_CONTROLS)?.instance;
    const af = engine.services.get(SERVICE.ANIMATION_FRAME);
    const eul = new Euler(0, 0, 0, "YXZ");
    /** Walk look-drag state */
    let look = null;
    let walking = false;

    /** Collision: AABBs (expanded by radius r) + swing-door leaf segments (radius r*.8, so an open leaf still blocks near the hinge) */
    function blocked(x, z, r = 0.22) {
        for (const [x0, z0, x1, z1] of world.colliders)
            if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
        for (const d of world.doors) {
            const a = d.pivot.rotation.y, px = d.pivot.position.x, pz = d.pivot.position.z;
            const ex = px + Math.cos(a) * 0.9, ez = pz - Math.sin(a) * 0.9;
            const t = clamp01(((x - px) * (ex - px) + (z - pz) * (ez - pz)) / ((ex - px) ** 2 + (ez - pz) ** 2));
            if (Math.hypot(x - (px + t * (ex - px)), z - (pz + t * (ez - pz))) < r * 0.8) return true;
        }
        return false;
    }

    function stepWalk(dt) {
        const p = cam().position;
        const sp = (keys.ShiftLeft || keys.ShiftRight ? 2.6 : 1.4) * dt;
        const fwd = new Vector3();
        cam().getWorldDirection(fwd);
        fwd.y = 0; fwd.normalize();
        const right = new Vector3(-fwd.z, 0, fwd.x);
        const mv = new Vector3();
        if (keys.KeyW || keys.ArrowUp) mv.add(fwd);
        if (keys.KeyS || keys.ArrowDown) mv.sub(fwd);
        if (keys.KeyD || keys.ArrowRight) mv.add(right);
        if (keys.KeyA || keys.ArrowLeft) mv.sub(right);
        const mag = Math.min(1, mv.length());
        if (mag < 0.05) return;
        mv.normalize().multiplyScalar(sp * mag);
        if (!blocked(p.x + mv.x, p.z)) p.x += mv.x;
        if (!blocked(p.x, p.z + mv.z)) p.z += mv.z;
    }

    /** Drag to look around (YXZ Euler, pitch clamped to ±77°) */
    function lookBy(dx, dy) {
        eul.setFromQuaternion(cam().quaternion);
        eul.y += dx * 0.005;
        eul.x = MathUtils.clamp(eul.x + dy * 0.005, -1.35, 1.35);
        cam().quaternion.setFromEuler(eul);
    }

    function onDown(e) { if (walking) look = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
    function onMove(e) {
        if (!look || e.pointerId !== look.id) return;
        lookBy(e.clientX - look.x, e.clientY - look.y);
        look.x = e.clientX; look.y = e.clientY;
    }
    const onEnd = e => { if (look?.id === e.pointerId) look = null; };

    function onKeyDown(e) {
        if (e.target.matches?.("input,select,textarea")) return;
        keys[e.code] = true;
        // E toggles the door straight ahead
        if (walking && e.code === "KeyE") {
            const fwd = new Vector3();
            cam().getWorldDirection(fwd);
            const px = cam().position.x + fwd.x * 2.5, pz = cam().position.z + fwd.z * 2.5;
            let best = null, bd = 2.5;
            for (const d of world.doors) {
                const dist = Math.hypot(d.pivot.position.x - px, d.pivot.position.z - pz);
                if (dist < bd) { bd = dist; best = d; }
            }
            if (best) best.open = !best.open;
        }
    }
    const onKeyUp = e => { keys[e.code] = false; };

    const unframe = af.frame(dt => { if (walking && !engine.cameraRig?.flying) stepWalk(dt); });

    addEventListener("keydown", onKeyDown);
    addEventListener("keyup", onKeyUp);
    engine.container.addEventListener("pointerdown", onDown);
    engine.container.addEventListener("pointermove", onMove);
    engine.container.addEventListener("pointerup", onEnd);
    engine.container.addEventListener("pointercancel", onEnd);

    return {
        get active() { return walking; },
        /** E door-toggle probe distance (for white-box tests) */
        blocked,
        /** Enter walk mode: start outside the entry door, looking toward the entryway */
        enter() {
            walking = true;
            orbit().enabled = false;
            if (world.opt.cut < H) { world.opt.cut = H; world.sync(); }
            world.setWalkOnly(true);
            const c = cam();
            c.position.set(wx(4200), 1.6, wz(8755));
            c.lookAt(wx(7000), 1.5, wz(8755));
            af.continuous(true);
        },
        exit() {
            walking = false;
            look = null;
            orbit().enabled = true;
            world.setWalkOnly(false);
            af.continuous(false);
            // returning the camera to the orbit view is driven by the caller's flyTo
        },
        /** White-box test: advance one movement step directly */
        testStep(dt) { stepWalk(dt); },
        dispose() {
            this.exit();
            unframe();
            removeEventListener("keydown", onKeyDown);
            removeEventListener("keyup", onKeyUp);
            engine.container.removeEventListener("pointerdown", onDown);
            engine.container.removeEventListener("pointermove", onMove);
            engine.container.removeEventListener("pointerup", onEnd);
            engine.container.removeEventListener("pointercancel", onEnd);
        },
    };
}

import { SERVICE } from "@ptahjs/tri-3d";
import { M, ROOMS, wx, wz } from "./floorplan/data";
import { MathUtils, Spherical, Vector3 } from "three/webgpu";

/**
 * Camera poses and fly animations (port of the reference page's planPose / isoWhole / camTween / flyToRoom).
 * Spherical interpolation: the camera arcs and tilts around the target instead of flying straight through.
 * Animation frames are driven by ANIMATION_FRAME; a flight holds continuous frames and releases back to on-demand when done.
 */

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = t => Math.max(0, Math.min(1, t));

/** Whole-home top-down pose */
function topWholePose() {
    return { t: new Vector3(0, 0, 0), p: new Vector3(0, 19, 1e-4) };
}

const FOV = 45;

/**
 * Top-down pose exactly coinciding with the 2D viewport (reference page planPose):
 * at this height, the perspective camera's visible ground height = the 2D viewport height (mm → m).
 * @param {{cx:number, cy:number, visH:number}} vp getViewport() result (mm domain)
 */
function planPose(vp) {
    const visH = M(vp.visH);
    const dist = visH / 2 / Math.tan((FOV / 2) * Math.PI / 180);
    const t = new Vector3(wx(vp.cx), 0, wz(vp.cy));
    return { t, p: new Vector3(t.x, dist, t.z + 1e-4) };
}

const isoWholePose = () => ({ t: new Vector3(0, 0, 0), p: new Vector3(5.5, 15.5, 10) });

/**
 * @param {import("@ptahjs/tri-3d").Tri3D} engine
 * @param {import("./floorplan/world").FloorplanWorld} world
 */
export function createCameraRig(engine, world) {
    const cam = () => engine.services.get(SERVICE.CAMERA_MANAGER)?.currentCamera;
    const orbit = () => engine.services.get(SERVICE.ORBIT_CONTROLS)?.instance;
    const af = engine.services.get(SERVICE.ANIMATION_FRAME);

    let fly = null;
    const curPose = () => ({ t: orbit().target.clone(), p: cam().position.clone() });

    function setPose(P) {
        cam().position.copy(P.p);
        orbit().target.copy(P.t);
        cam().lookAt(P.t);
        orbit().update();
        engine.services.get(SERVICE.ANIMATION_FRAME).requestRender();
    }

    /** Spherical-interpolation flight (reference page camTween) */
    function camTween(A, B, e) {
        const t = A.t.clone().lerp(B.t, e);
        const sa = new Spherical().setFromVector3(A.p.clone().sub(A.t));
        const sb = new Spherical().setFromVector3(B.p.clone().sub(B.t));
        let dth = sb.theta - sa.theta;
        dth = Math.atan2(Math.sin(dth), Math.cos(dth));
        const s = new Spherical(sa.radius + (sb.radius - sa.radius) * e, sa.phi + (sb.phi - sa.phi) * e, sa.theta + dth * e);
        const c = cam();
        c.position.copy(t).add(new Vector3().setFromSpherical(s));
        c.lookAt(t);
        orbit().target.copy(t);
    }

    function flyTo(B, dur = 900) {
        if (world.opt.mode === "walk") return;
        fly = { t0: performance.now(), dur, A: curPose(), B };
        af.continuous(true); // hold continuous frames during the flight
    }

    const unframe = af.frame(() => {
        if (!fly) return;
        const t = clamp01((performance.now() - fly.t0) / fly.dur);
        camTween(fly.A, fly.B, ease(t));
        if (t >= 1) {
            fly = null;
            af.continuous(false); // release continuous frames, back to on-demand
        }
        orbit().update();
    });

    /** Room close-up: target the room's geometric center, distance shrinks with room size */
    function flyToRoom(id) {
        const r = ROOMS.find(o => o.id === id);
        if (!r) return;
        const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]);
        const t = new Vector3(wx((Math.min(...xs) + Math.max(...xs)) / 2), 0.6, wz((Math.min(...ys) + Math.max(...ys)) / 2));
        const size = M(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
        const dir = cam().position.clone().sub(orbit().target).setY(0);
        if (dir.lengthSq() < 0.01) dir.set(0.6, 0, 0.8);
        dir.normalize();
        const dist = size * 1.3 + 2.2;
        flyTo({ t, p: new Vector3(t.x + dir.x * dist * 0.7, dist * 1.05, t.z + dir.z * dist * 0.7) });
    }

    const isoFrom = P => {
        const d = MathUtils.clamp(P.p.y, 5, 30);
        const dir = new Vector3(0.3, 0.82, 0.49).normalize();
        return { t: P.t.clone(), p: P.t.clone().addScaledVector(dir, d) };
    };

    return {
        flyTo,
        flyToRoom,
        setPose,
        camTween,
        get flying() { return !!fly; },
        goIso() { flyTo(isoWholePose()); },
        goTop() { flyTo(topWholePose()); },
        /** 2D→3D transition: start from the top-down pose aligned with the 2D viewport and return it as A;
         *  the arc pull-up (B = isoFrom(A)) is driven by viewmode's transition frames (reference page enter does
         *  camTween while orbit.enabled=false); this does not flyTo on its own — two interpolations overwriting
         *  each other is the root cause of the abnormal rotation feel */
        enterFromViewport(vp) {
            const A = planPose(vp);
            setPose(A);
            return A;
        },
        /** Sync the OrbitControls toggle at transition start / end (reference page enter: disabled during the animation, restored after) */
        setOrbitEnabled(v) {
            const o = orbit();
            if (!o) return;
            o.enabled = v;
            if (v) o.update(); // after the camera was moved externally, align the controller's internal state with the current pose
        },
        /** 3D→2D transition target: top-down pose matching the current viewport */
        poseForViewport(vp) { return planPose(vp); },
        dispose() {
            unframe();
            if (fly) { fly = null; af.continuous(false); }
        },
    };
}

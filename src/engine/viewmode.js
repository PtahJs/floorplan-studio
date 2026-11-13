import { SERVICE } from "@ptahjs/tri-3d";
import { Vector3 } from "three/webgpu";

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = t => Math.max(0, Math.min(1, t));

/**
 * 2D / 3D view-mode switch orchestration (port of the reference page's setView / enter / exit).
 * 2D→3D: the camera first aligns top-down with the 2D viewport (same scale and position) → cross-fade 420ms →
 *        1700ms camera arcs up + walls grow (grow) + furniture rises afterwards (furnGrow).
 * 3D→2D: reversed — furniture retracts, walls sink, the camera returns to top-down coinciding with the 2D
 *        view, then cross-fades out.
 * The cross-fade is carried by CSS opacity transitions (the 3D container sits above the SVG).
 */

const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * @param {import("@ptahjs/tri-3d").Tri3D} engine
 * @param {import("./floorplan/world").FloorplanWorld} world
 * @param {import("./camera")} cameraRig
 * @param {import("./view2d")} view2d
 * @param {{ host3d: HTMLElement, view2dEl: HTMLElement }} els 3D container (opacity transition) / SVG container
 */
export function createViewMode(engine, world, cameraRig, view2d, els) {
    const af = engine.services.get(SERVICE.ANIMATION_FRAME);
    let mode = "2d"; // initial 2D: SVG plan on top, 3D canvas transparent
    let busy = false;
    let animFrame = null;

    /** 3D canvas opacity cross-transition; 2D state: canvas opacity 0 and receives no events (SVG does); 3D state: canvas fully opaque and receives events (SVG passes through) */
    function setCross(v) {
        els.host3d.style.opacity = String(v);
        els.host3d.style.pointerEvents = v >= 1 ? "auto" : "none";
        els.view2dEl.style.pointerEvents = v >= 1 ? "none" : "auto";
    }

    function stopAnim() {
        if (animFrame) { animFrame(); animFrame = null; af.continuous(false); }
    }

    /** 2D → 3D. Returns a Promise (animation complete) */
    async function enter() {
        if (busy || mode === "3d") return;
        busy = true;
        world.opt.mode = "orbit";
        // disable orbit controls during the animation: the damped update recomputes the camera pose every
        // frame and would overwrite camTween (the reference page's enter handles it the same way)
        cameraRig.setOrbitEnabled(false);
        const A = cameraRig.enterFromViewport(view2d.getViewport());
        // the 3D view now coincides exactly with the 2D plan: walls flattened + furniture retracted + camera top-down
        world.grow = 0; world.furnGrow = 0;
        world.applyGrow();
        world.setLabelsSuppressed(true); // hide room-name labels during the animation (temporary suppression, chip toggle untouched)
        setCross(1);
        await wait(420);
        // camera pull-up + growth animation (camTween and the grow frames advance together; B mirrors cameraRig.isoFrom)
        const B = { t: A.t.clone(), p: A.t.clone().addScaledVector(new Vector3(0.3, 0.82, 0.49).normalize(), Math.min(Math.max(A.p.y, 5), 30)) };
        const t0 = performance.now(), dur = 1700;
        af.continuous(true);
        await new Promise(res => {
            const un = af.frame(() => {
                const t = clamp01((performance.now() - t0) / dur);
                cameraRig.camTween(A, B, ease(clamp01(t / 0.85)));
                world.grow = ease(clamp01((t - 0.1) / 0.55));
                world.furnGrow = ease(clamp01((t - 0.45) / 0.5));
                world.applyGrow();
                if (t >= 1) { un(); animFrame = null; res(); } // unregister the callback: under on-demand rendering a leftover callback overwrites the camera every frame (root cause of broken rotation)
            });
            animFrame = un;
        });
        af.continuous(false);
        world.grow = 1; world.furnGrow = 1;
        world.applyGrow();
        // animation done: restore orbit controls + room-name labels (suppression lifted per the chip toggle; opt.labels was never polluted by the transition)
        cameraRig.setOrbitEnabled(true);
        world.setLabelsSuppressed(false);
        world.showLabels(world.opt.labels);
        mode = "3d";
        busy = false;
    }

    /** 3D → 2D. Returns a Promise (animation complete) */
    async function exit() {
        if (busy || mode === "2d") return;
        busy = true;
        cameraRig.setOrbitEnabled(false); // disable orbit controls during the animation (the reference page's exit does the same)
        world.setLabelsSuppressed(true); // back to 2D: suppress labels (stays suppressed in 2D until the next 3D entry lifts it)
        if (world.opt.mode === "walk") {
            engine.walk.exit();
            world.opt.mode = "orbit";
        }
        const A = { t: engine.services.get(SERVICE.ORBIT_CONTROLS).instance.target.clone(), p: engine.services.get(SERVICE.CAMERA_MANAGER).currentCamera.position.clone() };
        const B = cameraRig.poseForViewport(view2d.getViewport());
        const t0 = performance.now(), dur = 1300;
        af.continuous(true);
        await new Promise(res => {
            const un = af.frame(() => {
                const t = clamp01((performance.now() - t0) / dur);
                cameraRig.camTween(A, B, ease(clamp01((t - 0.1) / 0.9)));
                world.furnGrow = 1 - ease(clamp01(t / 0.45));
                world.grow = 1 - ease(clamp01((t - 0.2) / 0.6));
                world.applyGrow();
                if (t >= 1) { un(); animFrame = null; res(); } // unregister the callback (same as enter)
            });
            animFrame = un;
        });
        af.continuous(false);
        // the 3D view is now flattened to top-down, coinciding with the 2D plan → cross-fade out
        setCross(0);
        await wait(450);
        world.grow = 1; world.furnGrow = 1;
        world.applyGrow();
        view2d.renderAll();
        mode = "2d";
        busy = false;
    }

    async function set(m) {
        if (m === mode || busy) return mode;
        if (m === "3d") { await enter(); } else { await exit(); }
        return mode;
    }

    return {
        get mode() { return mode; },
        get busy() { return busy; },
        set,
        dispose() { stopAnim(); },
    };
}

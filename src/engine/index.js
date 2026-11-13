import { Tri3D } from "@ptahjs/tri-3d";
import { createPlan } from "../stores/plan";
import { createCameraRig } from "./camera";
import { createInteract } from "./interact";
import { createView2d } from "./view2d";
import { createViewMode } from "./viewmode";
import { createWalk } from "./walk";
import { FloorplanWorld } from "./floorplan/world";

/**
 * Create an engine instance: plan store → floor-plan world → interaction layer → 2D editor → view mode switching.
 * Initial view is the 2D plan (SVG); the 3D canvas is transparently overlaid; switching is orchestrated by
 * viewmode (cross-fade + wall growth).
 * @param {HTMLElement} container canvas mount container (tri-container)
 * @returns {Promise<import("@ptahjs/tri-3d").Tri3D>} engine instance (after `await engine.ready`, engine.plan / world / view2d / viewmode are available)
 */
export function createEngine(container) {
    const plan = createPlan();

    // 2D SVG editor: mounted inside the container, above the 3D canvas (the 3D canvas fades in over it)
    const view2dHost = document.createElement("div");
    view2dHost.className = "fp-view2d";
    container.appendChild(view2dHost);

    const engine = new Tri3D({
        id: "tri-3d-pub-floorplan",
        toneMappingExposure: 1.05,
        // loading layer matches the warm-paper theme (kernel default is black with a white bar); the kernel
        // switches progress-bar color schemes automatically based on background brightness
        loadingBackground: "#f7f4ee",
        // phase 1: always continuous rendering; phase 3 will add an on-demand-rendering toggle
        continuous: true,
    })
        .setContainer(container)
        // dev-mode flag: dev-only plugins use this to decide whether to install
        .setDevelopment(import.meta.env.DEV)
        .onComplete(() => {
            engine.plan = plan;
            engine.world = new FloorplanWorld(engine, plan);
            engine.interact = createInteract(engine, engine.world, plan);
            engine.cameraRig = createCameraRig(engine, engine.world);
            engine.walk = createWalk(engine, engine.world);
            // 2D editor (SVG overlay) + 2D↔3D switch orchestration
            engine.view2d = createView2d(view2dHost, plan, {
                is2dActive: () => engine.viewmode?.mode === "2d",
                groundAt: (x, y) => engine.interact.groundAt(x, y),
                addItemAt: (item, x, y) => {
                    const f = plan.addFurniture(item, x, y);
                    plan.pushOut(f);
                    return f;
                },
                download: (name, blob) => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = name;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                },
                toast: msg => engine.toast?.(msg),
                onToggleView: () => engine.viewmode?.set(engine.viewmode.mode === "2d" ? "3d" : "2d"),
                onTool: t => { engine.viewTool = t; },
            });
            engine.viewmode = createViewMode(engine, engine.world, engine.cameraRig, engine.view2d, {
                // cross-fade applies to the 3D canvas (initial 2D state: canvas transparent, SVG plan visible)
                host3d: container.querySelector("canvas"),
                view2dEl: view2dHost,
            });
            const fpCanvas = container.querySelector("canvas");
            if (fpCanvas) { fpCanvas.style.opacity = "0"; fpCanvas.style.pointerEvents = "none"; }
            // state changes (undo/redo/panel actions/library drops) → incremental world rebuild
            plan.onChange(() => engine.world.sync());
            // white-box debug hooks: read by headless smoke tests / the DevTools panel
            window.__FP__ = {
                engine, plan, world: engine.world, interact: engine.interact,
                cameraRig: engine.cameraRig, walk: engine.walk,
                view2d: engine.view2d, viewmode: engine.viewmode,
                snapshot() {
                    const w = engine.world;
                    return {
                        furnCount: w.furnGroup.children.length,
                        archUpCount: w.archUp.children.length,
                        doors: w.doors.length,
                        colliders: w.colliders.length,
                        undoLen: plan.undoLen.value,
                        redoLen: plan.redoLen.value,
                        sel: plan.sel.value,
                        rooms: Object.keys(plan.state.rooms).length,
                        grow: w.grow,
                        furnGrow: w.furnGrow,
                        mode: w.opt.mode,
                        cut: w.opt.cut,
                        night: w.opt.night,
                        hour: w.opt.hour,
                        view: engine.viewmode?.mode ?? "3d",
                        furn2d: plan.state.furniture.length,
                        measures: plan.state.measures.length,
                        demolished: plan.state.demolished.length,
                    };
                },
                /** White-box action set */
                api: {
                    setMode(m) {
                        const w = engine.world;
                        w.opt.mode = m;
                        if (m === "walk") engine.walk.enter();
                        else {
                            engine.walk.exit();
                            engine.cameraRig.goIso();
                        }
                    },
                    setNight(v) { engine.world.opt.night = v; engine.world.applyLight(); },
                    setCut(v) { engine.world.opt.cut = v; engine.world.sync(); },
                    /** Switch 2D/3D (white-box; waits for the transition to finish) */
                    setView: m => engine.viewmode?.set(m),
                    setTool: t => engine.view2d?.setTool(t),
                },
            };
            console.log("[pub-floorplan] engine ready");
        })
        .start();

    return engine;
}

/**
 * Destroy an engine instance.
 * @param {import("@ptahjs/tri-3d").Tri3D} engine engine instance
 */
export function disposeEngine(engine) {
    if (!engine) return;
    engine.viewmode?.dispose();
    engine.walk?.dispose();
    engine.cameraRig?.dispose();
    engine.interact?.dispose();
    engine.view2d?.dispose();
    engine.world?.dispose();
    delete window.__FP__;
    engine.dispose();
}

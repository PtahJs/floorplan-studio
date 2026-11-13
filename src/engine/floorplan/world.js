import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PlaneGeometry, PMREMGenerator } from "three/webgpu";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SERVICE } from "@ptahjs/tri-3d";
import { ROOMS, area, wx, wz } from "./data";
import { clearGroup, createArch } from "./arch";
import { buildFurniture } from "./furniture";

/**
 * Floor-plan world assembly: lighting / ground / architecture groups / furniture group / daylight.
 * tri-3d port of the reference page's init + applyLight + sync; rendering and camera are managed by
 * kernel plugins; the plan state lives in the plan store (injected at construction); this class only
 * does signature-compare incremental rebuilds.
 */
export class FloorplanWorld {
    #engine;
    #scene;
    #plan;
    #hemi;
    #sun;
    #ground;
    #archFloor = new Group();
    #archUp = new Group();
    #furnG = new Group();
    #labelG = new Group();
    #lampG = new Group();
    #arch;
    #sigArch = "";
    #labelsSuppressed = false; // temporarily hides labels during 2D view / transitions (does not touch the opt.labels chip toggle)
    #envTex = null;            // PMREM room-environment texture (attached per material as envMap; equivalent of the reference page's envTex)
    #sigFurn = "";
    /** View options (read/written directly by the phase 2/3 UI panels) */
    opt = { cut: 2.8, furn: true, labels: true, night: false, hour: 10, mode: "orbit" };
    /** Wall growth factor for the 2D↔3D transition (0=flattened, 1=full height) */
    grow = 1;
    furnGrow = 1;

    /** Plan state (held by the plan store, reactive) */
    get state() { return this.#plan.state; }

    /**
     * @param {import("@ptahjs/tri-3d").Tri3D} engine
     * @param {import("../../stores/plan").PlanStore} plan
     */
    constructor(engine, plan) {
        this.#engine = engine;
        this.#plan = plan;
        this.#scene = engine.services.get(SERVICE.SCENE_MANAGER).currentScene;
        this.#scene.background = new Color(0xf7f4ee);

        const cam = engine.services.get(SERVICE.CAMERA_MANAGER)?.currentCamera;
        if (cam) {
            cam.fov = 45; cam.near = 0.05; cam.far = 300;
            cam.position.set(5.5, 15.5, 10);
            cam.updateProjectionMatrix();
        }
        const orbit = engine.services.get(SERVICE.ORBIT_CONTROLS)?.instance;
        if (orbit) {
            orbit.target.set(0, 0, 0);
            orbit.maxPolarAngle = Math.PI * 0.495;
            orbit.minDistance = 1.5; orbit.maxDistance = 45;
            orbit.update();
        }

        // Daylight: hemisphere ambient + shadow-casting directional light (shadow params from the reference page)
        this.#hemi = new HemisphereLight(0xfff8ee, 0xb9a88f, 1.1);
        this.#sun = new DirectionalLight(0xfff1dd, 2.6);
        this.#sun.castShadow = true;
        this.#sun.shadow.mapSize.setScalar(4096);
        Object.assign(this.#sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 60 });
        this.#sun.shadow.bias = -0.0004;
        this.#sun.shadow.normalBias = 0.02;
        this.#ground = new Mesh(new PlaneGeometry(160, 160), new MeshStandardMaterial({ color: 0xf2eee7, roughness: 1 }));
        this.#ground.rotation.x = -Math.PI / 2;
        this.#ground.position.y = -0.015;
        this.#ground.receiveShadow = true;
        this.#scene.add(this.#hemi, this.#sun, this.#sun.target, this.#ground, this.#archFloor, this.#archUp, this.#furnG, this.#labelG, this.#lampG);

        this.#arch = createArch({
            archFloor: this.#archFloor, archUp: this.#archUp, lampG: this.#lampG,
            getState: () => this.state, getOpt: () => this.opt,
        });

        // Environment reflection: do not use the EnvironmentPlugin's scene.environment fallback (it affects all
        // materials and brightens the whole house ~25%); instead, per the reference page's semantics, build our own
        // PMREM room texture and attach it per material as envMap (see #applyEnv).
        // setEnabled(false) also clears scene.environment/background — this class owns the background, so reset it right away.
        this.#envTex = this.#makeRoomEnv();
        engine.services.get(SERVICE.ENVIRONMENT)?.setEnabled(false);
        this.#scene.background = new Color(0xf7f4ee);

        this.sync(true);
        // The initial view is the 2D plan: 3D room-name labels are created at construction and must be suppressed
        // immediately (otherwise they float over the SVG layer and shift slightly with the camera — the root cause
        // of "room names move in 2D"; suppression is used instead of flipping the opt.labels toggle)
        this.setLabelsSuppressed(true);
    }

    /** Signature-compare incremental rebuild (reference page sync) */
    sync(force = false) {
        const a = JSON.stringify([this.state.rooms, this.state.demolished, this.opt.cut]);
        const f = JSON.stringify(this.state.furniture);
        if (force || a !== this.#sigArch) { this.#sigArch = a; this.#arch.buildArch(); this.syncLabels(); }
        if (force || f !== this.#sigFurn) {
            this.#sigFurn = f;
            clearGroup(this.#furnG);
            this.state.furniture.forEach(it => this.#furnG.add(buildFurniture(it)));
            this.#furnG.visible = this.opt.furn;
        }
        this.applyLight();
        this.applyGrow();
    }

    /** 3D room-name labels (equivalent of the reference page's CSS2D rlabel via LabelLayerPlugin) */
    syncLabels() {
        const labels = this.#engine.services.get(SERVICE.LABEL_LAYER);
        if (!labels) return;
        if (!labels.getLayer("fp-rooms")) {
            labels.setLayer({
                id: "fp-rooms",
                html: `<div class="rlabel">{{name}}<small>{{area}}</small></div>`,
            });
        }
        labels.update("fp-rooms", ROOMS.filter(r => r.at).map(r => ({
            id: r.id,
            pos: [wx(r.at[0]), this.opt.cut + 0.15, wz(r.at[1])],
            data: { name: this.state.rooms[r.id]?.name || r.name, area: area(r.poly).toFixed(1) + "m²" },
        })));
    }

    /** 3D room-name visibility = chip toggle (opt.labels) AND not suppressed.
     *  The two states are separate: showLabels only flips the chip toggle; temporary hiding during the
     *  2D view / transitions goes through setLabelsSuppressed (previously temporary hiding wrote straight
     *  into opt.labels, so the 3D entry finisher showLabels(opt.labels) read back false → labels never came back). */
    showLabels(v) {
        this.opt.labels = v;
        this.#applyLabelsVisibility();
    }

    /** Temporary suppression during transitions / the 2D view (does not touch the chip toggle) */
    setLabelsSuppressed(v) {
        this.#labelsSuppressed = v;
        this.#applyLabelsVisibility();
    }

    #applyLabelsVisibility() {
        const layer = this.#engine.services.get(SERVICE.LABEL_LAYER)?.getLayer("fp-rooms");
        if (layer) layer.root.style.display = this.opt.labels && !this.#labelsSuppressed ? "" : "none";
    }

    /** PMREM room-environment texture (equivalent of the reference page's PMREMGenerator.fromScene(RoomEnvironment), line 2538) */
    #makeRoomEnv() {
        const renderer = this.#engine.services.get(SERVICE.RENDERER)?.instance;
        if (!renderer) return null;
        const pmrem = new PMREMGenerator(renderer);
        try {
            return pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        } finally {
            pmrem.dispose();
        }
    }

    /** Reference page envK semantics (reference.html:2610): environment reflection only applies to metals and
     *  glossy materials; matte large surfaces (walls / floors / fabric) do not take IBL.
     *  Hard constraint of the WebGPU renderer (three r187): envMapIntensity is ignored unless the material has its
     *  own envMap; only scene.environmentIntensity is honored (all-or-nothing) — so we follow the reference page's
     *  original route: no scene.environment, attach the PMREM room texture per material as envMap.
     *  Materials are cached; a Set dedupes. */
    #applyEnv(envK) {
        const env = this.#envTex;
        const seen = new Set();
        this.#scene.traverse(o => {
            const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
            for (const m of mats) {
                if (seen.has(m) || !m.isMeshStandardMaterial) continue;
                seen.add(m);
                const envAmt = m.metalness > 0.5 ? 1 : m.metalness > 0 || m.roughness < 0.4 ? 0.5 : 0;
                m.envMap = envAmt > 0 ? env : null;
                if (env) m.envMapIntensity = envAmt * envK;
            }
        });
    }

    /** Daylight / night scene (reference page applyLight; night adds IBL dimming + exposure, and lamps light up) */
    applyLight() {
        const { hour, night } = this.opt;
        const t = (hour - 6) / 12, az = Math.PI * (0.15 + t * 0.7), el = Math.sin(Math.PI * t) * 1.05 + 0.15, warm = 1 - Math.sin(Math.PI * t);
        this.#sun.position.set(Math.cos(az) * 18, Math.sin(el) * 20 + 3, -Math.sin(az) * 10 + 8);
        this.#sun.target.position.set(0, 0, 0);
        this.#sun.color.setHSL(0.09, 0.5 + warm * 0.4, 0.92 - warm * 0.12);
        this.#sun.intensity = night ? 0.05 : 1.4 + Math.sin(Math.PI * t) * 1.6;
        this.#hemi.intensity = night ? 0.12 : 1.1;
        this.#scene.background.set(night ? 0x1c2130 : 0xf7f4ee);
        // environment reflection per the reference page: envMap attached per material — full strength by day, 15% at night
        this.#applyEnv(night ? 0.15 : 1);
        const renderer = this.#engine.services.get(SERVICE.RENDERER)?.instance;
        if (renderer) renderer.toneMappingExposure = night ? 1.25 : 1.05;
        this.#ground.material.color.set(night ? 0x2a2e38 : 0xf2eee7);
        this.#lampG.children.forEach(o => {
            if (o.isPointLight) o.intensity = night ? 6 : 0;
            else o.material.emissiveIntensity = night ? 2 : 0.3;
        });
    }

    /** Wall growth (for the 2D→3D transition; lampG shows only once walls reach full height) */
    applyGrow() {
        this.#archUp.scale.y = Math.max(this.grow, 0.001);
        this.#furnG.scale.y = Math.max(this.furnGrow, 0.001);
        this.#lampG.visible = this.grow > 0.99;
    }

    /** Show/hide walk-mode helpers on the architecture (wall edge lines / skirting etc.) (wired up in phase 3) */
    setWalkOnly(v) {
        this.#archUp.traverse(o => { if (o.userData.walkOnly) o.visible = v; });
    }

    /** Screen point → ground (y=0) intersection; used only by picking / walk mode (EventManager hookup in phase 2) */
    get engineScene() { return this.#scene; }
    get sunLight() { return this.#sun; }
    get archUp() { return this.#archUp; }
    get furnGroup() { return this.#furnG; }
    get archFloor() { return this.#archFloor; }
    get doors() { return this.#arch.doors; }
    get colliders() { return this.#arch.colliders; }

    dispose() {
        [this.#archFloor, this.#archUp, this.#furnG, this.#labelG, this.#lampG].forEach(clearGroup);
        this.#ground.geometry.dispose();
        this.#envTex?.dispose();
        this.#scene.remove(this.#hemi, this.#sun, this.#sun.target, this.#ground, this.#archFloor, this.#archUp, this.#furnG, this.#labelG, this.#lampG);
    }
}

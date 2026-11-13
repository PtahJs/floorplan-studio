import {
    BoxGeometry, CylinderGeometry, EdgesGeometry, ExtrudeGeometry, Group, LineBasicMaterial, LineSegments, Mesh, PointLight,
    Shape, ShapeGeometry, SphereGeometry,
} from "three/webgpu";
import { DOORS, H, M, ROOMS, SLIDES, WALLS, WINS, wx, wz } from "./data";
import { floorMat, frameMat, glassMat, mat } from "./materials";
import { box, metal } from "./helpers";

/**
 * Architecture generation (port of the reference page's wallBox / buildArch): walls, floors, ceilings,
 * doors & windows, lintels, door-leaf pivots.
 * Coordinate convention matches the reference: shapeOf negates plan y → after rotateX(-π/2), world z comes back positive.
 */

export const wallMat = mat("#f4f1eb", { roughness: 0.92 });
export const capMat = mat("#34312d", { roughness: 0.9 });
const edgeMat = new LineBasicMaterial({ color: 0x6f675b });
const skirtMat = mat("#8b7f6e", { roughness: 0.6 });

/** Clear a group and dispose its geometries (materials are shared via matCache, never disposed) */
export function clearGroup(g) {
    g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    g.clear();
}

/** Plan polygon → Shape; with flip, y stays positive (ceilings, paired with rotateX(+π/2) so the normal faces down) */
export function shapeOf(poly, flip) {
    const s = new Shape();
    poly.forEach(([x, y], i) => s[i ? "lineTo" : "moveTo"](wx(x), flip ? wz(y) : -wz(y)));
    return s;
}

/**
 * @param {object} deps
 * @param {Group} deps.archFloor interior floors (always visible)
 * @param {Group} deps.archUp   walls / ceilings / doors & windows (scale.y flattens during the 2D transition)
 * @param {Group} deps.lampG    ceiling lamp discs + PointLights
 * @param {() => object} deps.getState { rooms, demolished, furniture }
 * @param {() => object} deps.getOpt   { cut, mode, … }
 */
export function createArch({ archFloor, archUp, lampG, getState, getOpt }) {
    /** Door-leaf pivot list: { pivot, a0, a1, open, cur }; swing animation wired up in phase 2 */
    const doors = [];
    /** Walk-mode colliders (world-space AABBs [x0, z0, x1, z1], meters) */
    let colliders = [];

    function wallBox([x0, y0, x1, y1], yb, yt, m) {
        if (yt - yb <= 0.001) return;
        const o = new Mesh(new BoxGeometry(M(x1 - x0), yt - yb, M(y1 - y0)), m || [wallMat, wallMat, capMat, wallMat, wallMat, wallMat]);
        o.position.set(wx((x0 + x1) / 2), (yb + yt) / 2, wz((y0 + y1) / 2));
        o.castShadow = o.receiveShadow = true;
        archUp.add(o);
        // Walk-mode helpers: wall edge lines + skirting so adjacent faces and corners read clearly (walk mode only, wired in phase 3)
        const ln = new LineSegments(new EdgesGeometry(o.geometry), edgeMat);
        ln.position.copy(o.position); ln.userData.walkOnly = true; ln.visible = false;
        archUp.add(ln);
        if (yb <= 0.001) {
            const p = o.geometry.parameters, hgt = Math.min(0.12, yt);
            const sk = new Mesh(new BoxGeometry(p.width + 0.02, hgt, p.depth + 0.02), skirtMat);
            sk.position.set(o.position.x, hgt / 2, o.position.z);
            sk.userData.walkOnly = true; sk.visible = false;
            archUp.add(sk);
        }
    }

    function buildArch() {
        clearGroup(archFloor); clearGroup(archUp); lampG.clear();
        doors.length = 0; colliders = [];
        const { rooms, demolished } = getState(), top = getOpt().cut;

        ROOMS.forEach(r => {
            const m = floorMat(rooms[r.id].mat), bay = r.counted === false;
            const geo = bay ? new ExtrudeGeometry(shapeOf(r.poly), { depth: 0.45, bevelEnabled: false }) : new ShapeGeometry(shapeOf(r.poly));
            geo.rotateX(-Math.PI / 2);
            const fl = new Mesh(geo, bay ? [m, mat("#e9e4da")] : m);
            fl.receiveShadow = true; fl.userData.room = r.id;
            if (bay) { fl.castShadow = true; archUp.add(fl); } else archFloor.add(fl);
            // ceiling: normal faces down, visible only from below inside the room
            const cg = new ShapeGeometry(shapeOf(r.poly, true)); cg.rotateX(Math.PI / 2);
            const ceil = new Mesh(cg, mat("#fbfaf7", { roughness: 1 }));
            ceil.position.y = H; ceil.visible = top >= H; archUp.add(ceil);
            if (r.at) {
                const lamp = new Mesh(new CylinderGeometry(0.22, 0.22, 0.02, 32), mat("#ffffff", { emissive: "#fff2d6", emissiveIntensity: 0.3 }));
                lamp.position.set(wx(r.at[0]), H - 0.012, wz(r.at[1])); lamp.visible = top >= H; lampG.add(lamp);
                const pl = new PointLight(0xffd9a8, 0, 7, 1.6);
                pl.position.set(wx(r.at[0]), H - 0.25, wz(r.at[1])); lampG.add(pl);
            }
        });

        // door openings / bay-window platform tops
        [...DOORS, ...SLIDES].forEach(d => {
            const [x0, y0, x1, y1] = d.rect;
            const s = box(M(x1 - x0), 0.012, M(y1 - y0), mat("#d8d0c0", { roughness: 0.3 }), wx((x0 + x1) / 2), 0, wz((y0 + y1) / 2));
            s.castShadow = false; archFloor.add(s);
        });

        WALLS.forEach((w, i) => {
            if (demolished.includes("w" + i)) return;
            wallBox(w, 0, w[4] === "low" ? Math.min(1, top) : top);
            colliders.push([wx(w[0]), wz(w[1]), wx(w[2]), wz(w[3])]);
        });

        // lintels above door openings and bay-window openings
        [...DOORS.map(d => [d.rect, 2.1]), ...SLIDES.map(s => [s.rect, s.v ? 2.4 : 2.1]), [[10270, 800, 10510, 2600], 2.4], [[10270, 4260, 10510, 5740], 2.4]]
            .forEach(([r, h]) => { if (top > h) wallBox(r, h, top); });

        WINS.forEach((r, i) => {
            const sill = i === 0 ? 1.4 : i >= 6 ? 0.45 : 0.9, head = 2.4;
            wallBox(r, 0, Math.min(sill, top)); if (top > head) wallBox(r, head, top);
            colliders.push([wx(r[0]), wz(r[1]), wx(r[2]), wz(r[3])]);
            const gTop = Math.min(head, top); if (gTop <= sill) return;
            const [x0, y0, x1, y1] = r, hz = (x1 - x0) >= (y1 - y0), L = M(hz ? x1 - x0 : y1 - y0), gh = gTop - sill, cx = wx((x0 + x1) / 2), cz = wz((y0 + y1) / 2);
            const pane = new Mesh(new BoxGeometry(hz ? L : 0.01, gh, hz ? 0.01 : L), glassMat);
            pane.position.set(cx, sill + gh / 2, cz); archUp.add(pane);
            const n = Math.max(1, Math.round(L / 0.9));
            for (let k = 0; k <= n; k++) {
                const t = -L / 2 + (k * L) / n;
                const mu = new Mesh(new BoxGeometry(hz ? 0.04 : 0.06, gh, hz ? 0.06 : 0.04), frameMat);
                mu.position.set(cx + (hz ? t : 0), sill + gh / 2, cz + (hz ? 0 : t)); mu.castShadow = true; archUp.add(mu);
            }
            [sill + 0.02, gTop - 0.02].forEach(y => {
                const tr = new Mesh(new BoxGeometry(hz ? L : 0.06, 0.04, hz ? 0.06 : L), frameMat);
                tr.position.set(cx, y, cz); archUp.add(tr);
            });
        });

        // Swing doors: pivot group + leaf + spherical knob; a0→a1 is the swing range (tween wired in phase 2)
        DOORS.forEach(d => {
            const pivot = new Group(), L = M(d.len), dh = Math.min(2.05, top);
            pivot.position.set(wx(d.h[0]), 0, wz(d.h[1]));
            const leaf = box(L, dh, 0.04, mat(d.entry ? "#6b4f3a" : "#efe6d8", { roughness: 0.5 }), L / 2);
            const knob = new Mesh(new SphereGeometry(0.03, 12, 8), metal());
            knob.position.set(L - 0.07, Math.min(1, dh - 0.05), 0); knob.scale.z = 2.2;
            pivot.add(leaf, knob);
            const ang = v => Math.atan2(-v[1], v[0]), door = { pivot, a0: ang(d.c), a1: ang(d.o), open: true };
            if (door.a1 - door.a0 > Math.PI) door.a1 -= Math.PI * 2;
            if (door.a0 - door.a1 > Math.PI) door.a1 += Math.PI * 2;
            door.cur = door.a1; pivot.rotation.y = door.cur;
            leaf.userData.door = knob.userData.door = door;
            doors.push(door); archUp.add(pivot);
        });

        // Sliding glass doors: two leaves at 55% each, staggered and overlapping
        SLIDES.forEach(({ rect: [x0, y0, x1, y1], v }) => {
            const L = M(v ? y1 - y0 : x1 - x0), ph = Math.min(v ? 2.4 : 2.1, top), pl = L * 0.55;
            [[-1, -0.02], [1, 0.02]].forEach(([s, off]) => {
                const c = s < 0 ? -L / 2 + pl / 2 : L / 2 - pl / 2;
                const x = v ? wx((x0 + x1) / 2) + off : wx(x0) + L / 2 + c;
                const z = v ? wz(y0) + L / 2 + c : wz((y0 + y1) / 2) + off;
                const p = new Mesh(new BoxGeometry(v ? 0.02 : pl, ph, v ? pl : 0.02), glassMat);
                p.position.set(x, ph / 2, z); archUp.add(p);
                [ph - 0.03, 0.03].forEach(y => {
                    const fr = new Mesh(new BoxGeometry(v ? 0.04 : pl, 0.05, v ? pl : 0.04), frameMat);
                    fr.position.set(x, y, z); archUp.add(fr);
                });
                [-1, 1].forEach(e => {
                    const fr = new Mesh(new BoxGeometry(0.04, ph, 0.04), frameMat);
                    fr.position.set(v ? x : x + (e * pl) / 2, ph / 2, v ? z + (e * pl) / 2 : z); archUp.add(fr);
                });
            });
        });
    }

    return {
        buildArch,
        get doors() { return doors; },
        get colliders() { return colliders; },
    };
}

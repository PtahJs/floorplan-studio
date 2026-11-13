import {
    BoxGeometry, CatmullRomCurve3, CircleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, LatheGeometry,
    Mesh, Shape, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from "three/webgpu";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mat } from "./materials";

/**
 * 3D geometry helpers (partial port of the reference page's helpers)
 * Convention: unless noted, y = bottom height; local coords face -z toward the back.
 */

const asMat = m => (typeof m === "string" ? mat(m) : m);
/** Uniform shadow flags: furniture / architecture pieces cast and receive shadows by default */
export const sh = o => {
    o.castShadow = o.receiveShadow = true;
    return o;
};
export const mesh = (geo, m) => sh(new Mesh(geo, asMat(m)));
export const rot = (o, x = 0, y = 0, z = 0) => {
    o.rotation.set(x, y, z);
    return o;
};

/** Axis-aligned box, y = bottom */
export function box(w, h, d, m, x = 0, y = 0, z = 0) {
    const o = mesh(new BoxGeometry(w, h, d), m);
    o.position.set(x, y + h / 2, z);
    return o;
}

/** Rounded box (y = bottom); r is auto-clamped to half extents */
export function rbox(w, h, d, m, x = 0, y = 0, z = 0, r = 0.04) {
    const o = mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), m);
    o.position.set(x, y + h / 2, z);
    return o;
}

export function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 28) {
    const o = mesh(new CylinderGeometry(rt, rb, h, seg), m);
    o.position.set(x, y + h / 2, z);
    return o;
}

/** Solid of revolution: pts = [[radius, height], …] bottom-up, y = bottom */
export function lathe(pts, m, x = 0, y = 0, z = 0, seg = 40) {
    const o = mesh(new LatheGeometry(pts.map(([r, h]) => new Vector2(Math.max(r, 1e-4), h)), seg), m);
    o.position.set(x, y, z);
    return o;
}

/** Cylindrical rod between two points, r0 at the a end, r1 at the b end (tapered chair legs, braces) */
export function rod(a, b, r0, m, r1 = r0, seg = 12) {
    const A = new Vector3(...a), B = new Vector3(...b);
    const o = mesh(new CylinderGeometry(r1, r0, A.distanceTo(B), seg), m);
    o.position.copy(A).add(B).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), B.sub(A).normalize());
    return o;
}

/** Tube along a curve (faucets, handrails, lamp arms) */
export const tube = (pts, r, m, seg = 40) =>
    mesh(new TubeGeometry(new CatmullRomCurve3(pts.map(p => new Vector3(...p)), false, "centripetal"), seg, r, 10), m);

/** Ellipsoid (cushions, leaves, beanbags), y = center */
export function blob(rx, ry, rz, m, x = 0, y = 0, z = 0, seg = 24) {
    const o = mesh(new SphereGeometry(1, seg, Math.round(seg * 0.7)), m);
    o.scale.set(rx, ry, rz);
    o.position.set(x, y, z);
    return o;
}

/** Horizontal ring, y = center */
export function ring(R, r, m, x = 0, y = 0, z = 0) {
    const o = mesh(new TorusGeometry(R, r, 10, 48), m);
    o.rotation.x = Math.PI / 2;
    o.position.set(x, y, z);
    return o;
}

/** Horizontal disc (bottom at y) */
export function disc(r, m, x = 0, y = 0, z = 0, seg = 40) {
    const o = mesh(new CircleGeometry(r, seg), m);
    o.rotation.x = -Math.PI / 2;
    o.position.set(x, y, z);
    return o;
}

/** Rounded-rect outline (XY plane, centered at origin) */
export function rrect(w, d, r) {
    const s = new Shape(), x = -w / 2, y = -d / 2;
    r = Math.min(r, w / 2 - 0.001, d / 2 - 0.001);
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r);
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d);
    s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
}

/** Hollow rounded frame (bathtubs, sink rims, chair-back frames): outer w×d, wall thickness t, height h, y = bottom */
export function shell(w, d, h, t, r, m, x = 0, y = 0, z = 0) {
    const s = rrect(w, d, r);
    s.holes.push(rrect(w - 2 * t, d - 2 * t, Math.max(0.004, r - t)));
    const geo = new ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2);
    const o = mesh(geo, m);
    o.position.set(x, y, z);
    return o;
}

/* ======================= Common material shorthands ======================= */

export const metal = () => mat("#cfd2d4", { metalness: 0.9, roughness: 0.25 });
export const chrome = () => mat("#eef0f2", { metalness: 1, roughness: 0.08 });
export const hwMat = () => mat("#b9b3a8", { metalness: 0.85, roughness: 0.3 });
export const blackMetal = () => mat("#2b2b2d", { metalness: 0.6, roughness: 0.4 });
export const mirror = () => mat("#dfeaee", { metalness: 0.55, roughness: 0.06 });
export const ceramic = (o = {}) => mat("#fbfbf9", { roughness: 0.12, ...o });
export const fabric = c => mat(c, { roughness: 0.96 });
export const woodM = c => mat(c, { roughness: 0.55 });
export const screenMat = (glow = "#1a2636") => mat("#0b0e13", { roughness: 0.1, metalness: 0.3, emissive: glow, emissiveIntensity: 0.35 });
export const glowMat = (c = "#fff4dc", e = "#ffdca0", k = 0.5) => mat(c, { emissive: e, emissiveIntensity: k, roughness: 0.9, side: DoubleSide });

/* ======================= Small composite pieces ======================= */

/** Pull handle: y is the handle center, z is the door face */
export function pull(g, len, vert, x, y, z) {
    const m = hwMat(), o = new Group();
    o.add(vert ? box(0.01, len, 0.01, m, 0, -len / 2, 0.028) : box(len, 0.01, 0.01, m, 0, -0.005, 0.028));
    [-1, 1].forEach(s =>
        o.add(vert ? box(0.008, 0.008, 0.028, m, 0, s * (len / 2 - 0.015) - 0.004, 0.014) : box(0.008, 0.008, 0.028, m, s * (len / 2 - 0.015), -0.004, 0.014)));
    o.position.set(x, y, z);
    g.add(o);
}

export function knob(g, x, y, z) {
    const k = cyl(0.011, 0.014, 0.02, hwMat(), x, y - 0.01, z + 0.01, 16);
    k.rotation.x = Math.PI / 2;
    g.add(k, blob(0.014, 0.014, 0.008, hwMat(), x, y, z + 0.022, 12));
}

/**
 * Cabinet doors / drawer fronts: nx columns × ny rows inside the x0..x0+w, y0..y0+h region, facing +z (z = cabinet face)
 * hd: 'bar' metal pull | 'knob' round knob | 'edge' recessed top groove | 'none'; hy: door handle center height (null = panel middle)
 */
export function fronts(g, x0, y0, w, h, z, nx, ny, m, hd = "bar", hy = null) {
    const gap = 0.005, pw = w / nx, ph = h / ny, fz = z + 0.018;
    g.add(box(w, h, 0.002, "#2a2724", x0 + w / 2, y0, z + 0.001)); // dark color showing through the gaps
    for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
            const cx = x0 + pw * (i + 0.5), yb = y0 + ph * j, drawer = ph < 0.4 && pw >= ph;
            g.add(rbox(pw - gap, ph - gap, 0.018, m, cx, yb + gap / 2, z + 0.009, 0.003));
            if (hd === "none") continue;
            if (hd === "edge") {
                g.add(box(pw - 0.05, 0.01, 0.006, "#3c3a37", cx, yb + ph - gap - 0.018, fz));
                continue;
            }
            if (drawer) {
                hd === "knob" ? knob(g, cx, yb + ph / 2, fz) : pull(g, Math.min(0.3, pw * 0.45), false, cx, yb + ph / 2, fz);
                continue;
            }
            const len = Math.min(0.45, ph * 0.35), hx = nx === 1 ? cx + pw / 2 - 0.045 : i % 2 ? cx - pw / 2 + 0.04 : cx + pw / 2 - 0.04;
            const y = Math.min(yb + ph - 0.05 - len / 2, Math.max(yb + 0.05 + len / 2, hy ?? yb + ph / 2));
            hd === "knob" ? knob(g, hx, y, fz) : pull(g, len, true, hx, y, fz);
        }
}

const vasePts = (r, h) => [[0, 0], [r * 0.65, 0], [r, h * 0.32], [r * 0.92, h * 0.62], [r * 0.42, h * 0.86], [r * 0.5, h]];

/** Vase (optionally with flower stems), y = bottom */
export function vase(g, x, y, z, r, h, c, R, flowers = true) {
    g.add(lathe(vasePts(r, h), mat(c, { roughness: 0.35, side: 2 }), x, y, z, 32));
    if (!flowers) return;
    const cols = ["#f3e6d8", "#e8b4a0", "#f6d27a", "#ffffff"];
    for (let k = 0; k < 5; k++) {
        const a = k * 1.26 + R() * 0.4, s = 0.03 + R() * 0.05, top = [x + Math.cos(a) * s, y + h + 0.12 + R() * 0.14, z + Math.sin(a) * s];
        g.add(rod([x, y + h * 0.6, z], top, 0.003, "#6f8f4a", 0.003, 6), blob(0.022, 0.018, 0.022, cols[k % 4], ...top, 12));
    }
}

/** Table lamp (nightstands etc.), y = bottom */
export function tableLamp(g, x, y, z, s = 1) {
    g.add(lathe([[0, 0], [0.06 * s, 0], [0.075 * s, 0.05 * s], [0.08 * s, 0.12 * s], [0.055 * s, 0.2 * s], [0.018 * s, 0.25 * s], [0.012 * s, 0.3 * s]], ceramic({ roughness: 0.3 }), x, y, z, 32));
    g.add(lathe([[0.13 * s, 0], [0.1 * s, 0.18 * s]], glowMat("#f6ecd9", "#ffdca0", 0.35), x, y + 0.26 * s, z, 40), blob(0.03 * s, 0.03 * s, 0.03 * s, glowMat("#fff", "#ffe2b0", 1), x, y + 0.31 * s, z, 12));
}

export const plate = (g, r, x, y, z) => g.add(lathe([[0, 0], [r * 0.6, 0], [r * 0.72, 0.008], [r, 0.02]], ceramic({ side: 2 }), x, y, z, 32));

/** Four tapered legs: inset is the distance from each edge, r the leg's bottom radius (slightly thicker at the top) */
export const legs = (g, w, d, h, m, inset = 0.05, r = 0.02) =>
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) =>
        g.add(rod([a * (w / 2 - inset), 0, b * (d / 2 - inset)], [a * (w / 2 - inset), h, b * (d / 2 - inset)], r * 0.7, m, r)));

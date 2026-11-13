import { CanvasTexture, Color, DoubleSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from "three/webgpu";

/**
 * Material cache + procedural floor textures (partial port of the reference page's materials)
 * Note: single WebGPU pipeline, all MeshStandardMaterial (three/webgpu build).
 * IBL reflection comes from the tri EnvironmentPlugin's scene.environment; materials need no envMap.
 */

/** Fixed random sequence (seeded, reproducible) for procedural textures / furniture decoration details */
export function rng(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const matCache = new Map();

/**
 * Get/create a shared MeshStandardMaterial (same params reuse one instance; converging materials helps batching)
 * @param {string} color hex color
 * @param {object} [o] extra roughness / metalness / emissive params
 */
export function mat(color, o = {}) {
    const key = color + JSON.stringify(o);
    if (!matCache.has(key)) {
        matCache.set(key, new MeshStandardMaterial({ color, roughness: 0.7, ...o }));
    }
    return matCache.get(key);
}

/** Darkens environment reflection scene-wide for night mode etc. (DayNight hookup in phase 3) */
export function dimMaterials(k) {
    matCache.forEach(m => {
        if (m.userData.env) m.envMapIntensity = m.userData.env * k;
    });
}

/** Window glass (also used for shower partitions): transparent but does not write depth */
export const glassMat = new MeshStandardMaterial({
    color: 0xcfe6ef, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide,
});

/** Window / door frame metal */
export const frameMat = mat("#5d6166", { roughness: 0.5, metalness: 0.4 });

/* ======================= Procedural floor textures (UV units = meters) ======================= */

const TEX = {
    wood: { sx: 1.8, sy: 0.36, base: "#d6b58a", rough: 0.55 }, walnut: { sx: 1.8, sy: 0.36, base: "#9a6f4b", rough: 0.5 },
    tile800: { sx: 0.8, sy: 0.8, base: "#ebe6dd", grout: "#cfc6b7", rough: 0.3 }, tile600: { sx: 0.6, sy: 0.6, base: "#dfe3e0", grout: "#bfc6c1", rough: 0.35 },
    antislip: { sx: 0.3, sy: 0.3, base: "#d3d8d4", grout: "#aab2ac", rough: 0.8 }, marble: { sx: 1.2, sy: 1.2, base: "#f2efe9", grout: "#d9d2c4", rough: 0.18 },
    terrazzo: { sx: 0.5, sy: 0.5, base: "#e6dfd3", rough: 0.4 }, carpet: { sx: 0.3, sy: 0.3, base: "#c6bfd2", rough: 1 },
};

const rgbK = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

const floorMats = {};
let maxAnisotropy = 8;

/** Anisotropy cap injected by the engine (renderer.capabilities) */
export function setMaxAnisotropy(v) { maxAnisotropy = v; }

/**
 * Room floor material (cached by material id; CanvasTexture drawn procedurally, tiled at real size)
 * @param {string} kind material id from MATS
 */
export function floorMat(kind) {
    if (floorMats[kind]) return floorMats[kind];
    const s = TEX[kind] || TEX.tile800, R = rng(kind.length * 977 + 13), cv = document.createElement("canvas");
    const wood = kind === "wood" || kind === "walnut";
    cv.width = wood ? 1024 : 512; cv.height = wood ? 205 : 512;
    const g = cv.getContext("2d"), W = cv.width, Hh = cv.height;
    g.fillStyle = s.base; g.fillRect(0, 0, W, Hh);
    if (wood) {
        const rowH = Hh / 2, joints = [[W * 2 / 3], [W / 3]];
        for (let r = 0; r < 2; r++) {
            let x0 = 0;
            [...joints[r], W].forEach(x1 => {
                g.fillStyle = rgbK(s.base, 0.9 + R() * 0.2); g.fillRect(x0, r * rowH, x1 - x0, rowH);
                g.strokeStyle = rgbK(s.base, 0.8); g.globalAlpha = 0.35; g.lineWidth = 1.2;
                for (let k = 0; k < 7; k++) {
                    const y = r * rowH + 6 + R() * (rowH - 12); g.beginPath(); g.moveTo(x0, y);
                    for (let x = x0; x <= x1; x += 40) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 2.5); g.stroke();
                }
                g.globalAlpha = 1; g.fillStyle = rgbK(s.base, 0.62); g.fillRect(x1 - 1.5, r * rowH, 3, rowH); x0 = x1;
            });
            g.fillStyle = rgbK(s.base, 0.62); g.fillRect(0, r * rowH, W, 2.5);
        }
    } else if (kind === "marble") {
        g.strokeStyle = "rgba(160,150,135,.35)";
        for (let k = 0; k < 6; k++) {
            g.lineWidth = 1 + R() * 3; g.beginPath(); g.moveTo(R() * W, 0);
            g.bezierCurveTo(R() * W, R() * Hh, R() * W, R() * Hh, R() * W, Hh); g.stroke();
        }
    } else if (kind === "terrazzo") {
        const cs = ["#b9a58c", "#8fa3a0", "#c9b7a2", "#a88f76", "#7e8a86"];
        for (let k = 0; k < 160; k++) { g.fillStyle = cs[k % 5]; g.beginPath(); g.arc(R() * W, R() * Hh, 2 + R() * 7, 0, 7); g.fill(); }
    } else {
        for (let k = 0; k < 1500; k++) { g.fillStyle = `rgba(0,0,0,${R() * 0.04})`; g.fillRect(R() * W, R() * Hh, 2, 2); }
    }
    if (s.grout) { g.fillStyle = s.grout; g.fillRect(0, 0, W, 3); g.fillRect(0, 0, 3, Hh); }
    const t = new CanvasTexture(cv);
    t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(1 / s.sx, 1 / s.sy);
    t.colorSpace = SRGBColorSpace; t.anisotropy = maxAnisotropy;
    return (floorMats[kind] = new MeshStandardMaterial({ map: t, roughness: s.rough }));
}

export const darken = (hex, k = 0.8) => "#" + new Color(hex).multiplyScalar(k).getHexString();
export const lighten = (hex, k = 0.2) => "#" + new Color(hex).lerp(new Color("#ffffff"), k).getHexString();

/**
 * Floor plan data model (units mm, origin = inner face of the left/top exterior walls)
 *
 * All numbers are derived from the original floor-plan dimension chains:
 *   top: 1580/240/2760/240/1540/240/3670 = 10270
 *   bottom: 2180/240/2160/240/5450/240/1340 = 11850
 *   left: 3370/1580/240/2770/240/2360 = 10560
 *   right: 3370/240/2760/240/3950 = 10560
 *
 * Walls: [x0, y0, x1, y1, kind], b=bearing (black) e=exterior n=non-bearing (removable) low=low wall
 */
export const WALLS = [
    // top exterior wall
    [1580, -240, 2120, 0, 'b'], [1580, 0, 1820, 300, 'b'], [2120, -240, 4580, 0, 'e'], [4580, -240, 5140, 0, 'e'],
    [5760, -240, 6050, 0, 'e'], [6050, -240, 6600, 0, 'b'], [6360, 0, 6600, 300, 'b'], [6600, -240, 9960, 0, 'e'],
    [9960, -240, 10510, 0, 'b'], [10270, 0, 10510, 300, 'b'],
    // right exterior wall
    [10270, 300, 10510, 800, 'e'], [10270, 2600, 10510, 3090, 'e'], [10270, 3090, 10510, 4260, 'b'],
    [10270, 5740, 10510, 6370, 'b'], [9960, 6370, 10510, 6610, 'b'], [10270, 6610, 10510, 7400, 'b'],
    [10270, 9770, 10510, 10560, 'b'], [9960, 10560, 10510, 10800, 'b'],
    // bottom / balcony
    [4580, 10560, 9960, 10800, 'e'], [10510, 10560, 12090, 10800, 'e'], [11850, 9960, 12090, 10560, 'e'],
    // living room left wall (both sides of the entry door)
    [4580, 9200, 4820, 10560, 'e'], [4580, 7960, 4820, 8310, 'e'],
    // dining / kitchen exterior wall
    [3620, 7960, 4580, 8200, 'e'], [2180, 7960, 3620, 8200, 'b'], [2180, 7590, 2420, 7960, 'b'], [2180, 7400, 2420, 7590, 'n'],
    [-240, 7960, 2180, 8200, 'e'], [-240, 3610, 0, 7960, 'e'],
    // laundry balcony
    [0, 4950, 200, 5190, 'n'], [200, 4950, 1275, 5190, 'low'], [1580, 3370, 2420, 3825, 'b'],
    [2180, 4430, 2420, 5796, 'n'], [2090, 4950, 2180, 5190, 'n'],
    // guest bath
    [2420, 4950, 4580, 5190, 'n'], [4580, 3280, 4820, 4075, 'n'], [4580, 4860, 4820, 5190, 'n'], [2420, 3370, 4580, 3610, 'n'],
    // kids' room / master bath
    [4580, 0, 4820, 2400, 'n'], [4820, 2080, 6360, 2320, 'n'], [6360, 300, 6600, 1198, 'n'], [6360, 1983, 6600, 2400, 'n'],
    // hallway / master bedroom / children's room
    [6083, 3370, 6600, 3707, 'b'], [6360, 3280, 6600, 3370, 'n'], [6600, 3370, 9960, 3610, 'n'], [9960, 3370, 10270, 3610, 'b'],
    [6083, 4600, 6323, 6610, 'n'], [6323, 6370, 9960, 6610, 'n'],
];

/** Windows: [x0, y0, x1, y1]; from index 6 on, bay windows (master bedroom / children's room) */
export const WINS = [
    [5140, -240, 5760, 0], [1580, 300, 1820, 3370], [-240, 3370, 1580, 3610], [2180, 3825, 2420, 4430],
    [10510, 6370, 12090, 6610], [11850, 6610, 12090, 9960],
    [10510, 660, 11130, 760], [11030, 760, 11130, 2650], [10510, 2650, 11130, 2750],
    [10510, 4110, 11130, 4210], [11030, 4210, 11130, 5785], [10510, 5785, 11130, 5885],
];

/** Swing doors: opening rect, hinge point h, closed direction c, open direction o, leaf width len, entry=front door */
export const DOORS = [
    { name: "Kids' room door", rect: [4580, 2400, 4820, 3280], h: [4580, 3280], c: [0, -1], o: [-1, 0], len: 880 },
    { name: 'Master bedroom door', rect: [6360, 2400, 6600, 3280], h: [6600, 3280], c: [0, -1], o: [1, 0], len: 880 },
    { name: 'Master bath door', rect: [6360, 1198, 6600, 1983], h: [6360, 1198], c: [0, 1], o: [-1, 0], len: 785 },
    { name: 'Guest bath door', rect: [4580, 4075, 4820, 4860], h: [4580, 4860], c: [0, -1], o: [-1, 0], len: 785 },
    { name: "Children's room door", rect: [6083, 3707, 6323, 4600], h: [6323, 4600], c: [0, -1], o: [1, 0], len: 893 },
    { name: 'Entry door', rect: [4580, 8310, 4820, 9200], h: [4820, 9200], c: [0, -1], o: [1, 0], len: 890, entry: true },
];

/** Sliding doors */
export const SLIDES = [
    { rect: [10270, 7400, 10510, 9770], v: true },
    { rect: [1275, 4950, 2090, 5190], v: false },
];

const R = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Room polygons + default floor material + label anchor at (bay windows with counted=false are excluded from floor area) */
export const ROOMS = [
    { id: 'master', name: 'Master Bedroom', poly: R(6600, 0, 10270, 3370), mat: 'wood', at: [8435, 2420] },
    { id: 'mbath', name: 'Master Bath', poly: R(4820, 0, 6360, 2080), mat: 'antislip', at: [5980, 1780] },
    { id: 'kid', name: "Kids' Room", poly: R(1820, 0, 4580, 3370), mat: 'wood', at: [3380, 2330] },
    { id: 'gbath', name: 'Guest Bath', poly: R(2420, 3610, 4580, 4950), mat: 'antislip', at: [3760, 4620] },
    { id: 'laundry', name: 'Laundry Balcony', poly: R(0, 3610, 2180, 4950), mat: 'antislip', at: [1250, 4330] },
    { id: 'child', name: "Children's Room", poly: R(6323, 3610, 10270, 6370), mat: 'wood', at: [8850, 4850] },
    { id: 'kitchen', name: 'Kitchen', poly: R(0, 5190, 2180, 7960), mat: 'tile600', at: [1300, 6500] },
    { id: 'dining', name: 'Dining', poly: [[2420, 5190], [4820, 5190], [4820, 7960], [2420, 7960], [2420, 7400], [2180, 7400], [2180, 5796], [2420, 5796]], mat: 'tile800', at: [3900, 5520] },
    { id: 'hall', name: 'Hallway', poly: [[4820, 2320], [6360, 2320], [6360, 3370], [6083, 3370], [6083, 6610], [4820, 6610]], mat: 'tile800', at: [5450, 4450] },
    { id: 'living', name: 'Living Room', poly: R(4820, 6610, 10270, 10560), mat: 'tile800', at: [7600, 7560] },
    { id: 'balcony', name: 'Leisure Balcony', poly: R(10510, 6610, 11850, 10560), mat: 'walnut', at: [11180, 9450] },
    { id: 'bay1', name: 'Master Bay Window', poly: [[10270, 800], [10510, 800], [10510, 760], [11030, 760], [11030, 2650], [10510, 2650], [10510, 2600], [10270, 2600]], mat: 'marble', counted: false },
    { id: 'bay2', name: "Children's Bay Window", poly: [[10270, 4260], [10510, 4260], [10510, 4210], [11030, 4210], [11030, 5785], [10510, 5785], [10510, 5740], [10270, 5740]], mat: 'marble', counted: false },
];

/** Flooring material catalog: price ¥/m², swatch color */
export const MATS = {
    wood: { name: 'Oak Flooring', price: 320, sw: '#d8b88a' },
    walnut: { name: 'Walnut Flooring', price: 380, sw: '#9b7250' },
    tile800: { name: '800 Tile', price: 220, sw: '#ebe6dc' },
    tile600: { name: '600 Tile', price: 160, sw: '#dfe3e1' },
    marble: { name: 'Marble', price: 650, sw: '#f1eee8' },
    antislip: { name: '300 Anti-slip Tile', price: 140, sw: '#d3d8d4' },
    terrazzo: { name: 'Terrazzo', price: 280, sw: '#e6dfd3' },
    carpet: { name: 'Wall-to-wall Carpet', price: 200, sw: '#c9c3d3' },
};

/**
 * Furniture catalog: [type, name, width, depth, color]
 * @returns {Array<{cat: string, items: Array<[string, string, number, number, string]>}>}
 */
export const LIB = [
    {
        cat: 'Bedroom', items: [
            ['bed', 'Double Bed 1.8m', 1800, 2000, '#c9d6df'], ['bed', 'Double Bed 1.5m', 1500, 2000, '#d8c7dc'], ['bed', 'Single Bed', 1200, 2000, '#e8d5b5'],
            ['crib', 'Crib', 1250, 700, '#efe3d0'], ['nightstand', 'Nightstand', 450, 400, '#e8dccb'], ['wardrobe', 'Wardrobe', 2000, 600, '#efe6d8'],
            ['wardrobe', 'Small Wardrobe', 1200, 550, '#efe6d8'], ['dresser', 'Dresser', 1000, 450, '#efe6d8'], ['desk', 'Desk', 1200, 600, '#e2cfb4'],
            ['chair', 'Chair', 450, 480, '#cfc6b8'], ['bookshelf', 'Bookshelf', 800, 300, '#e2cfb4'], ['baycushion', 'Bay Cushion', 520, 1800, '#e7dccd']]
    },
    {
        cat: 'Living Room', items: [
            ['sofa', '3-Seat Sofa', 2400, 900, '#b7c4b0'], ['sofa', 'Loveseat', 1700, 880, '#c3cbd6'], ['cornersofa', 'Corner Sofa', 2800, 1700, '#b7c4b0'],
            ['armchair', 'Armchair', 850, 850, '#d6b99a'], ['beanbag', 'Beanbag', 800, 800, '#e0b98f'], ['coffeetable', 'Coffee Table', 1300, 650, '#e8dccb'],
            ['sidetable', 'Side Table', 500, 500, '#d9c3a3'], ['tvstand', 'TV Stand', 2400, 400, '#e2cfb4'], ['rug', 'Rug', 2400, 1700, '#d9cbb8'],
            ['shoecab', 'Shoe Cabinet', 1000, 350, '#efe6d8'], ['shoecab', 'Entry Cabinet', 1400, 380, '#e6dccc'], ['floorlamp', 'Floor Lamp', 450, 450, '#3d3a34'],
            ['plant', 'Plant', 500, 500, '#a9c39b'], ['plant', 'Large Plant', 700, 700, '#9dbb8c']]
    },
    {
        cat: 'Dining & Kitchen', items: [
            ['table', 'Dining Table', 1400, 800, '#e2cfb4'], ['table', '6-Seat Dining Table', 1800, 900, '#d8c2a2'], ['roundtable', 'Round Table', 1000, 1000, '#e2cfb4'],
            ['chair', 'Dining Chair', 450, 480, '#cfc6b8'], ['island', 'Kitchen Island', 1800, 900, '#e9e5de'], ['barstool', 'Bar Stool', 420, 420, '#6b5d4c'],
            ['counter', 'Kitchen Counter', 1600, 600, '#e9e5de'], ['stove', 'Gas Stove', 750, 450, '#dcdcdc'], ['ksink', 'Sink', 800, 450, '#e1e6ea'],
            ['fridge', 'Fridge', 700, 700, '#dfe4e8'], ['cabinet', 'Sideboard', 1600, 400, '#efe6d8']]
    },
    {
        cat: 'Bathroom', items: [
            ['toilet', 'Toilet', 400, 700, '#ffffff'], ['vanity', 'Vanity', 800, 500, '#eef1f3'], ['vanity', 'Double Vanity', 1200, 500, '#eef1f3'],
            ['shower', 'Shower', 900, 900, '#e4edf2'], ['bathtub', 'Bathtub', 1600, 750, '#eef3f6'], ['washer', 'Washer', 600, 600, '#e6ebee'],
            ['waterheater', 'Water Heater', 800, 450, '#f4f4f2'], ['cabinet', 'Storage Cabinet', 1000, 400, '#efe6d8']]
    },
    {
        cat: 'Appliances', items: [
            ['tv', '65" TV', 1450, 80, '#1d1d1f'], ['tv', '55" TV', 1230, 80, '#1d1d1f'], ['fridge', 'French-door Fridge', 910, 700, '#c9ced3'],
            ['aircon', 'Floor AC', 500, 380, '#f6f7f8'], ['acwall', 'Wall AC', 900, 250, '#f6f7f8'], ['dishwasher', 'Dishwasher', 600, 600, '#c9ced3'],
            ['ovencol', 'Oven Tower', 600, 600, '#efe6d8'], ['dryer', 'Dryer', 600, 600, '#e6ebee'], ['purifier', 'Air Purifier', 400, 300, '#f4f4f2']]
    },
    {
        cat: 'Study & Leisure', items: [
            ['desk', 'Long Desk', 1600, 700, '#d8c2a2'], ['officechair', 'Office Chair', 620, 620, '#4a4f55'], ['bookshelf', 'Large Bookshelf', 1600, 350, '#e2cfb4'],
            ['piano', 'Upright Piano', 1500, 600, '#1f1d1b'], ['treadmill', 'Treadmill', 800, 1800, '#3a3a3c'], ['armchair', 'Reading Chair', 750, 800, '#c9a98a']]
    },
];

export const typeColor = t => { for (const c of LIB) for (const i of c.items) if (i[0] === t) return i[4]; return '#eee'; };

let _n = 1;
const uid = () => 'f' + Date.now().toString(36) + (_n++);

/** Furniture instance: center coords cx/cy (mm), size w/d (mm), rot (°), color */
export const F = (type, name, cx, cy, w, d, rot = 0, color) => ({ id: uid(), type, name, cx, cy, w, d, rot, color: color || typeColor(type) });

/** Factory-default furniture layout */
export function defaultFurniture() {
    return [
        // master bedroom
        F('bed', 'Double Bed', 8300, 1000, 1800, 2000, 0, '#c9d6df'), F('nightstand', 'Nightstand', 7150, 220, 450, 400), F('nightstand', 'Nightstand', 9450, 220, 450, 400),
        F('wardrobe', 'Wardrobe', 8800, 3070, 2400, 600, 180), F('baycushion', 'Bay Cushion', 10770, 1705, 520, 1800),
        // master bath
        F('shower', 'Shower', 5270, 450, 900, 900), F('toilet', 'Toilet', 5170, 1500, 400, 700, 270), F('vanity', 'Vanity', 6110, 700, 800, 500, 90),
        // kids' room
        F('bed', 'Single Bed', 2420, 1000, 1200, 2000, 0, '#e8d5b5'), F('desk', 'Desk', 2120, 2700, 1200, 600, 270), F('chair', 'Chair', 2700, 2700, 450, 480, 90),
        F('wardrobe', 'Wardrobe', 4280, 1000, 1600, 600, 90), F('bookshelf', 'Bookshelf', 3500, 150, 800, 300),
        // guest bath
        F('shower', 'Shower Area', 2870, 4280, 900, 1340), F('toilet', 'Toilet', 3560, 3960, 400, 700), F('vanity', 'Vanity', 4150, 3850, 700, 480),
        // laundry balcony
        F('washer', 'Washer', 300, 3960, 600, 600, 270), F('vanity', 'Laundry Sink', 250, 4600, 600, 500, 270),
        // kitchen
        F('counter', 'Kitchen Counter', 300, 6575, 2770, 600, 270), F('counter', 'Kitchen Counter', 1390, 7660, 1580, 600, 180),
        F('stove', 'Gas Stove', 300, 6200, 750, 450, 270), F('ksink', 'Sink', 1400, 7680, 800, 450, 180),
        // dining
        F('fridge', 'Fridge', 2770, 5540, 700, 700), F('table', 'Dining Table', 3600, 6650, 1400, 800, 90),
        F('chair', 'Dining Chair', 2940, 6320, 450, 480, 270), F('chair', 'Dining Chair', 2940, 6980, 450, 480, 270),
        F('chair', 'Dining Chair', 4260, 6320, 450, 480, 90), F('chair', 'Dining Chair', 4260, 6980, 450, 480, 90),
        F('cabinet', 'Sideboard', 3500, 7785, 1600, 350, 180),
        // living room
        F('rug', 'Rug', 7600, 8950, 2600, 1800), F('tvstand', 'TV Stand', 7600, 6810, 2400, 400), F('sofa', '3-Seat Sofa', 7600, 10110, 3000, 900, 180),
        F('coffeetable', 'Coffee Table', 7600, 8900, 1300, 650), F('armchair', 'Armchair', 9500, 8900, 850, 850, 90),
        F('shoecab', 'Shoe Cabinet', 4995, 9900, 1000, 350, 270), F('plant', 'Plant', 9950, 10250, 500, 500), F('plant', 'Plant', 5250, 7050, 500, 500),
        // children's room
        F('bed', 'Double Bed', 7323, 5500, 1500, 2000, 270, '#d8c7dc'), F('wardrobe', 'Wardrobe', 8500, 3910, 2000, 600),
        F('desk', 'Desk', 9500, 6070, 1200, 600, 180), F('chair', 'Chair', 9500, 5480, 450, 480), F('baycushion', 'Bay Cushion', 10770, 4997, 520, 1575),
        // leisure balcony
        F('roundtable', 'Tea Table', 11180, 8200, 600, 600), F('armchair', 'Lounge Chair', 11180, 7520, 750, 750, 0, '#d6b99a'),
        F('armchair', 'Lounge Chair', 11180, 8880, 750, 750, 180, '#d6b99a'), F('plant', 'Plant', 11550, 10250, 500, 500),
    ];
}

/** Default plan state: furniture + per-room (name/material) + demolished walls + measure lines */
export function defaultState() {
    const rooms = {};
    ROOMS.forEach(r => (rooms[r.id] = { name: r.name, mat: r.mat }));
    return { furniture: defaultFurniture(), rooms, demolished: [], measures: [] };
}

/* ======================= Geometry utilities (mm domain) ======================= */

/** Polygon area, m² */
export const area = poly => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2 / 1e6;
/** Polygon perimeter, m */
export const perim = poly => poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0) / 1000;
/** Bounding box [x0, y0, x1, y1] */
export const bbox = poly => { const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
/** Furniture rotated half-extents (half-width / half-height of the axis-aligned bounding box) */
export const aabb = f => { const a = (f.rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return { hw: (f.w / 2) * c + (f.d / 2) * s, hh: (f.w / 2) * s + (f.d / 2) * c }; };
export const fmt = (n, d = 2) => n.toFixed(d);
export const norm = a => ((Math.round(a) % 360) + 360) % 360;
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ======================= Coordinate conversion (mm → 3D meters) ======================= */

/** Plan center placed at the world origin, ceiling height 2.8 m */
export const OX = 6000, OY = 5300, H = 2.8;
export const wx = x => (x - OX) / 1000;
export const wz = y => (y - OY) / 1000;
export const M = v => v / 1000;

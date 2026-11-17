export const VERSION = 1;
export const SITE = { width: 12.5, depth: 8, west: -1.05, east: 2.075, split: .8, wall: .15, ceiling: 2.8, poolBottom: -2.2, shelf: -.45 };
export const DEFAULTS = { water: -.15, office: -1.8, deck: 1.25 };
export const LIMITS = { water: [-.35, -.05], office: [-2.05, -1.2], deck: [.6, 1.8] };
export const ROOMS = [
  { id: 'habitat', number: '01', name: '水域与亲水台', en: 'HABITAT', bounds: [-6.25, -4, -1.05, .8], area: 24.96, color: '#719c99', brief: '深水、隐蔽休息区、水下浅台与出水短坡。日常互动集中在靠南的湿平台。' },
  { id: 'office', number: '02', name: '错层观察室', en: 'OBSERVATORY', bounds: [-1.05, -4, 2.075, .8], area: 15, color: '#9aabc0', brief: '沿东侧楼梯下沉到观察位，坐姿平视主池。南侧入口平台与生活层齐平。' },
  { id: 'support', number: '03', name: '维生与培育区', en: 'LIFE SUPPORT', bounds: [2.075, -4, 6.25, .8], area: 20.04, color: '#c0b291', brief: '下沉培育井与观察室对窗；上层布置过滤、换热与维护工作台。样本水路可独立隔离。' },
  { id: 'living', number: '04', name: '人类生活区', en: 'LIVING QUARTERS', bounds: [-6.25, .8, 6.25, 4], area: 40, color: '#c4b6a6', brief: '客厅、开放厨房、卧室与卫生间。与湿平台通过可关闭的玻璃移门相连。' },
];
export const fmt = (value, digits=2) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(digits)}`;
export function normalize(input={}) {
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => {
    const value = Number(input[key]);
    return [key, Number.isFinite(value) ? Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], value)) : fallback];
  }));
}
export function metrics(input) {
  const p=normalize(input);
  const front=SITE.split-p.deck;
  return { ...p, front, waterArea: 4.94*(front+3.82), wetArea: 5.2*p.deck, eye: p.office+1.15, immersion: p.water-(p.office+1.15), riser: -p.office/10, stairRun: 2.7, waterDepth: p.water-SITE.poolBottom, shelfDepth: p.water-SITE.shelf, total: ROOMS.reduce((sum,r)=>sum+r.area,0) };
}
export function checks(input) {
  const m=metrics(input);
  return [
    { id: 'eye', ok: m.immersion>=.2, label: m.immersion>0 ? `眼位低于水面 ${m.immersion.toFixed(2)} m` : `眼位高于水面 ${(-m.immersion).toFixed(2)} m`, note: m.immersion>=.2?'形成水下平视关系':'当前标高不利于稳定的水下平视' },
    { id: 'deck', ok: m.deck>=1.2, label: `湿平台进深 ${m.deck.toFixed(2)} m`, note: m.deck>=1.2?'可讨论紧凑双人互动，仍需验证家具净距':'适合边缘互动，双人停留空间偏紧' },
    { id: 'water', ok: m.waterArea>=19.5, label: `主池水面 ${m.waterArea.toFixed(1)} ㎡`, note: '含水下浅台；与原约 20㎡ 水面目标存在取舍' },
  ];
}
export function exportDesign(input) {
  return { schema:'lutie-space-concept/v1', units:'metres', coordinates:'x east, y up, z south', status:'concept proposal; not construction documentation', parameters:normalize(input), site:SITE, metrics:metrics(input), rooms:ROOMS, notes:['100㎡ 为分区投影面积，未作为净使用面积。','标高、湿平台和家具为本页概念方案。','玻璃隔断、风路及水路仅作空间关系设计，未进行物理仿真。'] };
}

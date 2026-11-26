// Light rigs, one per mood. A shot names its rig; envs, the kiwi and FX read colours from it so everything sits in the
// same light. Palette roots come from the site (DESIGN.md): night #0C1526, marker orange #FF6B12, glacier #5CD6E6.
//
// key: the main light (world direction it comes FROM, colour, power). shade: colour multiplied into surfaces in shadow.
// rim: back light colour/power (+ direction it comes from). ink: line colour. fog: colour + near/far (metres).
// sky: [zenith, horizon] for painters. grade: lift (add to darks), gain (multiply), sat, contrast. bloom: glow amount.
export const PALETTE = {
  night: "#0C1526", nightDeep: "#070E1B", marker: "#FF6B12", markerHot: "#FF8B3D", glacier: "#5CD6E6",
  paper: "#F3EDE2", inkBlack: "#0A0D16", bush: "#1F3B2E", fern: "#3E6B3A", kiwiBrown: "#6B4A2E", beanie: "#2E4D8F",
  emerald: "#2FBF9B", crater: "#9A3B2C", snow: "#EEF4FF", sea: "#1D4E6E",
};

const R = (o) => ({ ambient: 0.12, bandSoft: 0.04, bloom: 0.35, grain: 0.05, vignette: 0.35, ...o });

export const RIGS = {
  dawn: R({
    key: { from: [0.8, 0.35, -0.5], color: "#FFD2A6", power: 1.05 }, shade: "#5A5F9A",
    rim: { from: [0.5, 0.3, -1], color: "#FFB27A", power: 0.9 }, ink: "#1B1730",
    fog: { color: "#E9B9A8", near: 30, far: 900 }, sky: ["#3A4D8F", "#F6C3A2"],
    grade: { lift: [0.02, 0.01, 0.04], gain: [1.02, 0.99, 0.97], sat: 1.05, contrast: 1.03 }, bloom: 0.45,
  }),
  storm: R({
    key: { from: [-0.6, 0.8, 0.2], color: "#A9BCE0", power: 0.85 }, shade: "#26304F",
    rim: { from: [0.2, 0.5, -1], color: "#D6E6FF", power: 0.8 }, ink: "#05070E",
    fog: { color: "#3A4763", near: 20, far: 500 }, sky: ["#0D1424", "#3B4A66"],
    grade: { lift: [0.0, 0.01, 0.03], gain: [0.92, 0.97, 1.06], sat: 0.8, contrast: 1.12 }, bloom: 0.5,
  }),
  flood: R({
    key: { from: [-0.4, 0.7, 0.4], color: "#B4C8CB", power: 0.85 }, shade: "#22383E",
    rim: { from: [0.3, 0.4, -1], color: "#EAF8FF", power: 0.75 }, ink: "#061013",
    fog: { color: "#52676B", near: 15, far: 400 }, sky: ["#1A2830", "#5F7477"],
    grade: { lift: [0.0, 0.015, 0.02], gain: [0.94, 1.0, 1.0], sat: 0.82, contrast: 1.1 },
  }),
  bush: R({
    key: { from: [0.3, 0.9, -0.2], color: "#D8E3A8", power: 0.95 }, shade: "#1F3A36",
    rim: { from: [-0.4, 0.4, -1], color: "#9BE8B8", power: 0.7 }, ink: "#07120E",
    fog: { color: "#2C4A3E", near: 6, far: 120 }, sky: ["#1D3A30", "#7FA77A"],
    grade: { lift: [0.0, 0.02, 0.015], gain: [0.97, 1.02, 0.95], sat: 0.95, contrast: 1.08 },
  }),
  scree: R({
    key: { from: [-0.3, 0.8, 0.5], color: "#9CB0CC", power: 0.85 }, shade: "#283246",
    rim: { from: [0.4, 0.3, -1], color: "#C9DBF5", power: 0.7 }, ink: "#070A12",
    fog: { color: "#56637A", near: 8, far: 300 }, sky: ["#232C3D", "#6B778C"],
    grade: { lift: [0.0, 0.01, 0.03], gain: [0.93, 0.97, 1.04], sat: 0.75, contrast: 1.1 },
  }),
  snow: R({
    key: { from: [0.5, 0.7, 0.4], color: "#F2F6FF", power: 1.0 }, shade: "#6E83B5",
    rim: { from: [-0.3, 0.4, -1], color: "#FFFFFF", power: 0.6 }, ink: "#1A2238",
    fog: { color: "#C9D6EE", near: 10, far: 400 }, sky: ["#5D74A8", "#DCE6F7"],
    grade: { lift: [0.02, 0.03, 0.06], gain: [0.98, 1.0, 1.03], sat: 0.85, contrast: 1.0 }, bloom: 0.3,
  }),
  gale: R({
    key: { from: [0.9, 0.3, -0.3], color: "#FFB48C", power: 1.05 }, shade: "#4C2838",
    rim: { from: [-0.6, 0.3, -1], color: "#5CD6E6", power: 0.9 }, ink: "#150A10",
    fog: { color: "#B5706A", near: 20, far: 700 }, sky: ["#2B2350", "#E39A7A"],
    grade: { lift: [0.03, 0.0, 0.03], gain: [1.04, 0.97, 0.98], sat: 1.08, contrast: 1.08 }, bloom: 0.45,
  }),
  spiral: R({
    key: { from: [0.0, 0.6, -1], color: "#FFE2B0", power: 1.0 }, shade: "#2C2668",
    rim: { from: [0, 0.6, -1], color: "#FF8B3D", power: 1.0 }, ink: "#0B0820",
    fog: { color: "#3A3480", near: 30, far: 1200 }, sky: ["#151245", "#6B4FB0"],
    grade: { lift: [0.02, 0.0, 0.05], gain: [1.0, 0.96, 1.05], sat: 1.1, contrast: 1.12 }, bloom: 0.7,
  }),
  silence: R({
    key: { from: [0.4, 0.45, -1], color: "#FFE8C8", power: 1.0 }, shade: "#3C3F7E",
    rim: { from: [0.3, 0.5, -1], color: "#FFB070", power: 1.1 }, ink: "#14112A",
    fog: { color: "#8C86C2", near: 30, far: 1200 }, sky: ["#2A2E78", "#F2B98F"],
    grade: { lift: [0.02, 0.01, 0.05], gain: [1.02, 0.99, 1.0], sat: 1.0, contrast: 1.02 }, bloom: 0.55, grain: 0.035,
  }),
  island: R({
    key: { from: [0.3, 1.0, 0.4], color: "#DDE8FF", power: 0.95 }, shade: "#16223D",
    rim: { from: [0, 0.3, -1], color: "#FF6B12", power: 0.6 }, ink: "#050A14",
    fog: { color: "#0C1526", near: 400, far: 3000 }, sky: ["#070E1B", "#1A2B4D"],
    grade: { lift: [0.0, 0.01, 0.03], gain: [1.0, 1.0, 1.02], sat: 1.05, contrast: 1.06 }, bloom: 0.9,
  }),
  bluff: R({
    key: { from: [1.0, 0.25, -0.4], color: "#FFD08A", power: 1.1 }, shade: "#3A4377",
    rim: { from: [0.8, 0.25, -1], color: "#FF8B3D", power: 1.1 }, ink: "#16142A",
    fog: { color: "#F0B58C", near: 30, far: 900 }, sky: ["#34407A", "#FFC98A"],
    grade: { lift: [0.02, 0.01, 0.03], gain: [1.04, 1.0, 0.96], sat: 1.08, contrast: 1.04 }, bloom: 0.6,
  }),
  night: R({
    key: { from: [0.3, 0.8, 0.5], color: "#C8D6F5", power: 0.8 }, shade: "#121C33",
    rim: { from: [0, 0.4, -1], color: "#FF6B12", power: 0.6 }, ink: "#03060D",
    fog: { color: "#0C1526", near: 50, far: 2000 }, sky: ["#070E1B", "#14213D"],
    grade: { lift: [0.0, 0.005, 0.02], gain: [1, 1, 1], sat: 1.0, contrast: 1.04 }, bloom: 0.8,
  }),
};

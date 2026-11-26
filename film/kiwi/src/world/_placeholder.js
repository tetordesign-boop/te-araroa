// TEMPORARY stand-in so the pipeline runs before the world department delivers. Replace per env.
export function placeholderEnv({ sky = ["#3A4D8F", "#F6C3A2"], hill = "#2E4A44", ground = "#556B4A", marker = null } = {}) {
  return {
    layers: [
      { name: "sky", depth: 900, paint(g, L, ctx) { const { vgrad } = ctx.paint; vgrad(g, 0, 0, L.w, L.h, [[0, sky[0]], [Math.min(1, L.horizon / L.h), sky[1]], [1, sky[1]]]); } },
      { name: "hills", depth: 300, paint(g, L, ctx) { const { ridgePath, ridgeFn, strokes } = ctx.paint;
        const top = ridgeFn({ base: L.yy(18), amp: 40 * L.ppm, wave: 120 * L.ppm, seed: 3 }); const p = ridgePath(L.w, top, L.h);
        g.fillStyle = hill; g.fill(p);
        strokes(g, p, { count: 3000, len: [8, 24], width: [2, 5], colors: [hill, "#3b5a52", "#243c37"], angle: 0, bounds: { x: 0, y: 0, w: L.w, h: L.h } }, 5); } },
    ],
    build(ctx) {
      const { THREE, celMaterial, inkable } = ctx;
      const group = new THREE.Group();
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(60, 60, 1, 1).rotateX(-Math.PI / 2), celMaterial({ color: ground }));
      gm.name = "ground"; group.add(gm);
      if (ctx.opts.marker) {
        const [mx, mz] = ctx.opts.marker;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.1, 10), celMaterial({ color: "#8A6A4A" })); post.position.set(mx, 0.55, mz); post.name = "post";
        const tri = new THREE.Mesh(new THREE.CircleGeometry(0.07, 3).rotateZ(Math.PI / 2), celMaterial({ color: "#FF6B12", side: THREE.DoubleSide })); tri.position.set(mx, 0.95, mz + 0.04); tri.name = "marker";
        group.add(post, tri); inkable(post); inkable(tri);
      }
      return { group, heightAt: () => 0, colliders: [gm] };
    },
  };
}

// TEMPORARY stand-in kiwi (the kiwi department replaces this file). Same interface as the real one.
export default {
  async create(ctx) {
    const { THREE, celMaterial, inkable, T } = ctx;
    const root = new THREE.Group(); root.name = "kiwi";
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16).scale(1, 0.85, 1.2), celMaterial({ color: "#6B4A2E" })); body.position.y = 0.26; root.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), celMaterial({ color: "#6B4A2E" })); head.position.set(0, 0.38, 0.15); root.add(head);
    const beak = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, 0.18, 8).rotateX(Math.PI / 2 + 0.5), celMaterial({ color: "#D8C9A0" })); beak.position.set(0, 0.33, 0.27); root.add(beak);
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.072, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), celMaterial({ color: "#2E4D8F" })); hat.position.set(0, 0.4, 0.14); root.add(hat);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), celMaterial({ color: "#FF6B12" })); pom.position.set(0, 0.48, 0.13); root.add(pom);
    const feet = ["L", "R"].map((s) => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.09), celMaterial({ color: "#C8A060" })); f.name = "foot" + s; root.parent; return f; });
    const fg = new THREE.Group(); feet.forEach((f) => fg.add(f));
    const all = new THREE.Group(); all.add(root, fg); inkable(all);
    let contacts = [];
    const api = {
      root: all,
      update(t, t2, spec, ctx) {
        const acts = spec?.acts ?? []; let x = spec?.at?.[0] ?? 0, z = spec?.at?.[1] ?? 0, yaw = (spec?.yaw ?? 90) * Math.PI / 180, phase = null;
        for (const a of acts) if (a.do === "walk") {
          if (t >= a.t0) { const k = T.clamp((t - a.t0) / (a.t1 - a.t0)); x = T.lerp(a.from[0], a.to[0], k); z = T.lerp(a.from[1], a.to[1], k); yaw = Math.atan2(a.to[0] - a.from[0], a.to[1] - a.from[1]); if (t < a.t1) phase = (t - a.t0) * 3; }
          else { x = a.from[0]; z = a.from[1]; }
        }
        const y = ctx.heightAt(x, z);
        root.position.set(x, y + (phase !== null ? Math.abs(Math.sin(T.twos(t) * Math.PI * 3)) * 0.015 : 0), z); root.rotation.y = yaw;
        root.updateMatrixWorld(true);
        const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        contacts = feet.map((f, i) => {
          const s = i ? -1 : 1; const p = new THREE.Vector3(x, 0, z).addScaledVector(side, s * 0.05);
          let planted = true, lift = 0;
          if (phase !== null) { const ph = (phase + i) % 2; const stepLen = 0.15; const n = Math.floor((phase + i) / 2);
            // planted feet stay at their step point; swinging foot interpolates to the next
            const base = (n * 2 - i) / 3 * 0.45; if (ph < 1) { planted = true; p.addScaledVector(fwd, base - (t - (acts.find(a=>a.do==='walk').t0)) * 0.45 + 0); } else { planted = false; lift = Math.sin((ph - 1) * Math.PI) * 0.03; } }
          p.y = ctx.heightAt(p.x, p.z) + lift; f.position.set(p.x, p.y + 0.015, p.z); f.rotation.y = yaw;
          return { name: "foot" + (i ? "R" : "L"), p: new THREE.Vector3(p.x, p.y, p.z), planted };
        });
      },
      anchor(name) {
        const m = { body: body, head: head, eyeR: head, eyeL: head, beakTip: beak, pompom: pom, footL: feet[0], footR: feet[1], root: root }[name] ?? root;
        return m.getWorldPosition(new THREE.Vector3());
      },
      contacts: () => contacts,
      dispose() {},
    };
    return api;
  },
};

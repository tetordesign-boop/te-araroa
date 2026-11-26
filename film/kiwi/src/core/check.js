// Continuity checks with three-mesh-bvh, run on every frame before the final render:
//  - feet: planted soles neither inside the ground/props (> 1 cm) nor floating (> 2 cm), and not sliding (> 4 mm/frame)
//  - camera: never inside a collider, never below the ground, never inside the kiwi
//  - camera path: no jerks (spikes in acceleration of the un-shaken path)
//  - pops: no mesh appears or vanishes mid-shot unless it is marked userData.popOK
import * as THREE from "three";
import { computeBoundsTree, acceleratedRaycast, MeshBVH } from "three-mesh-bvh";
import { FPS } from "./time.js";
import { ASPECTS } from "./stage.js";
import { SHOTS } from "../shots.js";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const DOWN = new THREE.Vector3(0, -1, 0);
export async function runChecks(stage, { shots: only, aspects = Object.keys(ASPECTS), step = 1 } = {}) {
  const report = []; const add = (shot, frame, kind, msg) => report.push({ shot, frame, kind, msg });
  stage.noLayers = true;
  for (const shot of SHOTS) {
    if (only && !only.includes(shot.id)) continue;
    await stage.build(shot);
    stage.scene.updateMatrixWorld(true);
    const colliders = (stage.envBuilt.colliders ?? []).filter((m) => m.isMesh);
    for (const m of colliders) { m.updateMatrixWorld(true); if (!m.geometry.boundsTree) m.geometry.computeBoundsTree(); }
    const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
    const groundY = (x, z) => {
      ray.set(new THREE.Vector3(x, 1e4, z), DOWN); ray.far = 2e4;
      const hits = colliders.length ? ray.intersectObjects(colliders, false) : [];
      return hits.length ? hits[0].point.y : stage.envBuilt.heightAt ? stage.envBuilt.heightAt(x, z) : -Infinity;
    };
    const f0 = Math.round(shot.t0 * FPS), f1 = Math.round(shot.t1 * FPS);
    let prevFeet = null, prevVisible = null;
    for (let f = f0; f < f1; f += step) {
      const t = f / FPS; stage.pose(t); stage.scene.updateMatrixWorld(true);
      // feet
      if (stage.kiwi?.contacts) {
        const feet = stage.kiwi.contacts();
        for (const c of feet) {
          const gy = groundY(c.p.x, c.p.z);
          if (gy - c.p.y > 0.01) add(shot.id, f, "foot-in-ground", `${c.name} ${((gy - c.p.y) * 100).toFixed(1)} cm under`);
          if (c.planted && c.p.y - gy > 0.02) add(shot.id, f, "foot-float", `${c.name} ${((c.p.y - gy) * 100).toFixed(1)} cm above while planted`);
          const pv = prevFeet?.find((x) => x.name === c.name);
          if (pv && pv.planted && c.planted) { const d = Math.hypot(c.p.x - pv.p.x, c.p.z - pv.p.z); if (d > 0.004 * step) add(shot.id, f, "foot-slide", `${c.name} slid ${(d * 1000).toFixed(1)} mm`); }
        }
        prevFeet = feet.map((c) => ({ name: c.name, planted: c.planted, p: c.p.clone() }));
      }
      // pops
      const vis = new Set(); stage.scene.traverseVisible((o) => { if (o.isMesh || o.isPoints || o.isLine) if (!o.userData.popOK && !o.parent?.userData?.popOK) vis.add(o.uuid + ":" + (o.name || o.type)); });
      if (prevVisible) { for (const k of vis) if (!prevVisible.has(k)) add(shot.id, f, "pop-in", k.split(":")[1]); for (const k of prevVisible) if (!vis.has(k)) add(shot.id, f, "pop-out", k.split(":")[1]); }
      prevVisible = vis;
      // camera, per aspect
      for (const asp of aspects) {
        const st = stage.camAt(shot, asp, t, true);
        const p = new THREE.Vector3(...st.pos);
        const gy = groundY(p.x, p.z); if (p.y < gy + 0.015) add(shot.id, f, "camera-below-ground", `${asp} ${((gy - p.y) * 100).toFixed(1)} cm under`);
        for (const m of colliders) {
          const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(); const lp = p.clone().applyMatrix4(inv);
          const hit = m.geometry.boundsTree.closestPointToPoint(lp);
          if (hit) { const wp = hit.point.clone().applyMatrix4(m.matrixWorld); const d = wp.distanceTo(p); if (d < stage.camera.near * 2) add(shot.id, f, "camera-touching", `${asp} ${m.name || "collider"} ${(d * 100).toFixed(1)} cm`); }
          // inside test for closed meshes: odd number of hits along +x
          if (m.userData.closed) { const r2 = new THREE.Raycaster(lp, new THREE.Vector3(1, 0.0123, 0.0071).normalize()); r2.firstHitOnly = false; const n = m.geometry.boundsTree.raycast(r2.ray, THREE.DoubleSide).length; if (n % 2 === 1) add(shot.id, f, "camera-inside", `${asp} ${m.name}`); }
        }
        if (stage.kiwi?.anchor) { for (const [a, rad] of [["body", 0.16], ["head", 0.07]]) { const q = stage.kiwi.anchor(a); if (q && q.distanceTo(p) < rad) add(shot.id, f, "camera-inside-kiwi", `${asp} ${a}`); } }
      }
    }
    // camera jerk (un-shaken path)
    for (const asp of aspects) {
      const P = []; for (let f = f0; f < f1; f++) { const st = stage.camAt(shot, asp, f / FPS, false); P.push([...st.pos, ...st.look]); }
      const acc = []; for (let i = 1; i < P.length - 1; i++) acc.push(Math.hypot(...P[i].map((v, k) => P[i + 1][k] - 2 * v + P[i - 1][k])));
      const scale = Math.max(1e-4, ...P.map((p) => Math.hypot(p[0] - p[3], p[1] - p[4], p[2] - p[5]))) ;
      const okF = (shot.cam[asp] ?? shot.cam["16x9"]).filter((k) => k.jerkOK).map((k) => Math.round(k.t * FPS));
      for (let i = 1; i < acc.length; i++) { const j = Math.abs(acc[i] - acc[i - 1]) / scale; if (okF.some((k) => Math.abs(f0 + i + 1 - k) <= 3)) continue; if (j > 0.004) add(shot.id, f0 + i + 1, "camera-jerk", `${asp} ${j.toFixed(4)}`); }
    }
  }
  stage.noLayers = false; stage.shot = null;
  return report;
}

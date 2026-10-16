import * as React from "react";
import { GANTRY5, cropById, cropName, footprint, layerOf, tooTallForGantry, wormBinCols, bedGrid } from "@dlab5/permtek5-core";
import type { Bed, Cell } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { cropColor } from "./common";

/**
 * A bed's target in 3D (docs/adr/0029): the bed, its worm box and the gantry, and the plants a period plans, each
 * as wide as its spacing and as tall as its crop grows (the library's height). Drawn in the browser from the map's
 * own data with three.js; nothing is uploaded and no file is needed. Drag to turn, scroll to come closer.
 * three.js is loaded only when the view is opened, and only in the browser.
 */
export function Bed3D({ bed, cells }: { bed: Bed; cells: Cell[] }) {
  const { t, lang } = useT();
  const [open, setOpen] = React.useState(false);
  const tall = [...new Set(cells.filter((c) => tooTallForGantry(c.cropId)).map((c) => c.cropId))];
  return (
    <details className="pt-bed3d" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{t("bed3d.show")}</summary>
      {open && <Scene bed={bed} cells={cells} />}
      <p className="pt-muted">{t("bed3d.hint")}</p>
      {tall.length > 0 && (
        <p className="pt-plansets__deep">
          {t("bed3d.tall", { crops: tall.map((id) => (cropById(id) ? cropName(cropById(id)!, lang) : id)).join(", "), cm: GANTRY5.toolClearanceCm })}
        </p>
      )}
    </details>
  );
}

function Scene({ bed, cells }: { bed: Bed; cells: Cell[] }) {
  const { t } = useT();
  const box = React.useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState(false);
  const key = cells.map((c) => `${c.row}|${c.col}|${c.cropId}`).join(",");

  React.useEffect(() => {
    let stop = () => {};
    let gone = false;
    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const el = box.current;
        if (gone || !el) return;
        stop = draw(THREE, OrbitControls, el, bed, cells);
      } catch {
        setFailed(true);
      }
    })();
    return () => { gone = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bed.id, bed.lengthCm, bed.widthCm, bed.depthCm, bed.wormBinCm, key]);

  return failed ? <p className="pt-error">{t("bed3d.failed")}</p> : <div className="pt-bed3d__view" ref={box} role="img" aria-label={t("bed3d.show")} />;
}

type Three = typeof import("three");

/** Builds the scene into `el` and returns what tears it down. Metres; x along the bed, z across it, y up. */
function draw(THREE: Three, Controls: typeof import("three/examples/jsm/controls/OrbitControls.js").OrbitControls,
  el: HTMLElement, bed: Bed, cells: Cell[]): () => void {
  const css = getComputedStyle(el);
  const L = bed.lengthCm / 100, W = bed.widthCm / 100, cell = bed.cellCm / 100;
  const soil = Math.max(0.15, (bed.depthCm ?? 25) / 100 + 0.12);          // the substrate on the tank pipes
  const binM = wormBinCols(bed) * cell;
  const planted = Math.max(0, bedGrid(bed).cols * cell - binM);
  const rail = soil + GANTRY5.railAboveSoilCm / 100;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(css.getPropertyValue("--pt-bg-sunken").trim() || "#eef2ef");
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  camera.position.set(L * 0.5 - 1.6, 2.3, W + 2.4);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  el.appendChild(renderer.domElement);
  const controls = new Controls(camera, renderer.domElement);
  controls.target.set(L / 2, soil, W / 2);
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x6b5a45, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(L * 0.2, 6, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -3, right: L + 3, top: 3, bottom: -3 });
  scene.add(sun);

  const owned: { dispose: () => void }[] = [];
  // the map's crop colours are CSS "hsl(h s% l%)", which three.js does not read: turned into its own colour here
  const colour = (c: string | number) => {
    const hsl = typeof c === "string" && /^hsl\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\)$/.exec(c);
    return hsl ? new THREE.Color().setHSL(Number(hsl[1]) / 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100) : new THREE.Color(c);
  };
  const mat = (color: string | number, rough = 0.85) => { const m = new THREE.MeshStandardMaterial({ color: colour(color), roughness: rough }); owned.push(m); return m; };
  type Geometry = NonNullable<ConstructorParameters<Three["Mesh"]>[0]>;
  const add = (geo: Geometry, m: InstanceType<Three["Material"]>, x: number, y: number, z: number, shadow = true) => {
    owned.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const block = (sx: number, sy: number, sz: number, m: InstanceType<Three["Material"]>, x: number, y: number, z: number) =>
    add(new THREE.BoxGeometry(sx, sy, sz), m, x + sx / 2, y + sy / 2, z + sz / 2);

  // the roof, the bed's frame and its soil, the worm box at the far end
  const wood = mat(0x8a6a44), alu = mat(0xc8ccd0, 0.35);
  block(L + 3, 0.02, W + 3, mat(0x9a9a9e, 0.95), -1.5, -0.02, -1.5);
  block(planted, soil - 0.02, W, mat(0x3b2a1c, 1), 0, 0, 0);
  const t = 0.03;
  block(L + 2 * t, soil + 0.03, t, wood, -t, 0, -t);
  block(L + 2 * t, soil + 0.03, t, wood, -t, 0, W);
  block(t, soil + 0.03, W, wood, -t, 0, 0);
  block(t, soil + 0.03, W, wood, L, 0, 0);
  if (binM > 0) {
    block(binM, soil + 0.3, W, wood, planted, 0, 0);
    block(binM + 0.02, 0.02, W + 0.02, mat(0xa39d88), planted - 0.01, soil + 0.3, -0.01);
  }
  // the gantry: two rails on posts, the bridge across them over the middle of the bed
  for (const z of [-0.1, W + 0.1]) {
    block(L + 0.4, 0.04, 0.04, alu, -0.2, rail, z - 0.02);
    for (const x of [-0.2, L + 0.16]) block(0.04, rail, 0.04, alu, x, 0, z - 0.02);
  }
  block(0.06, 0.04, W + 0.24, alu, planted * 0.4, rail + 0.04, -0.12);
  block(0.1, 0.08, 0.1, mat(0x1d1f22), planted * 0.4 - 0.02, rail - 0.04, W * 0.45 - 0.05);

  // the plants: as wide as their spacing, as tall as their crop grows; a ground cover low and flat
  const shape = new THREE.SphereGeometry(0.5, 18, 12);
  owned.push(shape);
  const colours = new Map<string, InstanceType<Three["Material"]>>();
  for (const c of cells) {
    const crop = cropById(c.cropId);
    const width = Math.max(cell * 0.8, footprint(c.cropId, bed) * cell * 0.9);
    const height = Math.max(0.05, (crop?.mix?.heightCm ?? 25) / 100) * (layerOf(c.cropId) === "ground" ? 0.6 : 1);
    if (!colours.has(c.cropId)) colours.set(c.cropId, mat(cropColor(c.cropId), 0.7));
    const plant = new THREE.Mesh(shape, colours.get(c.cropId)!);
    plant.scale.set(width, height * 2, width);
    plant.position.set((c.col + 0.5) * cell, soil + height * 0.5, (c.row + 0.5) * cell);
    plant.castShadow = plant.receiveShadow = true;
    scene.add(plant);
  }

  const resize = () => {
    const w = el.clientWidth || 600, h = Math.round(Math.min(480, Math.max(260, w * 0.55)));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const watch = new ResizeObserver(resize);
  watch.observe(el);
  let frame = 0;
  const loop = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(loop); };
  loop();
  return () => {
    cancelAnimationFrame(frame);
    watch.disconnect();
    controls.dispose();
    for (const o of owned) o.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

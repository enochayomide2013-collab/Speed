import * as THREE from 'three';
import type { MapDef, SurfaceType } from '../shared/gameData';
import {
  createBoostPadTexture,
  createBuildingFacadePBR,
  createCheckerTexture,
  createConcretePBR,
  createRoadPBR,
  createTerrainPBR,
  createWaterNormalMap,
} from './ProceduralTextures';

export interface BoostZone {
  center: THREE.Vector3;
  radius: number;
  tangent: THREE.Vector3;
}

export interface JumpRamp {
  center: THREE.Vector3;
  tangent: THREE.Vector3;
  width: number;
  length: number;
  height: number;
}

export interface GrindRail {
  curve: THREE.CatmullRomCurve3;
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
}

export interface WallRunPanel {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  length: number;
  height: number;
}

export interface TrackObstacle {
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  rightVec: THREE.Vector3;
  halfWidth: number;
  height: number;
  slideUnder: boolean;
  oscillateAmp: number;
  oscillateSpeed: number;
  phase: number;
}

export interface CollectibleItem {
  id: number;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  kind: 'star' | 'turbo';
  collected: boolean;
  respawnTimer: number;
}

export interface CheckpointGate {
  index: number;
  progress: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  mesh: THREE.Group;
}

export interface TrackSample {
  progress: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  lateralOffset: number;
  halfWidth: number;
  surface: SurfaceType;
  distSq: number;
}

export interface BuiltMap {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  samples: { pos: THREE.Vector3; tangent: THREE.Vector3; right: THREE.Vector3; width: number; surface: SurfaceType }[];
  checkpoints: CheckpointGate[];
  boostZones: BoostZone[];
  jumpRamps: JumpRamp[];
  grindRails: GrindRail[];
  wallPanels: WallRunPanel[];
  obstacles: TrackObstacle[];
  collectibles: CollectibleItem[];
  weatherPoints: THREE.Points | null;
  animatedProps: THREE.Object3D[];
  totalLength: number;
  updateAtmosphere: (dt: number, focusPos: THREE.Vector3) => void;
  dispose: () => void;
}

function hashSeed(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function buildTrackMap(
  mapDef: MapDef,
  maxAnisotropy: number,
  modeId: string,
  quality: 'low' | 'medium' | 'high' | 'ultra'
): BuiltMap {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const points = mapDef.waypoints.map((w) => new THREE.Vector3(w.x, w.y, w.z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.45);
  const totalLength = curve.getLength();
  const sampleCount = 260;

  const samples: BuiltMap['samples'] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

    const wpFloat = t * mapDef.waypoints.length;
    const wpIdx = Math.floor(wpFloat) % mapDef.waypoints.length;
    const wpNext = (wpIdx + 1) % mapDef.waypoints.length;
    const frac = wpFloat - Math.floor(wpFloat);
    const w0 = mapDef.waypoints[wpIdx].width ?? 16;
    const w1 = mapDef.waypoints[wpNext].width ?? 16;
    const width = THREE.MathUtils.lerp(w0, w1, frac);
    const surface = mapDef.waypoints[wpIdx].surface ?? 'normal';

    samples.push({ pos, tangent, right, width, surface });
  }

  // ==========================================================================
  // 1. PBR ROADWAY CARRIAGEWAY + RAISED SIDEWALKS & BRIDGE DECK INFRASTRUCTURE
  // ==========================================================================
  const roadPos: number[] = [];
  const roadNorm: number[] = [];
  const roadUv: number[] = [];
  const roadIdx: number[] = [];

  const sidePos: number[] = [];
  const sideNorm: number[] = [];
  const sideUv: number[] = [];
  const sideIdx: number[] = [];

  const deckPos: number[] = [];
  const deckNorm: number[] = [];
  const deckIdx: number[] = [];

  for (let i = 0; i <= sampleCount; i++) {
    const s = samples[i % sampleCount];
    const halfW = s.width * 0.5;
    const sidewalkW = 1.9;
    const curbH = 0.16;
    const vCoord = (i / sampleCount) * (totalLength / 13);

    const lRoad = s.pos.clone().addScaledVector(s.right, -halfW);
    const rRoad = s.pos.clone().addScaledVector(s.right, halfW);
    roadPos.push(lRoad.x, lRoad.y, lRoad.z, rRoad.x, rRoad.y, rRoad.z);
    roadNorm.push(0, 1, 0, 0, 1, 0);
    roadUv.push(0, vCoord, 1, vCoord);

    if (i < sampleCount) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      roadIdx.push(a, b, c, b, d, c);
    }

    // Left & Right Concrete Curbs + Sidewalks + Under-deck Bridge Skirt
    const lCurbTop = s.pos.clone().addScaledVector(s.right, -(halfW + 0.15)).add(new THREE.Vector3(0, curbH, 0));
    const lOuter = s.pos.clone().addScaledVector(s.right, -(halfW + sidewalkW)).add(new THREE.Vector3(0, curbH, 0));
    const rCurbTop = s.pos.clone().addScaledVector(s.right, halfW + 0.15).add(new THREE.Vector3(0, curbH, 0));
    const rOuter = s.pos.clone().addScaledVector(s.right, halfW + sidewalkW).add(new THREE.Vector3(0, curbH, 0));

    sidePos.push(
      lOuter.x, lOuter.y, lOuter.z,
      lCurbTop.x, lCurbTop.y, lCurbTop.z,
      lRoad.x, lRoad.y, lRoad.z,
      rRoad.x, rRoad.y, rRoad.z,
      rCurbTop.x, rCurbTop.y, rCurbTop.z,
      rOuter.x, rOuter.y, rOuter.z
    );
    for (let k = 0; k < 6; k++) sideNorm.push(0, 1, 0);
    sideUv.push(0, vCoord, 0.35, vCoord, 0.4, vCoord, 0.6, vCoord, 0.65, vCoord, 1, vCoord);

    if (i < sampleCount) {
      const base = i * 6;
      const next = (i + 1) * 6;
      // Left sidewalk & curb face
      sideIdx.push(base, base + 1, next, base + 1, next + 1, next);
      sideIdx.push(base + 1, base + 2, next + 1, base + 2, next + 2, next + 1);
      // Right curb face & sidewalk
      sideIdx.push(base + 3, base + 4, next + 3, base + 4, next + 4, next + 3);
      sideIdx.push(base + 4, base + 5, next + 4, base + 5, next + 5, next + 4);
    }

    // Solid Bridge Under-Deck Girder Spine
    const lBot = lOuter.clone().add(new THREE.Vector3(0.4 * s.right.x, -1.1, 0.4 * s.right.z));
    const rBot = rOuter.clone().add(new THREE.Vector3(-0.4 * s.right.x, -1.1, -0.4 * s.right.z));
    deckPos.push(lOuter.x, lOuter.y, lOuter.z, lBot.x, lBot.y, lBot.z, rBot.x, rBot.y, rBot.z, rOuter.x, rOuter.y, rOuter.z);
    deckNorm.push(-s.right.x, -0.3, -s.right.z, 0, -1, 0, 0, -1, 0, s.right.x, -0.3, s.right.z);

    if (i < sampleCount) {
      const b0 = i * 4;
      const b1 = (i + 1) * 4;
      deckIdx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
      deckIdx.push(b0 + 1, b1 + 1, b0 + 2, b0 + 2, b1 + 1, b1 + 2);
      deckIdx.push(b0 + 2, b1 + 2, b0 + 3, b0 + 3, b1 + 2, b1 + 3);
    }
  }

  const trackGeo = new THREE.BufferGeometry();
  trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  trackGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNorm, 3));
  trackGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUv, 2));
  trackGeo.setIndex(roadIdx);
  trackGeo.computeVertexNormals();
  disposables.push(trackGeo);

  const roadPBR = createRoadPBR(mapDef.trackColor, mapDef.curbColor, mapDef.accentColor, mapDef.ambience, maxAnisotropy);
  disposables.push(roadPBR);

  const trackMat = new THREE.MeshStandardMaterial({
    map: roadPBR.map,
    normalMap: roadPBR.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: roadPBR.roughnessMap,
    roughness: 1.0,
    metalness: mapDef.ambience === 'rain' ? 0.25 : 0.08,
    envMapIntensity: mapDef.ambience === 'rain' ? 1.55 : 0.9,
  });
  disposables.push(trackMat);

  const trackMesh = new THREE.Mesh(trackGeo, trackMat);
  trackMesh.receiveShadow = true;
  group.add(trackMesh);

  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
  sideGeo.setAttribute('normal', new THREE.Float32BufferAttribute(sideNorm, 3));
  sideGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sideUv, 2));
  sideGeo.setIndex(sideIdx);
  sideGeo.computeVertexNormals();
  disposables.push(sideGeo);

  const concretePBR = createConcretePBR(maxAnisotropy, mapDef.ambience === 'desert' ? '#B89B74' : '#737B84');
  disposables.push(concretePBR);
  const concreteMat = new THREE.MeshStandardMaterial({
    map: concretePBR.map,
    normalMap: concretePBR.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: concretePBR.roughnessMap,
    roughness: 1.0,
    metalness: 0.06,
  });
  disposables.push(concreteMat);
  const sideMesh = new THREE.Mesh(sideGeo, concreteMat);
  sideMesh.receiveShadow = true;
  sideMesh.castShadow = true;
  group.add(sideMesh);

  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  deckGeo.setAttribute('normal', new THREE.Float32BufferAttribute(deckNorm, 3));
  deckGeo.setIndex(deckIdx);
  deckGeo.computeVertexNormals();
  const deckMat = new THREE.MeshStandardMaterial({ color: '#1F242D', roughness: 0.85, metalness: 0.2 });
  disposables.push(deckGeo, deckMat);
  const deckMesh = new THREE.Mesh(deckGeo, deckMat);
  deckMesh.castShadow = true;
  group.add(deckMesh);

  // Bridge Support Columns underneath elevated track spans
  const pierGeo = new THREE.CylinderGeometry(1.05, 1.35, 1, 14);
  const pierPositions: { pos: THREE.Vector3; h: number }[] = [];
  for (let i = 0; i < sampleCount; i += 10) {
    const s = samples[i];
    if (s.pos.y > 0.6) {
      const h = s.pos.y + 10;
      pierPositions.push({ pos: new THREE.Vector3(s.pos.x, s.pos.y - 1.0 - h * 0.5, s.pos.z), h });
    }
  }
  if (pierPositions.length > 0) {
    disposables.push(pierGeo);
    const pierInst = new THREE.InstancedMesh(pierGeo, concreteMat, pierPositions.length);
    const dummy = new THREE.Object3D();
    pierPositions.forEach((p, idx) => {
      dummy.position.copy(p.pos);
      dummy.scale.set(1, p.h, 1);
      dummy.updateMatrix();
      pierInst.setMatrixAt(idx, dummy.matrix);
    });
    pierInst.instanceMatrix.needsUpdate = true;
    pierInst.computeBoundingSphere();
    pierInst.castShadow = true;
    pierInst.receiveShadow = true;
    group.add(pierInst);
  }

  // ==========================================================================
  // 2. REALISTIC SCULPTED TERRAIN & ANIMATED WATER / OCEAN HORIZON
  // ==========================================================================
  const terrainPBR = createTerrainPBR(mapDef.ambience, maxAnisotropy);
  disposables.push(terrainPBR);

  const terrainGeo = new THREE.PlaneGeometry(1800, 1800, 84, 84);
  terrainGeo.rotateX(-Math.PI / 2);
  const tPos = terrainGeo.attributes.position;
  for (let i = 0; i < tPos.count; i++) {
    const wx = tPos.getX(i) + 75;
    const wz = tPos.getZ(i) - 65;
    tPos.setX(i, wx);
    tPos.setZ(i, wz);

    // Measure distance from track center so terrain forms hills/mountains/dunes outside track corridor
    let minD = 9999;
    for (let k = 0; k < samples.length; k += 8) {
      const dx = wx - samples[k].pos.x;
      const dz = wz - samples[k].pos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minD) minD = dSq;
    }
    const dist = Math.sqrt(minD);
    const corridorClear = THREE.MathUtils.smoothstep(dist, 26, 95);
    const ridgeNoise =
      Math.sin(wx * 0.015) * Math.cos(wz * 0.014) * 14 +
      Math.sin(wx * 0.038 + 1.2) * Math.sin(wz * 0.033) * 6;
    let baseH = -7.5;
    if (mapDef.ambience === 'snow' || mapDef.ambience === 'lava') {
      baseH = -8.5 + corridorClear * (Math.abs(ridgeNoise) * 2.1 + (dist > 140 ? 22 : 0));
    } else if (mapDef.ambience === 'desert' || mapDef.ambience === 'forest') {
      baseH = -7.2 + corridorClear * (Math.abs(ridgeNoise) * 1.15);
    } else if (mapDef.ambience === 'beach') {
      baseH = -9.5 + corridorClear * (ridgeNoise * 0.45 + 3.5);
    }
    tPos.setY(i, baseH);
  }
  terrainGeo.computeVertexNormals();
  disposables.push(terrainGeo);

  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainPBR.map,
    normalMap: terrainPBR.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: terrainPBR.roughnessMap,
    roughness: 1.0,
    metalness: mapDef.ambience === 'rain' ? 0.2 : 0.04,
    emissive: mapDef.ambience === 'lava' ? '#9A3412' : '#000000',
    emissiveIntensity: mapDef.ambience === 'lava' ? 0.35 : 0,
  });
  disposables.push(terrainMat);
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // Shimmering Animated Water Ocean / Coastline
  const waterNormal = createWaterNormalMap(maxAnisotropy);
  disposables.push(waterNormal);
  let animatedWaterNormal: THREE.DataTexture | null = null;
  if (mapDef.ambience === 'beach' || mapDef.waterSections) {
    animatedWaterNormal = waterNormal;
    const oceanGeo = new THREE.PlaneGeometry(1800, 1800);
    const oceanMat = new THREE.MeshPhysicalMaterial({
      color: mapDef.ambience === 'beach' ? '#04749C' : '#0E4E68',
      roughness: 0.08,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      envMapIntensity: 1.6,
      transparent: true,
      opacity: 0.9,
    });
    disposables.push(oceanGeo, oceanMat);
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(75, -6.2, -65);
    ocean.receiveShadow = true;
    group.add(ocean);
  }

  // ==========================================================================
  // 3. ARCHITECTURAL FINISH GANTRY, CHECKPOINTS & STREETLIGHTS
  // ==========================================================================
  const startS = samples[0];
  const checkerTex = createCheckerTexture(maxAnisotropy);
  disposables.push(checkerTex);
  const finishStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(startS.width, 4.4),
    new THREE.MeshStandardMaterial({
      map: checkerTex,
      roughness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  finishStrip.rotation.x = -Math.PI / 2;
  const finishYaw = Math.atan2(startS.tangent.x, startS.tangent.z);
  finishStrip.rotation.z = -finishYaw;
  finishStrip.position.copy(startS.pos).add(new THREE.Vector3(0, 0.04, 0));
  finishStrip.receiveShadow = true;
  group.add(finishStrip);

  const gantryGroup = buildArchitecturalGantry(startS.width + 2.4, 7.8, mapDef.accentColor, true);
  gantryGroup.position.copy(startS.pos);
  gantryGroup.rotation.y = finishYaw;
  group.add(gantryGroup);

  const checkpoints: CheckpointGate[] = [];
  const cpCount = 10;
  for (let c = 1; c <= cpCount; c++) {
    const progress = c / (cpCount + 1);
    const idx = Math.floor(progress * sampleCount) % sampleCount;
    const s = samples[idx];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const gate = buildArchitecturalGantry(s.width + 1.8, 6.4, mapDef.curbColor, false);
    gate.position.copy(s.pos);
    gate.rotation.y = yaw;
    group.add(gate);
    checkpoints.push({
      index: c - 1,
      progress,
      position: s.pos.clone(),
      tangent: s.tangent.clone(),
      mesh: gate,
    });
  }

  // Streetlights along sidewalks (Instanced poles + LED luminaire heads)
  buildStreetlights(group, samples, mapDef, disposables);

  // Highway / Urban Tunnels on City & Rain maps
  if (mapDef.ambience === 'city' || mapDef.ambience === 'rain') {
    buildTunnelSection(group, samples, 18, 30, concreteMat, mapDef.accentColor, disposables);
  }

  // ==========================================================================
  // 4. SURFACE OVERLAYS (WATER / ICE)
  // ==========================================================================
  const waterPatchMat = new THREE.MeshPhysicalMaterial({
    color: '#087CA0',
    roughness: 0.06,
    metalness: 0.15,
    clearcoat: 1.0,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    transparent: true,
    opacity: 0.78,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const icePatchMat = new THREE.MeshPhysicalMaterial({
    color: '#DCEEFB',
    roughness: 0.06,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  disposables.push(waterPatchMat, icePatchMat);

  for (let i = 0; i < sampleCount; i += 3) {
    const s = samples[i];
    if (s.surface === 'water' || s.surface === 'ice') {
      const patch = new THREE.Mesh(
        new THREE.PlaneGeometry(s.width * 0.9, (totalLength / sampleCount) * 3.3),
        s.surface === 'water' ? waterPatchMat : icePatchMat
      );
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = -Math.atan2(s.tangent.x, s.tangent.z);
      patch.position.copy(s.pos).add(new THREE.Vector3(0, 0.05, 0));
      patch.receiveShadow = true;
      group.add(patch);
    }
  }

  // ==========================================================================
  // 5. BOOST PADS & ENGINEERED JUMP RAMPS
  // ==========================================================================
  const boostZones: BoostZone[] = [];
  const jumpRamps: JumpRamp[] = [];
  const boostTex = createBoostPadTexture(mapDef.accentColor, maxAnisotropy);
  const boostMat = new THREE.MeshStandardMaterial({
    map: boostTex,
    emissive: mapDef.accentColor,
    emissiveMap: boostTex,
    emissiveIntensity: 1.25,
    roughness: 0.2,
    metalness: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const rampSteelMat = new THREE.MeshStandardMaterial({
    color: '#2A313D',
    roughness: 0.38,
    metalness: 0.75,
  });
  const rampGlowMat = new THREE.MeshStandardMaterial({
    color: mapDef.accentColor,
    emissive: mapDef.accentColor,
    emissiveIntensity: 1.1,
    roughness: 0.2,
  });
  disposables.push(boostTex, boostMat, rampSteelMat, rampGlowMat);

  // Wedge ramp ExtrudeGeometry
  const wedgeShape = new THREE.Shape();
  wedgeShape.moveTo(-3.2, 0);
  wedgeShape.lineTo(3.2, 0);
  wedgeShape.lineTo(3.2, 1.45);
  wedgeShape.lineTo(2.7, 1.45);
  wedgeShape.quadraticCurveTo(0, 0.6, -3.2, 0.06);
  wedgeShape.closePath();
  const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, {
    depth: 4.4,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  wedgeGeo.rotateY(Math.PI / 2);
  wedgeGeo.translate(-2.2, 0, 0);
  disposables.push(wedgeGeo);

  for (let i = 15; i < sampleCount - 10; i += 24) {
    const s = samples[i];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const latOffset = (Math.floor(i / 24) % 2 === 0 ? -1 : 1) * (s.width * 0.18);
    const center = s.pos.clone().addScaledVector(s.right, latOffset);

    if (Math.floor(i / 24) % 2 === 0) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7.6), boostMat);
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = -yaw;
      pad.position.copy(center).add(new THREE.Vector3(0, 0.05, 0));
      group.add(pad);
      boostZones.push({ center, radius: 3.9, tangent: s.tangent.clone() });
    } else {
      const rampGroup = new THREE.Group();
      const rampMesh = new THREE.Mesh(wedgeGeo, rampSteelMat);
      rampMesh.castShadow = true;
      rampMesh.receiveShadow = true;
      const lipGlow = new THREE.Mesh(new THREE.BoxGeometry(4.45, 0.12, 0.25), rampGlowMat);
      lipGlow.position.set(0, 1.45, 3.1);
      rampGroup.add(rampMesh, lipGlow);
      rampGroup.position.copy(center);
      rampGroup.rotation.y = yaw;
      group.add(rampGroup);
      jumpRamps.push({
        center: center.clone(),
        tangent: s.tangent.clone(),
        width: 4.6,
        length: 6.4,
        height: 1.8,
      });
    }
  }

  // ==========================================================================
  // 6. GRIND RAILS & ILLUMINATED WALL-RUN BILLBOARDS
  // ==========================================================================
  const grindRails: GrindRail[] = [];
  const railMat = new THREE.MeshStandardMaterial({
    color: '#D8E0EB',
    roughness: 0.18,
    metalness: 0.92,
  });
  const railGlowMat = new THREE.MeshStandardMaterial({
    color: mapDef.accentColor,
    emissive: mapDef.accentColor,
    emissiveIntensity: 0.7,
    roughness: 0.2,
  });
  disposables.push(railMat, railGlowMat);

  [38, 118, 188].forEach((startIdx, rIdx) => {
    const railPts: THREE.Vector3[] = [];
    const side = rIdx % 2 === 0 ? 1 : -1;
    for (let k = 0; k <= 12; k++) {
      const s = samples[(startIdx + k) % sampleCount];
      railPts.push(s.pos.clone().addScaledVector(s.right, side * (s.width * 0.34)).add(new THREE.Vector3(0, 1.55, 0)));
    }
    const rCurve = new THREE.CatmullRomCurve3(railPts);
    const rGeo = new THREE.TubeGeometry(rCurve, 32, 0.14, 12, false);
    disposables.push(rGeo);
    const rMesh = new THREE.Mesh(rGeo, railMat);
    rMesh.castShadow = true;
    group.add(rMesh);

    // Support stanchions under rail
    for (let st = 0; st <= 4; st++) {
      const pt = rCurve.getPointAt(st / 4);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.55, 8), railGlowMat);
      post.position.set(pt.x, pt.y - 0.78, pt.z);
      group.add(post);
    }

    const sampledPts: THREE.Vector3[] = [];
    const sampledTans: THREE.Vector3[] = [];
    for (let p = 0; p <= 24; p++) {
      sampledPts.push(rCurve.getPointAt(p / 24));
      sampledTans.push(rCurve.getTangentAt(p / 24).normalize());
    }
    grindRails.push({ curve: rCurve, points: sampledPts, tangents: sampledTans });
  });

  // Wall-Run Architectural Billboards
  const wallPanels: WallRunPanel[] = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1E242E', roughness: 0.4, metalness: 0.8 });
  const panelFaceMat = new THREE.MeshStandardMaterial({
    color: '#0F172A',
    emissive: mapDef.accentColor,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.5,
  });
  disposables.push(frameMat, panelFaceMat);

  [56, 100, 156, 214].forEach((idx, wIdx) => {
    const s = samples[idx % sampleCount];
    const side = wIdx % 2 === 0 ? -1 : 1;
    const panelCenter = s.pos
      .clone()
      .addScaledVector(s.right, side * (s.width * 0.51))
      .add(new THREE.Vector3(0, 2.7, 0));

    const panelGrp = new THREE.Group();
    const backing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.5, 18.4), frameMat);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.8, 17.6), panelFaceMat);
    const topStrip = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.18, 18.2), rampGlowMat);
    topStrip.position.y = 2.15;
    panelGrp.add(backing, face, topStrip);
    panelGrp.position.copy(panelCenter);
    panelGrp.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    backing.castShadow = true;
    group.add(panelGrp);

    wallPanels.push({
      center: panelCenter,
      normal: s.right.clone().multiplyScalar(-side),
      tangent: s.tangent.clone(),
      length: 18,
      height: 4.4,
    });
  });

  // ==========================================================================
  // 7. ENGINEERED TRACK BARRIERS / OBSTACLES
  // ==========================================================================
  const obstacles: TrackObstacle[] = [];
  const obsCount = modeId === 'obstacle-rush' ? 14 : 7;
  const obsFrameMat = new THREE.MeshStandardMaterial({ color: '#272D38', roughness: 0.35, metalness: 0.78 });
  const obsWarnMat = new THREE.MeshStandardMaterial({
    color: '#DC2626',
    emissive: '#EF4444',
    emissiveIntensity: 0.65,
    roughness: 0.28,
  });
  disposables.push(obsFrameMat, obsWarnMat);

  for (let o = 0; o < obsCount; o++) {
    const idx = Math.floor(((o + 1) / (obsCount + 1)) * (sampleCount - 16)) + 10;
    const s = samples[idx % sampleCount];
    const slideUnder = o % 3 === 1;
    const width = slideUnder ? 6.6 : 3.8;
    const height = slideUnder ? 1.45 : 1.15;
    const yOffset = slideUnder ? 1.9 : 0.6;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.85), obsFrameMat);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.24, 0.9), obsWarnMat);
    mesh.add(bar);
    const basePos = s.pos.clone().add(new THREE.Vector3(0, yOffset, 0));
    mesh.position.copy(basePos);
    mesh.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    mesh.castShadow = true;
    group.add(mesh);

    obstacles.push({
      mesh,
      basePos,
      rightVec: s.right.clone(),
      halfWidth: width * 0.5,
      height,
      slideUnder,
      oscillateAmp: slideUnder ? 0 : s.width * 0.24,
      oscillateSpeed: 1.5 + (o % 3) * 0.45,
      phase: o * 1.1,
    });
  }

  // ==========================================================================
  // 8. COLLECTIBLES (ENERGY STARS & TURBO CORES)
  // ==========================================================================
  const collectibles: CollectibleItem[] = [];
  const starGeo = new THREE.OctahedronGeometry(0.48, 0);
  const starMat = new THREE.MeshPhysicalMaterial({
    color: '#FACC15',
    emissive: '#F59E0B',
    emissiveIntensity: 0.9,
    roughness: 0.14,
    metalness: 0.9,
    clearcoat: 1.0,
  });
  const orbGeo = new THREE.SphereGeometry(0.42, 16, 14);
  const orbMat = new THREE.MeshPhysicalMaterial({
    color: '#22D3EE',
    emissive: '#06B6D4',
    emissiveIntensity: 1.05,
    roughness: 0.1,
    metalness: 0.7,
    clearcoat: 1.0,
  });
  disposables.push(starGeo, starMat, orbGeo, orbMat);

  const collectibleStep = modeId === 'star-collector' ? 5 : 9;
  let cId = 0;
  for (let i = 8; i < sampleCount - 6; i += collectibleStep) {
    const s = samples[i];
    const kind: 'star' | 'turbo' = i % 2 === 0 ? 'star' : 'turbo';
    const lat = Math.sin(i * 0.4) * (s.width * 0.26);
    const pos = s.pos.clone().addScaledVector(s.right, lat).add(new THREE.Vector3(0, 1.25, 0));
    const mesh = new THREE.Mesh(kind === 'star' ? starGeo : orbGeo, kind === 'star' ? starMat : orbMat);
    mesh.position.copy(pos);
    group.add(mesh);
    collectibles.push({
      id: cId++,
      mesh,
      pos,
      kind,
      collected: false,
      respawnTimer: 0,
    });
  }

  // ==========================================================================
  // 9. COMPOSITE MULTI-PART WORLD ARCHITECTURE & NATURAL VEGETATION
  // ==========================================================================
  const animatedProps: THREE.Object3D[] = [];
  const propCount = quality === 'low' ? 42 : quality === 'medium' ? 76 : quality === 'high' ? 110 : 140;
  buildRealisticWorldScenery(group, mapDef, samples, propCount, maxAnisotropy, animatedProps, disposables);

  // ==========================================================================
  // 10. ATMOSPHERIC WEATHER PARTICLES (CAMERA-LOCALIZED WIND STREAKS)
  // ==========================================================================
  let weatherPoints: THREE.Points | null = null;
  let weatherVelocities: Float32Array | null = null;
  if (mapDef.weather !== 'clear') {
    const pCount = quality === 'low' ? 350 : quality === 'medium' ? 700 : 1200;
    const pPos = new Float32Array(pCount * 3);
    weatherVelocities = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 140;
      pPos[i * 3 + 1] = Math.random() * 55;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 140;

      if (mapDef.weather === 'rain') {
        weatherVelocities[i * 3] = -5.5;
        weatherVelocities[i * 3 + 1] = -36 - Math.random() * 10;
        weatherVelocities[i * 3 + 2] = -2.5;
      } else if (mapDef.weather === 'snow') {
        weatherVelocities[i * 3] = (Math.random() - 0.5) * 4;
        weatherVelocities[i * 3 + 1] = -4.5 - Math.random() * 2.5;
        weatherVelocities[i * 3 + 2] = (Math.random() - 0.5) * 4;
      } else if (mapDef.weather === 'embers') {
        weatherVelocities[i * 3] = (Math.random() - 0.5) * 3;
        weatherVelocities[i * 3 + 1] = 4.5 + Math.random() * 4;
        weatherVelocities[i * 3 + 2] = (Math.random() - 0.5) * 3;
      } else if (mapDef.weather === 'sandstorm') {
        weatherVelocities[i * 3] = 22 + Math.random() * 8;
        weatherVelocities[i * 3 + 1] = (Math.random() - 0.5) * 2;
        weatherVelocities[i * 3 + 2] = 6;
      } else {
        weatherVelocities[i * 3] = 0;
        weatherVelocities[i * 3 + 1] = -0.3;
        weatherVelocities[i * 3 + 2] = 0;
      }
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pColor =
      mapDef.weather === 'embers'
        ? '#FB923C'
        : mapDef.weather === 'sandstorm'
        ? '#E7C896'
        : mapDef.weather === 'snow'
        ? '#F1F5F9'
        : mapDef.weather === 'rain'
        ? '#93C5FD'
        : '#E0E7FF';
    const pMat = new THREE.PointsMaterial({
      color: pColor,
      size: mapDef.weather === 'rain' ? 0.24 : mapDef.weather === 'starfield' ? 0.55 : 0.36,
      transparent: true,
      opacity: mapDef.weather === 'rain' ? 0.58 : 0.72,
      depthWrite: false,
    });
    disposables.push(pGeo, pMat);
    weatherPoints = new THREE.Points(pGeo, pMat);
    weatherPoints.frustumCulled = false;
    group.add(weatherPoints);
  }

  const updateAtmosphere = (dt: number, focusPos: THREE.Vector3) => {
    if (animatedWaterNormal) {
      animatedWaterNormal.offset.x = (animatedWaterNormal.offset.x + dt * 0.035) % 1;
      animatedWaterNormal.offset.y = (animatedWaterNormal.offset.y + dt * 0.022) % 1;
    }

    if (weatherPoints && weatherVelocities) {
      const posAttr = weatherPoints.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const halfBox = 70;
      const minY = focusPos.y - 6;
      const maxY = focusPos.y + 46;

      for (let i = 0; i < posAttr.count; i++) {
        const ix = i * 3;
        arr[ix] += weatherVelocities[ix] * dt;
        arr[ix + 1] += weatherVelocities[ix + 1] * dt;
        arr[ix + 2] += weatherVelocities[ix + 2] * dt;

        // Wrap around player camera volume so weather stays dense everywhere on the circuit
        if (arr[ix] < focusPos.x - halfBox) arr[ix] += halfBox * 2;
        if (arr[ix] > focusPos.x + halfBox) arr[ix] -= halfBox * 2;
        if (arr[ix + 2] < focusPos.z - halfBox) arr[ix + 2] += halfBox * 2;
        if (arr[ix + 2] > focusPos.z + halfBox) arr[ix + 2] -= halfBox * 2;
        if (arr[ix + 1] < minY) arr[ix + 1] = maxY - Math.random() * 5;
        if (arr[ix + 1] > maxY) arr[ix + 1] = minY + Math.random() * 5;
      }
      posAttr.needsUpdate = true;
    }
  };

  return {
    group,
    curve,
    samples,
    checkpoints,
    boostZones,
    jumpRamps,
    grindRails,
    wallPanels,
    obstacles,
    collectibles,
    weatherPoints,
    animatedProps,
    totalLength,
    updateAtmosphere,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

function buildArchitecturalGantry(width: number, height: number, colorHex: string, isFinish: boolean): THREE.Group {
  const gate = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#1E242E',
    roughness: 0.34,
    metalness: 0.85,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: '#0B111C',
    roughness: 0.4,
    metalness: 0.6,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: isFinish ? 1.45 : 0.9,
    roughness: 0.15,
  });

  // Tapered steel gantry stanchions + concrete footings
  [-width * 0.5, width * 0.5].forEach((px) => {
    const footing = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 1.1, 12), steelMat);
    footing.position.set(px, 0.55, 0);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, height, 12), steelMat);
    column.position.set(px, height * 0.5, 0);
    column.castShadow = true;
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.35, 12), ledMat);
    beacon.position.set(px, height - 0.3, 0);
    gate.add(footing, column, beacon);
  });

  // Overhead truss girder + illuminated signboard
  const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, 0.45, 0.7), steelMat);
  crossBeam.position.set(0, height + 0.1, 0);
  crossBeam.castShadow = true;

  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, isFinish ? 1.35 : 0.75, 0.42), bannerMat);
  signBoard.position.set(0, height - 0.5, 0);

  const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.14, 0.48), ledMat);
  ledStrip.position.set(0, height - (isFinish ? 1.12 : 0.82), 0);

  gate.add(crossBeam, signBoard, ledStrip);
  return gate;
}

function buildStreetlights(
  group: THREE.Group,
  samples: BuiltMap['samples'],
  mapDef: MapDef,
  disposables: { dispose: () => void }[]
): void {
  const showLights = ['city', 'rain', 'stadium', 'beach', 'candy', 'factory'].includes(mapDef.ambience);
  if (!showLights) return;

  const step = 12;
  const count = Math.floor(samples.length / step);
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 6.8, 10);
  const armGeo = new THREE.BoxGeometry(1.8, 0.1, 0.12);
  const lampGeo = new THREE.BoxGeometry(0.65, 0.08, 0.32);

  const poleMat = new THREE.MeshStandardMaterial({ color: '#333C4A', roughness: 0.35, metalness: 0.85 });
  const lampColor = mapDef.ambience === 'city' || mapDef.ambience === 'rain' ? '#BAE6FD' : '#FEF3C7';
  const lampMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    emissive: lampColor,
    emissiveIntensity: mapDef.ambience === 'rain' || mapDef.ambience === 'city' ? 2.4 : 1.3,
    roughness: 0.1,
  });

  disposables.push(poleGeo, armGeo, lampGeo, poleMat, lampMat);

  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, count);
  const armInst = new THREE.InstancedMesh(armGeo, poleMat, count);
  const lampInst = new THREE.InstancedMesh(lampGeo, lampMat, count);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const s = samples[i * step];
    const side = i % 2 === 0 ? 1 : -1;
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const offset = s.width * 0.5 + 1.45;
    const px = s.pos.x + s.right.x * side * offset;
    const pz = s.pos.z + s.right.z * side * offset;

    dummy.position.set(px, s.pos.y + 3.4, pz);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    // Arm extends inward toward carriageway
    const armX = px - s.right.x * side * 0.85;
    const armZ = pz - s.right.z * side * 0.85;
    dummy.position.set(armX, s.pos.y + 6.75, armZ);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    armInst.setMatrixAt(i, dummy.matrix);

    const lampX = px - s.right.x * side * 1.55;
    const lampZ = pz - s.right.z * side * 1.55;
    dummy.position.set(lampX, s.pos.y + 6.68, lampZ);
    dummy.updateMatrix();
    lampInst.setMatrixAt(i, dummy.matrix);
  }

  [poleInst, armInst, lampInst].forEach((inst) => {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  });
}

function buildTunnelSection(
  group: THREE.Group,
  samples: BuiltMap['samples'],
  startIdx: number,
  endIdx: number,
  concreteMat: THREE.Material,
  accentColor: string,
  disposables: { dispose: () => void }[]
): void {
  const stripMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    emissive: accentColor,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  disposables.push(stripMat);

  for (let i = startIdx; i < endIdx; i += 2) {
    const s = samples[i % samples.length];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(s.width * 0.56, 0.65, 8, 20, Math.PI),
      concreteMat
    );
    arch.position.copy(s.pos);
    arch.rotation.y = yaw;
    arch.castShadow = true;
    arch.receiveShadow = true;

    const ceilingLight = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.35), stripMat);
    ceilingLight.position.set(0, s.width * 0.52, 0);
    arch.add(ceilingLight);
    group.add(arch);
  }
}

function buildRealisticWorldScenery(
  group: THREE.Group,
  mapDef: MapDef,
  samples: BuiltMap['samples'],
  count: number,
  maxAnisotropy: number,
  animatedProps: THREE.Object3D[],
  disposables: { dispose: () => void }[]
): void {
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();

  if (mapDef.ambience === 'city' || mapDef.ambience === 'rain' || mapDef.ambience === 'stadium' || mapDef.ambience === 'candy') {
    // Multi-part Realistic High-Rise Urban Skyline (Podium + Glazed Curtain Tower + Rooftop Penthouse + Spire)
    const facade = createBuildingFacadePBR(mapDef.ambience, maxAnisotropy);
    disposables.push(facade);

    const towerMat = new THREE.MeshStandardMaterial({
      map: facade.map,
      normalMap: facade.normalMap,
      roughnessMap: facade.roughnessMap,
      emissiveMap: facade.emissiveMap,
      emissive: '#FFFFFF',
      emissiveIntensity: mapDef.ambience === 'city' || mapDef.ambience === 'rain' ? 1.05 : 0.45,
      roughness: 0.9,
      metalness: 0.35,
      envMapIntensity: 1.3,
    });
    const podiumMat = new THREE.MeshStandardMaterial({
      color: '#252B36',
      roughness: 0.72,
      metalness: 0.25,
    });
    const penthouseMat = new THREE.MeshStandardMaterial({
      color: '#1A202C',
      roughness: 0.4,
      metalness: 0.7,
    });

    const podiumGeo = new THREE.BoxGeometry(1, 1, 1);
    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    const crownGeo = new THREE.BoxGeometry(0.65, 1, 0.65);
    const spireGeo = new THREE.CylinderGeometry(0.06, 0.2, 1, 8);
    disposables.push(towerMat, podiumMat, penthouseMat, podiumGeo, towerGeo, crownGeo, spireGeo);

    const podiumInst = new THREE.InstancedMesh(podiumGeo, podiumMat, count);
    const towerInst = new THREE.InstancedMesh(towerGeo, towerMat, count);
    const crownInst = new THREE.InstancedMesh(crownGeo, penthouseMat, count);
    const spireInst = new THREE.InstancedMesh(spireGeo, penthouseMat, count);

    for (let i = 0; i < count; i++) {
      const s = samples[(i * 2) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const layer = Math.floor(i / 24);
      const dist = s.width * 0.95 + 18 + (i % 6) * 14 + layer * 24;
      const px = s.pos.x + s.right.x * side * dist + (hashSeed(i * 3) - 0.5) * 14;
      const pz = s.pos.z + s.right.z * side * dist + (hashSeed(i * 5) - 0.5) * 14;

      const bw = 11 + hashSeed(i + 11) * 13;
      const bd = 11 + hashSeed(i + 23) * 13;
      const bh = (mapDef.ambience === 'stadium' ? 18 : 26) + hashSeed(i + 37) * 58;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const groundY = -8;

      // Podium base
      const podH = 6.5;
      dummy.position.set(px, groundY + podH * 0.5, pz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(bw * 1.18, podH, bd * 1.18);
      dummy.updateMatrix();
      podiumInst.setMatrixAt(i, dummy.matrix);

      // Curtain-wall tower
      dummy.position.set(px, groundY + podH + bh * 0.5, pz);
      dummy.scale.set(bw, bh, bd);
      dummy.updateMatrix();
      towerInst.setMatrixAt(i, dummy.matrix);

      // Rooftop mechanical crown
      const crH = 3.5;
      dummy.position.set(px, groundY + podH + bh + crH * 0.5, pz);
      dummy.scale.set(bw, crH, bd);
      dummy.updateMatrix();
      crownInst.setMatrixAt(i, dummy.matrix);

      // Telecom spire on taller skyscrapers
      const spH = i % 3 === 0 ? 11 : 0.1;
      dummy.position.set(px, groundY + podH + bh + crH + spH * 0.5, pz);
      dummy.scale.set(1, spH, 1);
      dummy.updateMatrix();
      spireInst.setMatrixAt(i, dummy.matrix);

      c.set('#CBD5E1').offsetHSL((hashSeed(i) - 0.5) * 0.08, 0.05, (hashSeed(i + 9) - 0.5) * 0.15);
      towerInst.setColorAt(i, c);
    }

    [podiumInst, towerInst, crownInst, spireInst].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = true;
      inst.receiveShadow = true;
      group.add(inst);
    });
  } else if (mapDef.ambience === 'beach') {
    // Realistic Multi-Part Coconut Palm Trees (curved segmented trunk + frond crown)
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.44, 10, 10);
    trunkGeo.translate(0, 5, 0);
    const frondGeo = new THREE.ConeGeometry(3.2, 2.2, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#6D4C3D', roughness: 0.9 });
    const frondMat = new THREE.MeshStandardMaterial({ color: '#1E6B3A', roughness: 0.65 });
    disposables.push(trunkGeo, frondGeo, trunkMat, frondMat);

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crownInst = new THREE.InstancedMesh(frondGeo, frondMat, count);
    const frondInst2 = new THREE.InstancedMesh(frondGeo, frondMat, count);

    for (let i = 0; i < count; i++) {
      const s = samples[(i * 2) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width * 0.9 + 12 + (i % 5) * 14;
      const px = s.pos.x + s.right.x * side * dist;
      const pz = s.pos.z + s.right.z * side * dist;
      const scale = 0.8 + hashSeed(i) * 0.55;
      const lean = (hashSeed(i + 7) - 0.5) * 0.25;
      const baseY = -6.8;

      dummy.position.set(px, baseY, pz);
      dummy.rotation.set(lean, hashSeed(i + 2) * Math.PI * 2, lean * 0.6);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      const topX = px + Math.sin(lean * 0.6) * 9.5 * scale;
      const topZ = pz + Math.sin(lean) * 9.5 * scale;
      dummy.position.set(topX, baseY + 9.6 * scale, topZ);
      dummy.scale.set(scale * 1.25, scale * 0.55, scale * 1.25);
      dummy.updateMatrix();
      crownInst.setMatrixAt(i, dummy.matrix);

      dummy.rotation.y += 0.5;
      dummy.scale.set(scale * 0.95, scale * 0.7, scale * 0.95);
      dummy.position.y += 0.6 * scale;
      dummy.updateMatrix();
      frondInst2.setMatrixAt(i, dummy.matrix);

      c.set('#227841').offsetHSL(0, 0, (hashSeed(i + 15) - 0.5) * 0.12);
      crownInst.setColorAt(i, c);
      frondInst2.setColorAt(i, c);
    }

    [trunkInst, crownInst, frondInst2].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = true;
      group.add(inst);
    });
  } else if (mapDef.ambience === 'forest' || mapDef.ambience === 'snow') {
    // Multi-tier Conifer / Redwood Trees (bark trunk + 3 stacked natural foliage tiers)
    const isSnow = mapDef.ambience === 'snow';
    const trunkGeo = new THREE.CylinderGeometry(0.45, 0.78, 12, 10);
    trunkGeo.translate(0, 6, 0);
    const tierGeo = new THREE.ConeGeometry(3.8, 6.2, 10);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#4A3222', roughness: 0.92 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: isSnow ? '#2D4F44' : '#1B4D2E',
      roughness: 0.78,
    });
    disposables.push(trunkGeo, tierGeo, trunkMat, leafMat);

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const t1Inst = new THREE.InstancedMesh(tierGeo, leafMat, count);
    const t2Inst = new THREE.InstancedMesh(tierGeo, leafMat, count);
    const t3Inst = new THREE.InstancedMesh(tierGeo, leafMat, count);

    for (let i = 0; i < count; i++) {
      const s = samples[(i * 2) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width * 0.95 + 14 + (i % 6) * 14;
      const px = s.pos.x + s.right.x * side * dist;
      const pz = s.pos.z + s.right.z * side * dist;
      const scale = 0.85 + hashSeed(i) * 0.75;
      const baseY = -7.5;

      dummy.position.set(px, baseY, pz);
      dummy.rotation.set(0, hashSeed(i + 4) * Math.PI * 2, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, baseY + 8.5 * scale, pz);
      dummy.scale.set(scale * 1.1, scale, scale * 1.1);
      dummy.updateMatrix();
      t1Inst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, baseY + 11.8 * scale, pz);
      dummy.scale.set(scale * 0.85, scale * 0.9, scale * 0.85);
      dummy.updateMatrix();
      t2Inst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, baseY + 14.8 * scale, pz);
      dummy.scale.set(scale * 0.6, scale * 0.8, scale * 0.6);
      dummy.updateMatrix();
      t3Inst.setMatrixAt(i, dummy.matrix);

      c.set(isSnow ? '#355A4F' : '#1E5434').offsetHSL(0, 0, (hashSeed(i + 9) - 0.5) * 0.14);
      t1Inst.setColorAt(i, c);
      t2Inst.setColorAt(i, c);
      t3Inst.setColorAt(i, isSnow ? c.clone().lerp(new THREE.Color('#E2E8F0'), 0.45) : c);
    }

    [trunkInst, t1Inst, t2Inst, t3Inst].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = true;
      group.add(inst);
    });
  } else if (mapDef.ambience === 'desert') {
    // Monumental Sandstone Pyramids & Carved Obelisks
    const pyrGeo = new THREE.ConeGeometry(16, 24, 4);
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#C8A16E', roughness: 0.86, metalness: 0.04 });
    disposables.push(pyrGeo, stoneMat);
    const inst = new THREE.InstancedMesh(pyrGeo, stoneMat, Math.min(count, 44));
    for (let i = 0; i < Math.min(count, 44); i++) {
      const s = samples[(i * 5) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width + 28 + (i % 4) * 26;
      const sc = 0.8 + hashSeed(i) * 1.4;
      dummy.position.set(s.pos.x + s.right.x * side * dist, -8 + 11 * sc, s.pos.z + s.right.z * side * dist);
      dummy.rotation.set(0, Math.PI * 0.25 + (i % 3) * 0.1, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    group.add(inst);
  } else if (mapDef.ambience === 'lava') {
    // Jagged Volcanic Basalt Spires & Glowing Magma Cracks
    const rockGeo = new THREE.DodecahedronGeometry(6.5, 1);
    const basaltMat = new THREE.MeshStandardMaterial({
      color: '#231F20',
      emissive: '#9A3412',
      emissiveIntensity: 0.18,
      roughness: 0.88,
    });
    disposables.push(rockGeo, basaltMat);
    const inst = new THREE.InstancedMesh(rockGeo, basaltMat, count);
    for (let i = 0; i < count; i++) {
      const s = samples[(i * 2) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width + 16 + (i % 5) * 18;
      const sc = 0.9 + hashSeed(i) * 1.7;
      dummy.position.set(s.pos.x + s.right.x * side * dist, -6 + sc * 3, s.pos.z + s.right.z * side * dist);
      dummy.rotation.set(hashSeed(i + 2), hashSeed(i + 3), hashSeed(i + 4));
      dummy.scale.set(sc, sc * 2.2, sc);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    group.add(inst);
  } else if (mapDef.ambience === 'factory') {
    // Heavy Industrial Silos + Steel Trusses + Turbines
    const siloGeo = new THREE.CylinderGeometry(4.5, 4.5, 22, 18);
    const tankMat = new THREE.MeshStandardMaterial({ color: '#3F444E', roughness: 0.42, metalness: 0.78 });
    disposables.push(siloGeo, tankMat);
    const inst = new THREE.InstancedMesh(siloGeo, tankMat, count);
    for (let i = 0; i < count; i++) {
      const s = samples[(i * 3) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width + 16 + (i % 5) * 14;
      const h = 0.8 + hashSeed(i) * 1.1;
      dummy.position.set(s.pos.x + s.right.x * side * dist, -8 + 11 * h, s.pos.z + s.right.z * side * dist);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    group.add(inst);

    for (let g = 0; g < 3; g++) {
      const gear = new THREE.Mesh(
        new THREE.TorusGeometry(9, 1.3, 12, 24),
        new THREE.MeshStandardMaterial({ color: '#B45309', metalness: 0.85, roughness: 0.28 })
      );
      gear.position.set(55 + g * 45, 16, -90 - g * 30);
      group.add(gear);
      animatedProps.push(gear);
    }
  } else {
    // Space / Sky: Orbital Solar Array Stations & Cloud-Skimming Titanium Pylons
    const arrayGeo = new THREE.BoxGeometry(8, 0.25, 14);
    const arrayMat = new THREE.MeshStandardMaterial({ color: '#1E3A8A', roughness: 0.22, metalness: 0.85 });
    disposables.push(arrayGeo, arrayMat);
    const inst = new THREE.InstancedMesh(arrayGeo, arrayMat, count);
    for (let i = 0; i < count; i++) {
      const s = samples[(i * 2) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width + 18 + (i % 5) * 16;
      dummy.position.set(
        s.pos.x + s.right.x * side * dist,
        s.pos.y + ((i % 5) - 2) * 6,
        s.pos.z + s.right.z * side * dist
      );
      dummy.rotation.set(0.3, Math.atan2(s.tangent.x, s.tangent.z), 0.2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);

    if (mapDef.ambience === 'space') {
      const planet = new THREE.Mesh(
        new THREE.SphereGeometry(32, 32, 24),
        new THREE.MeshStandardMaterial({ color: '#3730A3', roughness: 0.65, metalness: 0.1 })
      );
      planet.position.set(95, 58, -260);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(42, 62, 64),
        new THREE.MeshStandardMaterial({
          color: '#7DD3FC',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.45,
          roughness: 0.5,
        })
      );
      ring.rotation.x = Math.PI * 0.38;
      planet.add(ring);
      group.add(planet);
      animatedProps.push(planet);
    }
  }
}

export class TrackSampler {
  private readonly samples: BuiltMap['samples'];
  private readonly count: number;
  private readonly tmp = new THREE.Vector3();

  constructor(builtMap: BuiltMap) {
    this.samples = builtMap.samples;
    this.count = builtMap.samples.length;
  }

  public sampleClosest(pos: THREE.Vector3, hintProgress?: number): TrackSample {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintProgress !== undefined) {
      const centerIdx = Math.floor(((hintProgress % 1 + 1) % 1) * this.count);
      for (let offset = -24; offset <= 24; offset++) {
        const idx = (centerIdx + offset + this.count) % this.count;
        const dSq = this.samples[idx].pos.distanceToSquared(pos);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
      if (bestDistSq < 550) {
        return this.buildSampleResult(bestIdx, pos, bestDistSq);
      }
    }

    for (let i = 0; i < this.count; i++) {
      const dSq = this.samples[i].pos.distanceToSquared(pos);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
    return this.buildSampleResult(bestIdx, pos, bestDistSq);
  }

  private buildSampleResult(idx: number, pos: THREE.Vector3, distSq: number): TrackSample {
    const s = this.samples[idx];
    this.tmp.copy(pos).sub(s.pos);
    const lateralOffset = this.tmp.dot(s.right);
    return {
      progress: idx / this.count,
      point: s.pos,
      tangent: s.tangent,
      right: s.right,
      lateralOffset,
      halfWidth: s.width * 0.5,
      surface: s.surface,
      distSq,
    };
  }

  public getSpawnTransform(slotIndex: number, totalRacers: number): { pos: THREE.Vector3; yaw: number } {
    const s = this.samples[0];
    const row = Math.floor(slotIndex / 3);
    const col = (slotIndex % 3) - 1;
    const lateral = col * 2.8;
    const back = -2.5 - row * 2.8;
    const pos = s.pos
      .clone()
      .addScaledVector(s.right, lateral)
      .addScaledVector(s.tangent, back);
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    if (totalRacers <= 2) {
      pos.copy(s.pos).addScaledVector(s.right, slotIndex === 0 ? -2.2 : 2.2).addScaledVector(s.tangent, -2);
    }
    return { pos, yaw };
  }
}

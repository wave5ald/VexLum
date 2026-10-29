import * as THREE from 'three';
import { LightState, PrimitiveType, SceneSettings } from './types';

let seed = 1337;
function random(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

export function createConcreteTexture(isWall = false): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isWall ? '#3a3d42' : '#35373b';
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 26000; i++) {
    const x = random() * 1024;
    const y = random() * 1024;
    const gray = Math.floor(random() * 55 + 40);
    ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray}, ${(random() * 0.2 + 0.04).toFixed(3)})`;
    ctx.fillRect(x, y, random() * 3 + 1, random() * 3 + 1);
  }

  // Soft cloudy patches for cast-concrete variation.
  for (let i = 0; i < 40; i++) {
    const x = random() * 1024;
    const y = random() * 1024;
    const r = random() * 180 + 40;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = random() > 0.5;
    gradient.addColorStop(0, light ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  ctx.strokeStyle = 'rgba(12, 13, 16, 0.42)';
  ctx.lineWidth = 3;

  if (isWall) {
    for (let x = 256; x < 1024; x += 256) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1024);
      ctx.stroke();
      for (let y = 128; y < 1024; y += 256) {
        ctx.fillStyle = '#17191d';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180, 190, 200, 0.18)';
        ctx.stroke();
        ctx.strokeStyle = 'rgba(12, 13, 16, 0.42)';
      }
    }
  } else {
    for (let p = 256; p < 1024; p += 256) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 1024);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(1024, p);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(isWall ? 5 : 12, isWall ? 3 : 12);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

interface MannequinBuild {
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
}

export function buildMannequin(color: string, isWhite: boolean): MannequinBuild {
  const group = new THREE.Group();
  group.name = 'Mannequin';

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: isWhite ? 0.3 : 0.42,
    metalness: 0.1,
    envMapIntensity: 1
  });

  const add = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const headGeom = new THREE.SphereGeometry(0.12, 32, 24);
  headGeom.scale(0.85, 1.25, 1.0);
  const head = add(new THREE.Mesh(headGeom, material));
  head.position.y = 1.7;

  add(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.1, 20), material)).position.y = 1.56;

  const chestGeom = new THREE.CylinderGeometry(0.185, 0.145, 0.32, 24);
  chestGeom.scale(1.15, 1, 0.75);
  const chest = add(new THREE.Mesh(chestGeom, material));
  chest.position.y = 1.35;

  const absGeom = new THREE.CylinderGeometry(0.14, 0.155, 0.22, 20);
  absGeom.scale(1.05, 1, 0.72);
  const abs = add(new THREE.Mesh(absGeom, material));
  abs.position.y = 1.1;

  const pelvisGeom = new THREE.CylinderGeometry(0.158, 0.142, 0.16, 20);
  pelvisGeom.scale(1.08, 1, 0.78);
  const pelvis = add(new THREE.Mesh(pelvisGeom, material));
  pelvis.position.y = 0.94;

  [-1, 1].forEach((side) => {
    const shoulder = add(new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 16), material));
    shoulder.position.set(side * 0.23, 1.45, 0);
    const upperArm = add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.28, 16), material));
    upperArm.position.set(side * 0.25, 1.28, 0);
    const elbow = add(new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 16), material));
    elbow.position.set(side * 0.26, 1.12, 0);
    const forearm = add(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.26, 16), material));
    forearm.position.set(side * 0.27, 0.96, 0);
    const hand = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.05), material));
    hand.position.set(side * 0.27, 0.79, 0);
  });

  [-1, 1].forEach((side) => {
    const hip = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), material));
    hip.position.set(side * 0.1, 0.86, 0);
    const thigh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.052, 0.42, 16), material));
    thigh.position.set(side * 0.105, 0.64, 0);
    const knee = add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), material));
    knee.position.set(side * 0.105, 0.42, 0);
    const shin = add(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.038, 0.38, 16), material));
    shin.position.set(side * 0.105, 0.22, 0);
    const foot = add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.18), material));
    foot.position.set(side * 0.105, 0.025, 0.04);
  });

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x141619,
    roughness: 0.5,
    metalness: 0.25
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.03, 48), baseMaterial);
  base.position.y = 0.015;
  base.receiveShadow = true;
  base.castShadow = false;
  base.userData.skipTint = true;
  group.add(base);

  return { group, material };
}

function shadeColor(hex: string, amount: number): THREE.Color {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return color;
}

export function buildPrimitive(
  type: PrimitiveType,
  size: number,
  color: string
): THREE.Object3D {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.38,
    metalness: 0.18
  });

  const finish = (object: THREE.Object3D) => {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return object;
  };

  switch (type) {
    case 'sphere':
      return finish(new THREE.Mesh(new THREE.SphereGeometry(0.6 * size, 48, 32), material));
    case 'cylinder':
      return finish(
        new THREE.Mesh(new THREE.CylinderGeometry(0.5 * size, 0.52 * size, 1.5 * size, 48), material)
      );
    case 'cone':
      return finish(new THREE.Mesh(new THREE.ConeGeometry(0.6 * size, 1.4 * size, 48), material));
    case 'torus':
      return finish(new THREE.Mesh(new THREE.TorusGeometry(0.62 * size, 0.18 * size, 24, 96), material));
    case 'torusKnot':
      return finish(
        new THREE.Mesh(new THREE.TorusKnotGeometry(0.5 * size, 0.15 * size, 160, 24), material)
      );
    case 'plane': {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.4 * size, 2.4 * size, 1, 1), material);
      plane.rotation.x = -Math.PI / 2;
      return finish(plane);
    }
    case 'icosahedron':
      return finish(new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 * size, 0), material));
    case 'monolith': {
      const group = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.2 * size, 3.2 * size, 0.5 * size), material);
      group.add(slab);
      return finish(group);
    }
    case 'gear': {
      const group = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55 * size, 0.55 * size, 0.32 * size, 48),
        material
      );
      group.add(core);
      const hubMaterial = new THREE.MeshStandardMaterial({
        color: shadeColor(color, -0.16),
        roughness: 0.3,
        metalness: 0.6
      });
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18 * size, 0.18 * size, 0.36 * size, 32),
        hubMaterial
      );
      group.add(hub);
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const tooth = new THREE.Mesh(
          new THREE.BoxGeometry(0.16 * size, 0.32 * size, 0.28 * size),
          material
        );
        tooth.position.set(Math.cos(angle) * 0.58 * size, 0, Math.sin(angle) * 0.58 * size);
        tooth.rotation.y = -angle;
        group.add(tooth);
      }
      group.rotation.x = Math.PI / 2;
      return finish(group);
    }
    case 'suzanne': {
      const group = new THREE.Group();
      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 * size, 1), material);
      group.add(head);
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.7 * size, 0.14 * size, 0.45 * size),
        material
      );
      brow.position.set(0, 0.22 * size, 0.35 * size);
      group.add(brow);
      [-1, 1].forEach((side) => {
        const ear = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18 * size, 0.12 * size, 0.08 * size, 6),
          material
        );
        ear.position.set(side * 0.62 * size, 0.1 * size, -0.05 * size);
        ear.rotation.z = side * 0.4;
        group.add(ear);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11 * size, 16, 16), material);
        eye.position.set(side * 0.24 * size, 0.12 * size, 0.42 * size);
        group.add(eye);
      });
      const snout = new THREE.Mesh(
        new THREE.BoxGeometry(0.38 * size, 0.28 * size, 0.42 * size),
        material
      );
      snout.position.set(0, -0.15 * size, 0.45 * size);
      group.add(snout);
      return finish(group);
    }
    case 'box':
    default:
      return finish(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material));
  }
}

export interface EnvironmentBuild {
  group: THREE.Group;
  floorMaterial: THREE.MeshStandardMaterial;
  wallMaterial: THREE.MeshStandardMaterial;
}

export function buildEnvironment(settings: SceneSettings): EnvironmentBuild {
  const group = new THREE.Group();
  group.name = 'Architecture';

  switch (settings.environment) {
    case 'garden':
      return buildGardenEnvironment(settings, group);
    case 'street':
      return buildStreetEnvironment(settings, group);
    case 'void':
      return buildVoidEnvironment(settings, group);
    case 'sunset':
      return buildSunsetEnvironment(settings, group);
    case 'studio':
    default:
      return buildStudioEnvironment(settings, group);
  }
}

function buildStudioEnvironment(settings: SceneSettings, group: THREE.Group): EnvironmentBuild {
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: createConcreteTexture(false),
    color: new THREE.Color(settings.floorColor),
    roughness: 0.62,
    metalness: 0.16
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'ConcreteFloor';
  group.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({
    map: createConcreteTexture(true),
    color: new THREE.Color(settings.wallColor),
    roughness: 0.78,
    metalness: 0.06
  });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(44, 20), wallMaterial);
  backWall.position.set(0, 9, -6);
  backWall.receiveShadow = true;
  group.add(backWall);

  const sideMaterial = new THREE.MeshStandardMaterial({
    color: shadeColor(settings.wallColor, -0.05),
    roughness: 0.82,
    metalness: 0.05
  });
  [-1, 1].forEach((side) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 18, 24), sideMaterial);
    wall.position.set(side * 10.5, 9, 1);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.55, 12, 3.2), sideMaterial);
    fin.position.set(side * 6.4, 6, -3.5);
    fin.castShadow = true;
    fin.receiveShadow = true;
    group.add(fin);
  });

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 28),
    new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.95, metalness: 0 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 18;
  ceiling.receiveShadow = true;
  group.add(ceiling);

  return { group, floorMaterial, wallMaterial };
}

function groundMaterial(color: string, roughness = 0.92, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness
  });
}

function addGround(group: THREE.Group, material: THREE.Material, size = 120): THREE.Mesh {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'Ground';
  group.add(floor);
  return floor;
}

function buildGardenEnvironment(settings: SceneSettings, group: THREE.Group): EnvironmentBuild {
  const floorMaterial = groundMaterial(settings.floorColor, 0.96);
  addGround(group, floorMaterial);

  const wallMaterial = groundMaterial(settings.wallColor, 0.9);

  // Stone path down the middle.
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 46),
    groundMaterial('#b9ab93', 0.94)
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.012, 0);
  path.receiveShadow = true;
  group.add(path);

  // Clipped hedges frame the lawn.
  const hedgeMaterial = groundMaterial('#356b31', 0.95);
  [-1, 1].forEach((side) => {
    for (let i = -2; i <= 2; i++) {
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, 2.4), hedgeMaterial);
      hedge.position.set(side * 8.6, 0.75, i * 4.4);
      hedge.castShadow = true;
      hedge.receiveShadow = true;
      group.add(hedge);
    }
  });

  // Simple trees: trunk + low-poly foliage.
  const foliageColors = ['#3f7d3a', '#4f9448', '#356b32', '#5aa257'];
  const trees: Array<[number, number, number]> = [
    [-12, -6, 1.15],
    [11, -8, 0.95],
    [13, 5, 1.3],
    [-13.5, 7, 1.05],
    [-6.5, -13, 0.9],
    [7.5, -14, 1.1],
    [5.5, 14, 0.85],
    [-9, 15, 1.2]
  ];
  trees.forEach(([x, z, scale], index) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 2.1 * scale, 8),
      groundMaterial('#6b4a30', 0.9)
    );
    trunk.position.set(x, 1.05 * scale, z);
    trunk.castShadow = true;
    group.add(trunk);

    const foliage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.45 * scale, 1),
      groundMaterial(foliageColors[index % foliageColors.length], 0.86)
    );
    foliage.position.set(x, 3.0 * scale, z);
    foliage.scale.set(1, 0.82, 1);
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    group.add(foliage);
  });

  // Flower dots keep the lawn from reading as a flat plane.
  const flowerColors = ['#f4d35e', '#f28c8c', '#e8e4ff', '#ffb45e'];
  for (let i = 0; i < 70; i++) {
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.055 + ((i * 37) % 9) * 0.004, 6, 5),
      new THREE.MeshStandardMaterial({
        color: flowerColors[i % flowerColors.length],
        roughness: 0.7,
        emissive: new THREE.Color(flowerColors[i % flowerColors.length]),
        emissiveIntensity: 0.12
      })
    );
    const angle = (i / 70) * Math.PI * 2;
    const radius = 4.2 + ((i * 53) % 100) / 9;
    flower.position.set(Math.cos(angle) * radius, 0.06, Math.sin(angle) * radius * 0.85 - 1);
    group.add(flower);
  }

  return { group, floorMaterial, wallMaterial };
}

function buildStreetEnvironment(settings: SceneSettings, group: THREE.Group): EnvironmentBuild {
  const floorMaterial = groundMaterial(settings.floorColor, 0.88, 0.05);
  addGround(group, floorMaterial);

  const wallMaterial = groundMaterial(settings.wallColor, 0.82);

  // Sidewalks.
  [-1, 1].forEach((side) => {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.24, 110), groundMaterial('#9a9b97', 0.9));
    walk.position.set(side * 7.2, 0.12, 0);
    walk.receiveShadow = true;
    walk.castShadow = true;
    group.add(walk);
  });

  // Dashed centre line.
  const paint = new THREE.MeshStandardMaterial({ color: '#e8e0bd', roughness: 0.7 });
  for (let z = -48; z <= 48; z += 7) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 3), paint);
    dash.position.set(0, 0.014, z);
    group.add(dash);
  }

  // Buildings on both sides.
  const buildingMaterials = ['#4d5560', '#5b5a55', '#3f4850', '#666058'].map((color) =>
    groundMaterial(color, 0.84)
  );
  [-1, 1].forEach((side) => {
    for (let i = -4; i <= 4; i++) {
      const height = 7 + ((i * 13 + (side > 0 ? 5 : 0)) % 5) * 2.4;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(7.4, height, 7.6),
        buildingMaterials[(i + 4 + (side > 0 ? 2 : 0)) % buildingMaterials.length]
      );
      building.position.set(side * 14.6, height / 2, i * 10.5);
      building.castShadow = true;
      building.receiveShadow = true;
      group.add(building);

      // Windows glow faintly so the street reads at night too.
      const windowMaterial = new THREE.MeshStandardMaterial({
        color: '#f6d79a',
        emissive: new THREE.Color('#ffcf7a'),
        emissiveIntensity: 0.55,
        roughness: 0.4
      });
      for (let row = 0; row < Math.min(5, Math.floor(height / 3)); row++) {
        for (let col = -1; col <= 1; col++) {
          const windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), windowMaterial);
          windowMesh.position.set(
            side * (14.6 - side * 3.72),
            2.4 + row * 2.6,
            i * 10.5 + col * 1.8
          );
          windowMesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          group.add(windowMesh);
        }
      }
    }
  });

  // Street lamps.
  [-1, 1].forEach((side) => {
    for (let z = -36; z <= 36; z += 18) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8),
        groundMaterial('#22262b', 0.5, 0.7)
      );
      pole.position.set(side * 6.4, 2.7, z);
      pole.castShadow = true;
      group.add(pole);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), groundMaterial('#22262b', 0.5, 0.7));
      arm.position.set(side * 6.0, 5.4, z);
      group.add(arm);

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 12, 10),
        new THREE.MeshStandardMaterial({
          color: '#fff2d0',
          emissive: new THREE.Color('#ffd38a'),
          emissiveIntensity: 2.4,
          roughness: 0.3
        })
      );
      bulb.position.set(side * 5.6, 5.32, z);
      group.add(bulb);
    }
  });

  return { group, floorMaterial, wallMaterial };
}

function buildVoidEnvironment(settings: SceneSettings, group: THREE.Group): EnvironmentBuild {
  const floorMaterial = groundMaterial(settings.floorColor, 0.45, 0.55);
  addGround(group, floorMaterial, 160);

  const wallMaterial = groundMaterial(settings.wallColor, 0.7);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: '#27313f',
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  [18, 30, 44].forEach((radius) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.06, 96), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    group.add(ring);
  });

  return { group, floorMaterial, wallMaterial };
}

function buildSunsetEnvironment(settings: SceneSettings, group: THREE.Group): EnvironmentBuild {
  const floorMaterial = groundMaterial(settings.floorColor, 0.95);
  addGround(group, floorMaterial, 180);

  const wallMaterial = groundMaterial(settings.wallColor, 0.9);

  // Low sun disc on the horizon.
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(6.5, 32, 24),
    new THREE.MeshBasicMaterial({ color: '#ffcf8a' })
  );
  sun.position.set(-16, 14, -62);
  group.add(sun);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(8.8, 32, 24),
    new THREE.MeshBasicMaterial({ color: '#ff9d5c', transparent: true, opacity: 0.22 })
  );
  halo.position.copy(sun.position);
  group.add(halo);

  // Dunes: squashed spheres give soft, cinematic silhouettes.
  const duneColors = ['#a47a51', '#96704a', '#b98a5c', '#8d6644'];
  [
    [-26, -20, 16, 3.4],
    [22, -26, 20, 4.2],
    [-34, 8, 18, 3.8],
    [30, 12, 15, 3.1],
    [0, -38, 24, 5.2]
  ].forEach(([x, z, radius, height], index) => {
    const dune = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      groundMaterial(duneColors[index % duneColors.length], 0.96)
    );
    dune.scale.y = height / radius;
    dune.position.set(x, 0, z);
    dune.receiveShadow = true;
    group.add(dune);
  });

  // Scattered rocks.
  for (let i = 0; i < 26; i++) {
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35 + ((i * 17) % 10) * 0.06, 0),
      groundMaterial('#6f523a', 0.95)
    );
    const angle = (i / 26) * Math.PI * 2 + 0.7;
    const radius = 8 + ((i * 29) % 100) / 5;
    rock.position.set(Math.cos(angle) * radius, 0.24, Math.sin(angle) * radius * 0.8);
    rock.rotation.set(i * 0.4, i * 0.9, i * 0.2);
    rock.castShadow = true;
    group.add(rock);
  }

  return { group, floorMaterial, wallMaterial };
}

export function buildEngineeringSchematics(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Engineering Schematics';

  const cyan = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.18 });
  const amber = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.14 });
  const white = new THREE.LineBasicMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.1 });
  const wallZ = -5.94;

  [0.85, 1.5].forEach((radius, idx) => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 72; i++) {
      const theta = (i / 72) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * radius, 2.6 + Math.sin(theta) * radius, wallZ));
    }
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        idx % 2 === 0 ? cyan : white
      )
    );
  });

  const cross = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2.8, 2.6, wallZ),
    new THREE.Vector3(2.8, 2.6, wallZ),
    new THREE.Vector3(0, 0.1, wallZ),
    new THREE.Vector3(0, 5.1, wallZ)
  ]);
  group.add(new THREE.LineSegments(cross, cyan));

  const wireCube = (cx: number, cy: number, cz: number, size: number, material: THREE.Material) => {
    const geometry = new THREE.WireframeGeometry(new THREE.BoxGeometry(size, size, size));
    const lines = new THREE.LineSegments(geometry, material);
    lines.position.set(cx, cy, cz);
    lines.rotation.set(Math.PI / 6, Math.PI / 4, 0);
    return lines;
  };
  group.add(wireCube(-3.4, 3.6, wallZ, 1, amber));
  group.add(wireCube(3.4, 3.6, wallZ, 1, cyan));
  group.add(wireCube(-4.5, 1.4, wallZ, 0.65, white));
  group.add(wireCube(4.5, 1.4, wallZ, 0.65, amber));

  const dimension = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-3.9, 0.24, wallZ),
    new THREE.Vector3(3.9, 0.24, wallZ),
    new THREE.Vector3(-3.9, 0.12, wallZ),
    new THREE.Vector3(-3.9, 0.36, wallZ),
    new THREE.Vector3(3.9, 0.12, wallZ),
    new THREE.Vector3(3.9, 0.36, wallZ),
    new THREE.Vector3(5.1, 0, wallZ),
    new THREE.Vector3(5.1, 1.82, wallZ),
    new THREE.Vector3(5.0, 1.82, wallZ),
    new THREE.Vector3(5.2, 1.82, wallZ)
  ]);
  group.add(new THREE.LineSegments(dimension, amber));

  group.userData.animatedMaterials = { cyan, amber, white };
  return group;
}

export function applyMaterialState(
  root: THREE.Object3D,
  materialState: {
    color: string;
    roughness: number;
    metalness: number;
    emissive: string;
    emissiveIntensity: number;
    opacity: number;
    wireframe: boolean;
    flatShading: boolean;
  }
): void {
  const color = new THREE.Color(materialState.color);
  const emissive = new THREE.Color(materialState.emissive);
  root.traverse((child) => {
    if (child.userData.skipTint) return;
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh && !(child as any).isSkinnedMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.color) standard.color.copy(color);
      if ('roughness' in standard) standard.roughness = materialState.roughness;
      if ('metalness' in standard) standard.metalness = materialState.metalness;
      if (standard.emissive) standard.emissive.copy(emissive);
      if ('emissiveIntensity' in standard) standard.emissiveIntensity = materialState.emissiveIntensity;
      if ('wireframe' in standard) standard.wireframe = materialState.wireframe;
      if ('flatShading' in standard && standard.flatShading !== materialState.flatShading) {
        (standard as any).flatShading = materialState.flatShading;
        standard.needsUpdate = true;
      }
      standard.transparent = materialState.opacity < 1;
      standard.opacity = materialState.opacity;
      standard.depthWrite = materialState.opacity >= 1;
    }
  });
}

export function buildLight(state: LightState): THREE.Light {
  const color = new THREE.Color(state.color);
  let light: THREE.Light;
  switch (state.kind) {
    case 'ambient':
      light = new THREE.AmbientLight(color, state.intensity);
      break;
    case 'hemisphere':
      light = new THREE.HemisphereLight(
        color,
        new THREE.Color(state.groundColor),
        state.intensity
      );
      break;
    case 'directional':
      light = new THREE.DirectionalLight(color, state.intensity);
      break;
    case 'spot':
      light = new THREE.SpotLight(
        color,
        state.intensity,
        state.distance,
        state.angle,
        state.penumbra,
        state.decay
      );
      break;
    case 'point':
      light = new THREE.PointLight(color, state.intensity, state.distance, state.decay);
      break;
    default:
      light = new THREE.PointLight(color, state.intensity, state.distance, state.decay);
  }
  return light;
}

export function updateLightState(light: THREE.Light, state: LightState): void {
  light.color.set(state.color);
  light.intensity = state.intensity;
  if (light instanceof THREE.HemisphereLight) {
    light.groundColor.set(state.groundColor);
  }
  if (light instanceof THREE.PointLight) {
    light.distance = state.distance;
    light.decay = state.decay;
  }
  if (light instanceof THREE.SpotLight) {
    light.distance = state.distance;
    light.decay = state.decay;
    light.angle = state.angle;
    light.penumbra = state.penumbra;
  }
  light.visible = state.intensity > 0;
}

export function createCameraRig(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'CameraRig';
  const material = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.9
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.26), material);
  group.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.18, 20), material);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.2;
  group.add(lens);
  const film = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.02), material);
  film.position.z = -0.14;
  group.add(film);
  return group;
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else if (material) material.dispose();
  });
}

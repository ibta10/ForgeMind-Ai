import type { ThresholdCostSurfaceCell, ThresholdCostSurfaceResult } from './types';

export type Surface3DPolicyBasis = 'risk_aware' | 'threshold';

export interface Camera3DAngles {
  /** Azimuth rotation in degrees around the vertical Z axis */
  yawDeg: number;
  /** Elevation tilt in degrees from horizon toward top-down (5..85) */
  pitchDeg: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface ProjectedPoint {
  sx: number;
  sy: number;
  depth: number;
}

export interface Surface3DVertex {
  cpIndex: number;
  tauIndex: number;
  preventiveCost: number;
  rulThreshold: number;
  costPerCycle: number;
  failureRatePct: number;
  wastedRul: number;
  cell: ThresholdCostSurfaceCell;
  world: Point3D;
  projected: ProjectedPoint;
  isGlobalMin: boolean;
  isInOptimalBasin: boolean;
}

export interface Surface3DQuad {
  id: string;
  cpStart: number;
  cpEnd: number;
  tauStart: number;
  tauEnd: number;
  /** Average cost across the 4 quad corners ($/cycle) */
  meanCost: number;
  /** Minimum corner cost inside this quad ($/cycle) */
  minCornerCost: number;
  /** Representative cell (corner with lowest cost or centroid) */
  representativeCell: ThresholdCostSurfaceCell;
  /** Screen-space corners in winding order */
  points: ProjectedPoint[];
  avgDepth: number;
  /** Normalized elevation [0, 1] for color scale mapping */
  normZ: number;
  /** Lambertian-like lighting factor [0.75, 1.18] from quad normal */
  shadeFactor: number;
  /** True if any corner lies inside the near-optimal global minimum basin */
  touchesOptimalBasin: boolean;
  /** True if this quad contains the exact global minimum vertex */
  containsGlobalMin: boolean;
}

export interface Surface3DBasinSummary {
  globalMinCell: ThresholdCostSurfaceCell;
  globalMinCost: number;
  maxCost: number;
  basinThresholdCost: number;
  basinCells: ThresholdCostSurfaceCell[];
  cpMin: number;
  cpMax: number;
  tauMin: number;
  tauMax: number;
}

export interface Surface3DAxisTick {
  label: string;
  anchor: ProjectedPoint;
  outer: ProjectedPoint;
}

export interface Surface3DScene {
  vertices: Surface3DVertex[][];
  quads: Surface3DQuad[];
  globalMinVertex: Surface3DVertex;
  globalMinFloor: ProjectedPoint;
  activeVertex: Surface3DVertex | null;
  activeFloor: ProjectedPoint | null;
  basin: Surface3DBasinSummary;
  zMin: number;
  zMax: number;
  floorOutline: ProjectedPoint[];
  backWalls: ProjectedPoint[][];
  xTicks: Surface3DAxisTick[];
  yTicks: Surface3DAxisTick[];
  zTicks: Surface3DAxisTick[];
  xAxisTitlePos: ProjectedPoint;
  yAxisTitlePos: ProjectedPoint;
  zAxisTitlePos: ProjectedPoint;
}

export const DEFAULT_SURFACE_3D_CAMERA: Camera3DAngles = {
  yawDeg: 32,
  pitchDeg: 26,
};

/**
 * Projects a normalized 3D world point (wx in [-1, 1], wy in [-1, 1], wz in [-0.75, 0.85])
 * onto 2D viewport coordinates with weak perspective foreshortening.
 *
 * Orientation convention:
 * - X (Preventive Cost Cp): increases left -> right when yaw is near 0..45 deg
 * - Y (RUL Threshold tau): decreases toward camera (-1) and increases into depth (+1)
 * - Z (Maintenance Cost $/cyc): points straight up
 */
export function projectPoint3D(
  pt: Point3D,
  camera: Camera3DAngles,
  viewport: { cx: number; cy: number; scale: number; fov?: number },
): ProjectedPoint {
  const yaw = (camera.yawDeg * Math.PI) / 180;
  const pitch = (camera.pitchDeg * Math.PI) / 180;

  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  const x1 = pt.x * cosY - pt.y * sinY;
  const y1 = pt.x * sinY + pt.y * cosY;
  const z1 = pt.z;

  const yCam = z1 * cosP + y1 * sinP;
  const depth = y1 * cosP - z1 * sinP;

  const fov = viewport.fov ?? 6.2;
  const perspective = fov / Math.max(1.5, fov + depth);

  return {
    sx: viewport.cx + x1 * viewport.scale * perspective,
    sy: viewport.cy - yCam * viewport.scale * perspective,
    depth,
  };
}

function getCellMetric(
  cell: ThresholdCostSurfaceCell,
  basis: Surface3DPolicyBasis,
): { cost: number; failPct: number; wastedRul: number } {
  if (basis === 'threshold') {
    return {
      cost: cell.thresholdCostPerCycle,
      failPct: cell.thresholdFailureRatePct,
      wastedRul: cell.thresholdWastedRul,
    };
  }
  return {
    cost: cell.riskAwareCostPerCycle,
    failPct: cell.riskAwareFailureRatePct,
    wastedRul: cell.riskAwareWastedRul,
  };
}

/**
 * Identifies the global minimum cost point and all neighboring points within
 * +10% (or configurable tolerance) of the minimum cost.
 */
export function findGlobalMinimumBasin(
  surface: ThresholdCostSurfaceResult,
  basis: Surface3DPolicyBasis,
  toleranceFraction = 0.1,
): Surface3DBasinSummary {
  let globalMinCell = surface.cells[0];
  let globalMinCost = Infinity;
  let maxCost = -Infinity;

  for (const cell of surface.cells) {
    const { cost } = getCellMetric(cell, basis);
    if (cost < globalMinCost) {
      globalMinCost = cost;
      globalMinCell = cell;
    }
    if (cost > maxCost) {
      maxCost = cost;
    }
  }

  const basinThresholdCost = Number((globalMinCost * (1 + toleranceFraction)).toFixed(3));
  const basinCells = surface.cells.filter(
    (c) => getCellMetric(c, basis).cost <= basinThresholdCost + 1e-9,
  );

  const cps = basinCells.map((c) => c.preventiveCost);
  const taus = basinCells.map((c) => c.rulThreshold);

  return {
    globalMinCell,
    globalMinCost: Number(globalMinCost.toFixed(3)),
    maxCost: Number(maxCost.toFixed(3)),
    basinThresholdCost,
    basinCells,
    cpMin: Math.min(...cps),
    cpMax: Math.max(...cps),
    tauMin: Math.min(...taus),
    tauMax: Math.max(...taus),
  };
}

function computeQuadShadeFactor(p0: Point3D, p1: Point3D, p2: Point3D, p3: Point3D): number {
  // Diagonal vectors across the quad
  const ux = p2.x - p0.x;
  const uy = p2.y - p0.y;
  const uz = p2.z - p0.z;

  const vx = p3.x - p1.x;
  const vy = p3.y - p1.y;
  const vz = p3.z - p1.z;

  // Cross product (u x v)
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;

  // Ensure normal points upward (+Z)
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }

  const mag = Math.hypot(nx, ny, nz) || 1;
  nx /= mag;
  ny /= mag;
  nz /= mag;

  // Normalized key light from upper-left-front
  const lx = -0.45;
  const ly = -0.35;
  const lz = 0.82;
  const dot = nx * lx + ny * ly + nz * lz;

  return Math.max(0.76, Math.min(1.18, 0.78 + Math.max(0, dot) * 0.4));
}

/**
 * Builds the full 3D mesh, axis cage, ticks, global-min highlight, and depth-sorted quads
 * ready for D3 SVG rendering.
 */
export function buildSensitivity3DScene(
  surface: ThresholdCostSurfaceResult,
  options: {
    basis: Surface3DPolicyBasis;
    camera: Camera3DAngles;
    viewport: { cx: number; cy: number; scale: number; fov?: number };
    activePreventiveCost?: number;
    activeThreshold?: number;
    basinTolerance?: number;
  },
): Surface3DScene {
  const { basis, camera, viewport } = options;
  const cps = surface.preventiveCosts;
  const taus = surface.thresholds;

  const cellLookup = new Map<string, ThresholdCostSurfaceCell>();
  for (const c of surface.cells) {
    cellLookup.set(`${c.preventiveCost}:${c.rulThreshold}`, c);
  }

  const basin = findGlobalMinimumBasin(surface, basis, options.basinTolerance ?? 0.1);
  const zMin = Math.max(0, Number((basin.globalMinCost * 0.85).toFixed(3)));
  const zMax = Math.max(zMin + 0.1, Number((basin.maxCost * 1.04).toFixed(3)));
  const zSpan = Math.max(0.05, zMax - zMin);

  const cpMin = cps[0];
  const cpMax = cps[cps.length - 1];
  const cpSpan = Math.max(1, cpMax - cpMin);

  const tauMin = taus[0];
  const tauMax = taus[taus.length - 1];
  const tauSpan = Math.max(1, tauMax - tauMin);

  const zFloor = -0.68;
  const zHeight = 1.36;

  const mapCp = (cp: number) => ((cp - cpMin) / cpSpan) * 2 - 1;
  // Map lower RUL threshold (high failure cost ridge) toward +1 (back) and higher tau toward -1 (front)
  const mapTau = (tau: number) => 1 - ((tau - tauMin) / tauSpan) * 2;
  const mapZ = (cost: number) => zFloor + ((cost - zMin) / zSpan) * zHeight;

  const project = (pt: Point3D) => projectPoint3D(pt, camera, viewport);

  const vertices: Surface3DVertex[][] = cps.map((cp, ci) =>
    taus.map((tau, ti) => {
      const cell = cellLookup.get(`${cp}:${tau}`)!;
      const metric = getCellMetric(cell, basis);
      const world: Point3D = {
        x: mapCp(cp),
        y: mapTau(tau),
        z: mapZ(metric.cost),
      };
      const isGlobalMin =
        cp === basin.globalMinCell.preventiveCost && tau === basin.globalMinCell.rulThreshold;
      const isInOptimalBasin = metric.cost <= basin.basinThresholdCost + 1e-9;

      return {
        cpIndex: ci,
        tauIndex: ti,
        preventiveCost: cp,
        rulThreshold: tau,
        costPerCycle: metric.cost,
        failureRatePct: metric.failPct,
        wastedRul: metric.wastedRul,
        cell,
        world,
        projected: project(world),
        isGlobalMin,
        isInOptimalBasin,
      };
    }),
  );

  // Build quads and sort back-to-front (descending avgDepth) via Painter's algorithm
  const quads: Surface3DQuad[] = [];
  for (let ci = 0; ci < cps.length - 1; ci++) {
    for (let ti = 0; ti < taus.length - 1; ti++) {
      const v00 = vertices[ci][ti];
      const v10 = vertices[ci + 1][ti];
      const v11 = vertices[ci + 1][ti + 1];
      const v01 = vertices[ci][ti + 1];

      const corners = [v00, v10, v11, v01];
      const meanCost =
        (v00.costPerCycle + v10.costPerCycle + v11.costPerCycle + v01.costPerCycle) / 4;
      const minCorner = corners.reduce((best, cur) =>
        cur.costPerCycle < best.costPerCycle ? cur : best,
      );
      const avgDepth =
        (v00.projected.depth + v10.projected.depth + v11.projected.depth + v01.projected.depth) / 4;
      const normZ = Math.max(0, Math.min(1, (meanCost - zMin) / zSpan));
      const shadeFactor = computeQuadShadeFactor(v00.world, v10.world, v11.world, v01.world);

      quads.push({
        id: `q-${v00.preventiveCost}-${v00.rulThreshold}`,
        cpStart: v00.preventiveCost,
        cpEnd: v10.preventiveCost,
        tauStart: v00.rulThreshold,
        tauEnd: v01.rulThreshold,
        meanCost: Number(meanCost.toFixed(3)),
        minCornerCost: minCorner.costPerCycle,
        representativeCell: minCorner.cell,
        points: [v00.projected, v10.projected, v11.projected, v01.projected],
        avgDepth,
        normZ,
        shadeFactor,
        touchesOptimalBasin: corners.some((c) => c.isInOptimalBasin),
        containsGlobalMin: corners.some((c) => c.isGlobalMin),
      });
    }
  }

  quads.sort((a, b) => b.avgDepth - a.avgDepth);

  // Global minimum & active simulator pin
  const flatVertices = vertices.flat();
  const globalMinVertex =
    flatVertices.find((v) => v.isGlobalMin) ?? flatVertices[0];
  const globalMinFloor = project({
    x: globalMinVertex.world.x,
    y: globalMinVertex.world.y,
    z: zFloor,
  });

  let activeVertex: Surface3DVertex | null = null;
  let activeFloor: ProjectedPoint | null = null;
  if (
    typeof options.activePreventiveCost === 'number' &&
    typeof options.activeThreshold === 'number'
  ) {
    const nearestCp = cps.reduce((best, cp) =>
      Math.abs(cp - options.activePreventiveCost!) < Math.abs(best - options.activePreventiveCost!)
        ? cp
        : best,
    );
    const nearestTau = taus.reduce((best, t) =>
      Math.abs(t - options.activeThreshold!) < Math.abs(best - options.activeThreshold!) ? t : best,
    );
    activeVertex =
      flatVertices.find(
        (v) => v.preventiveCost === nearestCp && v.rulThreshold === nearestTau,
      ) ?? null;
    if (activeVertex) {
      activeFloor = project({
        x: activeVertex.world.x,
        y: activeVertex.world.y,
        z: zFloor,
      });
    }
  }

  // Axis cage: floor + back walls + axis ticks
  const zTop = zFloor + zHeight;
  const floorOutline = [
    project({ x: -1, y: -1, z: zFloor }),
    project({ x: 1, y: -1, z: zFloor }),
    project({ x: 1, y: 1, z: zFloor }),
    project({ x: -1, y: 1, z: zFloor }),
  ];

  // Choose the two walls farthest from camera so walls always act as a backdrop
  const wallCandidates: Array<{ points: Point3D[]; avgDepth: number }> = [
    {
      points: [
        { x: -1, y: 1, z: zFloor },
        { x: 1, y: 1, z: zFloor },
        { x: 1, y: 1, z: zTop },
        { x: -1, y: 1, z: zTop },
      ],
      avgDepth: project({ x: 0, y: 1, z: zFloor + zHeight * 0.5 }).depth,
    },
    {
      points: [
        { x: -1, y: -1, z: zFloor },
        { x: 1, y: -1, z: zFloor },
        { x: 1, y: -1, z: zTop },
        { x: -1, y: -1, z: zTop },
      ],
      avgDepth: project({ x: 0, y: -1, z: zFloor + zHeight * 0.5 }).depth,
    },
    {
      points: [
        { x: 1, y: -1, z: zFloor },
        { x: 1, y: 1, z: zFloor },
        { x: 1, y: 1, z: zTop },
        { x: 1, y: -1, z: zTop },
      ],
      avgDepth: project({ x: 1, y: 0, z: zFloor + zHeight * 0.5 }).depth,
    },
    {
      points: [
        { x: -1, y: -1, z: zFloor },
        { x: -1, y: 1, z: zFloor },
        { x: -1, y: 1, z: zTop },
        { x: -1, y: -1, z: zTop },
      ],
      avgDepth: project({ x: -1, y: 0, z: zFloor + zHeight * 0.5 }).depth,
    },
  ];
  wallCandidates.sort((a, b) => b.avgDepth - a.avgDepth);
  const backWalls = wallCandidates.slice(0, 2).map((w) => w.points.map(project));

  // Place Z axis ticks along the leftmost corner of the bounding box on screen
  const cornersFloor = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ].map((c) => ({ ...c, proj: project({ x: c.x, y: c.y, z: zFloor }) }));
  cornersFloor.sort((a, b) => a.proj.sx - b.proj.sx);
  const leftCorner = cornersFloor[0];

  // Choose the lower X edge on screen for Preventive Cost ticks, and right-side Y edge (opposite Z) for RUL Threshold ticks
  const bottomY =
    project({ x: 0, y: -1, z: zFloor }).sy >= project({ x: 0, y: 1, z: zFloor }).sy ? -1 : 1;
  const rightX =
    project({ x: 1, y: 0, z: zFloor }).sx >= project({ x: -1, y: 0, z: zFloor }).sx ? 1 : -1;
  const yOutSign = bottomY;
  const xOutSign = rightX;

  const xTicks: Surface3DAxisTick[] = cps
    .filter((_, idx) => idx % 2 === 0 || idx === cps.length - 1)
    .map((cp) => ({
      label: `$${cp}`,
      anchor: project({ x: mapCp(cp), y: bottomY, z: zFloor }),
      outer: project({ x: mapCp(cp), y: bottomY + yOutSign * 0.11, z: zFloor }),
    }));

  const yTicks: Surface3DAxisTick[] = taus
    .filter((_, idx) => idx % 2 === 0)
    .map((tau) => ({
      label: `${tau}c`,
      anchor: project({ x: rightX, y: mapTau(tau), z: zFloor }),
      outer: project({ x: rightX + xOutSign * 0.11, y: mapTau(tau), z: zFloor }),
    }));

  const zSteps = 4;
  const zTicks: Surface3DAxisTick[] = Array.from({ length: zSteps + 1 }, (_, i) => {
    const val = zMin + (zSpan * i) / zSteps;
    const zVal = mapZ(val);
    const anchor = project({ x: leftCorner.x, y: leftCorner.y, z: zVal });
    return {
      label: `$${val.toFixed(2)}`,
      anchor,
      outer: { sx: anchor.sx - 10, sy: anchor.sy, depth: anchor.depth },
    };
  });

  const xAxisTitlePos = project({ x: 0, y: bottomY + yOutSign * 0.44, z: zFloor });
  const yAxisTitlePos = project({ x: rightX + xOutSign * 0.42, y: 0, z: zFloor });
  const zAxisTop = project({ x: leftCorner.x, y: leftCorner.y, z: zTop });
  const zAxisTitlePos: ProjectedPoint = {
    sx: zAxisTop.sx - 6,
    sy: zAxisTop.sy - 14,
    depth: zAxisTop.depth,
  };

  return {
    vertices,
    quads,
    globalMinVertex,
    globalMinFloor,
    activeVertex,
    activeFloor,
    basin,
    zMin,
    zMax,
    floorOutline,
    backWalls,
    xTicks,
    yTicks,
    zTicks,
    xAxisTitlePos,
    yAxisTitlePos,
    zAxisTitlePos,
  };
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ArrowUpRight, Crosshair, RotateCcw } from 'lucide-react';
import {
  buildSensitivity3DScene,
  DEFAULT_SURFACE_3D_CAMERA,
  type Camera3DAngles,
  type ProjectedPoint,
  type Surface3DPolicyBasis,
  type Surface3DQuad,
} from '../../engine/surface3d';
import type { ThresholdCostSurfaceCell, ThresholdCostSurfaceResult } from '../../engine/types';
import { TechnicalInterpretation } from './TechnicalInterpretation';

interface Sensitivity3DSurfacePlotProps {
  surface: ThresholdCostSurfaceResult;
  policyBasis: Surface3DPolicyBasis;
  failureCost: number;
  activePreventiveCost: number;
  activeThreshold: number;
  evalEngineCount?: number;
  onApplyPoint: (preventiveCost: number, rulThreshold: number) => void;
}

const VIEWBOX_W = 820;
const VIEWBOX_H = 435;

const CAMERA_PRESETS: Array<{ id: string; label: string; camera: Camera3DAngles }> = [
  { id: 'basin', label: 'Basin View', camera: DEFAULT_SURFACE_3D_CAMERA },
  { id: 'ridge', label: 'Front Ridge', camera: { yawDeg: 10, pitchDeg: 18 } },
  { id: 'side', label: 'Profile', camera: { yawDeg: 78, pitchDeg: 16 } },
  { id: 'top', label: 'Top Contour', camera: { yawDeg: 0, pitchDeg: 80 } },
];

function polygonPoints(pts: ProjectedPoint[]): string {
  return pts.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ');
}

function clampPitch(deg: number): number {
  return Math.max(10, Math.min(82, deg));
}

function normalizeYaw(deg: number): number {
  let y = ((deg + 180) % 360 + 360) % 360 - 180;
  if (y === -180) y = 180;
  return y;
}

export const Sensitivity3DSurfacePlot: React.FC<Sensitivity3DSurfacePlotProps> = ({
  surface,
  policyBasis,
  failureCost,
  activePreventiveCost,
  activeThreshold,
  evalEngineCount,
  onApplyPoint,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [camera, setCamera] = useState<Camera3DAngles>(DEFAULT_SURFACE_3D_CAMERA);
  const [selectedCoord, setSelectedCoord] = useState<{ cp: number; tau: number } | null>(null);
  const [hoveredQuadId, setHoveredQuadId] = useState<string | null>(null);
  const hasSufficientGrid =
    surface.preventiveCosts.length >= 2 &&
    surface.thresholds.length >= 2 &&
    surface.cells.length > 0;

  const scene = useMemo(
    () =>
      buildSensitivity3DScene(surface, {
        basis: policyBasis,
        camera,
        viewport: {
          cx: 404,
          cy: 214,
          scale: 144,
          fov: 6.2,
        },
        activePreventiveCost,
        activeThreshold,
        basinTolerance: 0.1,
      }),
    [surface, policyBasis, camera, activePreventiveCost, activeThreshold],
  );

  // D3 perceptual color interpolator from optimal emerald valley -> cyan -> amber -> crimson ridge
  const colorInterpolator = useMemo(
    () =>
      d3.interpolateRgbBasis([
        '#10B981', // Global minimum cost basin
        '#06B6D4', // Low-cost transition
        '#F59E0B', // Mid-cost slope
        '#F43F5E', // Catastrophic failure ridge
      ]),
    [],
  );

  const cellLookup = useMemo(() => {
    const map = new Map<string, ThresholdCostSurfaceCell>();
    for (const c of surface.cells) {
      map.set(`${c.preventiveCost}:${c.rulThreshold}`, c);
    }
    return map;
  }, [surface.cells]);

  const inspectedCell = useMemo(() => {
    if (selectedCoord) {
      const found = cellLookup.get(`${selectedCoord.cp}:${selectedCoord.tau}`);
      if (found) return found;
    }
    return scene.basin.globalMinCell;
  }, [selectedCoord, cellLookup, scene.basin.globalMinCell]);

  const hoveredQuad = useMemo(
    () => (hoveredQuadId ? scene.quads.find((q) => q.id === hoveredQuadId) ?? null : null),
    [hoveredQuadId, scene.quads],
  );

  const inspectedCost =
    policyBasis === 'threshold'
      ? inspectedCell.thresholdCostPerCycle
      : inspectedCell.riskAwareCostPerCycle;
  const inspectedFailPct =
    policyBasis === 'threshold'
      ? inspectedCell.thresholdFailureRatePct
      : inspectedCell.riskAwareFailureRatePct;
  const inspectedWastedRul =
    policyBasis === 'threshold'
      ? inspectedCell.thresholdWastedRul
      : inspectedCell.riskAwareWastedRul;
  const deltaFromMinPct =
    scene.basin.globalMinCost > 0
      ? ((inspectedCost - scene.basin.globalMinCost) / scene.basin.globalMinCost) * 100
      : 0;

  // Bind D3 drag-to-orbit onto the SVG viewport
  useEffect(() => {
    const svgNode = svgRef.current;
    if (!svgNode) return;

    const svg = d3.select(svgNode);
    const dragBehavior = d3
      .drag<SVGSVGElement, unknown>()
      .on('drag', (event) => {
        setCamera((prev) => ({
          yawDeg: normalizeYaw(prev.yawDeg + event.dx * 0.45),
          pitchDeg: clampPitch(prev.pitchDeg + event.dy * 0.38),
        }));
      });

    svg.call(dragBehavior);
    return () => {
      svg.on('.drag', null);
    };
  }, []);

  // Render D3 3D scene layers cleanly via D3 data-joins
  useEffect(() => {
    const svgNode = svgRef.current;
    if (!svgNode) return;

    const svg = d3.select(svgNode);

    // 1. Back bounding walls (subtle dark slate planes)
    const wallsGroup = svg.select<SVGGElement>('.layer-walls');
    wallsGroup
      .selectAll<SVGPolygonElement, ProjectedPoint[]>('polygon')
      .data(scene.backWalls)
      .join('polygon')
      .attr('points', (pts) => polygonPoints(pts))
      .attr('fill', 'rgba(15, 23, 42, 0.46)')
      .attr('stroke', 'rgba(51, 65, 85, 0.55)')
      .attr('stroke-width', 1);

    // 2. Floor polygon + XY reference grid lines on floor
    const floorGroup = svg.select<SVGGElement>('.layer-floor');
    floorGroup
      .selectAll<SVGPolygonElement, ProjectedPoint[]>('polygon.floor-plane')
      .data([scene.floorOutline])
      .join('polygon')
      .attr('class', 'floor-plane')
      .attr('points', (pts) => polygonPoints(pts))
      .attr('fill', 'rgba(8, 11, 18, 0.72)')
      .attr('stroke', 'rgba(71, 85, 105, 0.7)')
      .attr('stroke-width', 1.2);

    // Floor grid lines linking opposite tick anchors
    const floorSegments: Array<{ a: ProjectedPoint; b: ProjectedPoint }> = [];
    for (let i = 0; i < scene.floorOutline.length; i++) {
      // Draw subtle wireframe rays from tick anchors across floor
    }
    const nCp = scene.vertices.length;
    const nTau = scene.vertices[0]?.length ?? 0;
    for (let ci = 1; ci < nCp - 1; ci += 2) {
      const a = scene.vertices[ci][0].world;
      const b = scene.vertices[ci][nTau - 1].world;
      const a0 = { ...a, z: -0.68 };
      const b0 = { ...b, z: -0.68 };
      // Project onto floor via matching X/Y world ratios
      const pA = {
        sx:
          scene.floorOutline[0].sx +
          ((a0.x + 1) / 2) * (scene.floorOutline[1].sx - scene.floorOutline[0].sx),
        sy:
          scene.floorOutline[0].sy +
          ((a0.x + 1) / 2) * (scene.floorOutline[1].sy - scene.floorOutline[0].sy),
        depth: 0,
      };
      const pB = {
        sx:
          scene.floorOutline[3].sx +
          ((b0.x + 1) / 2) * (scene.floorOutline[2].sx - scene.floorOutline[3].sx),
        sy:
          scene.floorOutline[3].sy +
          ((b0.x + 1) / 2) * (scene.floorOutline[2].sy - scene.floorOutline[3].sy),
        depth: 0,
      };
      floorSegments.push({ a: pA, b: pB });
    }
    for (let ti = 1; ti < nTau - 1; ti += 2) {
      const a = scene.vertices[0][ti].world;
      const aFrac = (1 - a.y) / 2;
      const pA = {
        sx:
          scene.floorOutline[3].sx +
          (1 - aFrac) * (scene.floorOutline[0].sx - scene.floorOutline[3].sx),
        sy:
          scene.floorOutline[3].sy +
          (1 - aFrac) * (scene.floorOutline[0].sy - scene.floorOutline[3].sy),
        depth: 0,
      };
      const pB = {
        sx:
          scene.floorOutline[2].sx +
          (1 - aFrac) * (scene.floorOutline[1].sx - scene.floorOutline[2].sx),
        sy:
          scene.floorOutline[2].sy +
          (1 - aFrac) * (scene.floorOutline[1].sy - scene.floorOutline[2].sy),
        depth: 0,
      };
      floorSegments.push({ a: pA, b: pB });
    }
    floorGroup
      .selectAll<SVGLineElement, (typeof floorSegments)[number]>('line.floor-grid-line')
      .data(floorSegments)
      .join('line')
      .attr('class', 'floor-grid-line')
      .attr('x1', (d) => d.a.sx)
      .attr('y1', (d) => d.a.sy)
      .attr('x2', (d) => d.b.sx)
      .attr('y2', (d) => d.b.sy)
      .attr('stroke', 'rgba(51, 65, 85, 0.42)')
      .attr('stroke-width', 0.9);

    // 3. Z-level horizontal guide lines on back walls
    const zGridGroup = svg.select<SVGGElement>('.layer-z-guides');
    const zWallLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (const wall of scene.backWalls) {
      if (wall.length === 4) {
        for (const frac of [0.25, 0.5, 0.75, 1]) {
          zWallLines.push({
            x1: wall[0].sx + (wall[3].sx - wall[0].sx) * frac,
            y1: wall[0].sy + (wall[3].sy - wall[0].sy) * frac,
            x2: wall[1].sx + (wall[2].sx - wall[1].sx) * frac,
            y2: wall[1].sy + (wall[2].sy - wall[1].sy) * frac,
          });
        }
      }
    }
    zGridGroup
      .selectAll<SVGLineElement, (typeof zWallLines)[number]>('line')
      .data(zWallLines)
      .join('line')
      .attr('x1', (d) => d.x1)
      .attr('y1', (d) => d.y1)
      .attr('x2', (d) => d.x2)
      .attr('y2', (d) => d.y2)
      .attr('stroke', 'rgba(51, 65, 85, 0.45)')
      .attr('stroke-dasharray', '2 3')
      .attr('stroke-width', 1);

    // 4. Depth-sorted 3D surface quads (Painter's algorithm)
    const surfaceGroup = svg.select<SVGGElement>('.layer-surface');
    surfaceGroup
      .selectAll<SVGPolygonElement, Surface3DQuad>('polygon.surface-quad')
      .data(scene.quads, (q) => q.id)
      .join('polygon')
      .attr('class', 'surface-quad')
      .attr('data-quad-id', (q) => q.id)
      .attr('points', (q) => polygonPoints(q.points))
      .attr('fill', (q) => {
        const base = d3.hsl(colorInterpolator(q.normZ));
        base.l = Math.max(0.18, Math.min(0.68, base.l * q.shadeFactor));
        return base.formatHex();
      })
      .attr('fill-opacity', (q) => (q.touchesOptimalBasin ? 0.96 : 0.88))
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, q) => {
        setHoveredQuadId(q.id);
        setSelectedCoord({
          cp: q.representativeCell.preventiveCost,
          tau: q.representativeCell.rulThreshold,
        });
      })
      .on('mouseleave', () => {
        setHoveredQuadId(null);
      })
      .on('click', (_event, q) => {
        setSelectedCoord({
          cp: q.representativeCell.preventiveCost,
          tau: q.representativeCell.rulThreshold,
        });
      });

    // 5. Interactive vertex hotspots so users can inspect exact grid points
    const flatVertices = scene.vertices.flat();
    const vertexGroup = svg.select<SVGGElement>('.layer-vertices');
    vertexGroup
      .selectAll<SVGCircleElement, (typeof flatVertices)[number]>('circle.surface-vertex')
      .data(flatVertices, (v) => `${v.preventiveCost}:${v.rulThreshold}`)
      .join('circle')
      .attr('class', 'surface-vertex')
      .attr('cx', (v) => v.projected.sx)
      .attr('cy', (v) => v.projected.sy)
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, v) => {
        setSelectedCoord({ cp: v.preventiveCost, tau: v.rulThreshold });
      })
      .on('click', (_event, v) => {
        setSelectedCoord({ cp: v.preventiveCost, tau: v.rulThreshold });
      });

    // 6. Axis ticks (X = Preventive Cost, Y = RUL Threshold, Z = Maintenance Cost)
    const axisGroup = svg.select<SVGGElement>('.layer-axes');

    axisGroup
      .selectAll<SVGLineElement, (typeof scene.xTicks)[number]>('line.x-tick')
      .data(scene.xTicks)
      .join('line')
      .attr('class', 'x-tick')
      .attr('x1', (d) => d.anchor.sx)
      .attr('y1', (d) => d.anchor.sy)
      .attr('x2', (d) => d.outer.sx)
      .attr('y2', (d) => d.outer.sy)
      .attr('stroke', '#64748B')
      .attr('stroke-width', 1);

    axisGroup
      .selectAll<SVGTextElement, (typeof scene.xTicks)[number]>('text.x-tick-label')
      .data(scene.xTicks)
      .join('text')
      .attr('class', 'x-tick-label fill-slate-300 font-mono text-[10px]')
      .attr('x', (d) => d.outer.sx + (d.outer.sx - d.anchor.sx) * 0.45)
      .attr('y', (d) => d.outer.sy + 11)
      .attr('text-anchor', 'middle')
      .text((d) => d.label);

    axisGroup
      .selectAll<SVGLineElement, (typeof scene.yTicks)[number]>('line.y-tick')
      .data(scene.yTicks)
      .join('line')
      .attr('class', 'y-tick')
      .attr('x1', (d) => d.anchor.sx)
      .attr('y1', (d) => d.anchor.sy)
      .attr('x2', (d) => d.outer.sx)
      .attr('y2', (d) => d.outer.sy)
      .attr('stroke', '#64748B')
      .attr('stroke-width', 1);

    axisGroup
      .selectAll<SVGTextElement, (typeof scene.yTicks)[number]>('text.y-tick-label')
      .data(scene.yTicks)
      .join('text')
      .attr('class', 'y-tick-label fill-slate-300 font-mono text-[10px]')
      .attr('x', (d) => d.outer.sx + (d.outer.sx >= d.anchor.sx ? 6 : -6))
      .attr('y', (d) => d.outer.sy + 3)
      .attr('text-anchor', (d) => (d.outer.sx >= d.anchor.sx ? 'start' : 'end'))
      .text((d) => d.label);

    axisGroup
      .selectAll<SVGLineElement, (typeof scene.zTicks)[number]>('line.z-tick')
      .data(scene.zTicks)
      .join('line')
      .attr('class', 'z-tick')
      .attr('x1', (d) => d.anchor.sx)
      .attr('y1', (d) => d.anchor.sy)
      .attr('x2', (d) => d.outer.sx)
      .attr('y2', (d) => d.outer.sy)
      .attr('stroke', '#64748B')
      .attr('stroke-width', 1);

    axisGroup
      .selectAll<SVGTextElement, (typeof scene.zTicks)[number]>('text.z-tick-label')
      .data(scene.zTicks)
      .join('text')
      .attr('class', 'z-tick-label fill-slate-300 font-mono text-[10px]')
      .attr('x', (d) => d.outer.sx - 4)
      .attr('y', (d) => d.outer.sy + 3)
      .attr('text-anchor', 'end')
      .text((d) => d.label);
  }, [scene, colorInterpolator]);

  // Lightweight highlight update on quad hover / vertex selection without rebuilding mesh
  useEffect(() => {
    const svgNode = svgRef.current;
    if (!svgNode) return;
    const svg = d3.select(svgNode);

    svg
      .select<SVGGElement>('.layer-surface')
      .selectAll<SVGPolygonElement, Surface3DQuad>('polygon.surface-quad')
      .attr('stroke', (q) => {
        if (hoveredQuadId === q.id) return '#F8FAFC';
        if (q.containsGlobalMin) return '#34D399';
        if (q.touchesOptimalBasin) return 'rgba(52, 211, 153, 0.55)';
        return 'rgba(15, 23, 42, 0.68)';
      })
      .attr('stroke-width', (q) => {
        if (hoveredQuadId === q.id) return 1.8;
        if (q.containsGlobalMin) return 1.6;
        if (q.touchesOptimalBasin) return 1.1;
        return 0.75;
      });

    type SurfaceVertex = (typeof scene.vertices)[number][number];
    svg
      .select<SVGGElement>('.layer-vertices')
      .selectAll<SVGCircleElement, SurfaceVertex>('circle.surface-vertex')
      .attr('r', (v) => {
        if (v.isGlobalMin) return 5.5;
        if (
          selectedCoord &&
          selectedCoord.cp === v.preventiveCost &&
          selectedCoord.tau === v.rulThreshold
        ) {
          return 4.5;
        }
        return v.isInOptimalBasin ? 2.6 : 1.7;
      })
      .attr('fill', (v) => {
        if (v.isGlobalMin) return '#10B981';
        if (
          selectedCoord &&
          selectedCoord.cp === v.preventiveCost &&
          selectedCoord.tau === v.rulThreshold
        ) {
          return '#F8FAFC';
        }
        return v.isInOptimalBasin ? '#6EE7B7' : 'rgba(226, 232, 240, 0.35)';
      })
      .attr('stroke', (v) => (v.isGlobalMin ? '#080B12' : 'none'))
      .attr('stroke-width', (v) => (v.isGlobalMin ? 1.8 : 0));
  }, [hoveredQuadId, selectedCoord, scene]);

  const handleOrbitKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setCamera((prev) => ({ ...prev, yawDeg: normalizeYaw(prev.yawDeg - 10) }));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setCamera((prev) => ({ ...prev, yawDeg: normalizeYaw(prev.yawDeg + 10) }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCamera((prev) => ({ ...prev, pitchDeg: clampPitch(prev.pitchDeg + 8) }));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCamera((prev) => ({ ...prev, pitchDeg: clampPitch(prev.pitchDeg - 8) }));
    }
  };

  const gMin = scene.globalMinVertex;
  const activeV = scene.activeVertex;
  const showActiveSeparate =
    activeV !== null &&
    (activeV.preventiveCost !== gMin.preventiveCost ||
      activeV.rulThreshold !== gMin.rulThreshold);

  if (!hasSufficientGrid) {
    return (
      <section
        data-testid="sensitivity-3d-empty"
        className="rounded-lg border border-dashed border-slate-700 bg-[#0E131D] p-6 text-center space-y-1.5"
      >
        <div className="text-sm font-medium text-slate-200">
          3D Cost Surface Requires at Least a 2×2 Parameter Grid
        </div>
        <p className="text-xs text-slate-400">
          Insufficient (Cp, τ) surface cells available to construct a 3D mesh.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-slate-800 bg-[#0E131D] p-5 space-y-4"
      aria-label="3D Maintenance Cost Surface Plot"
    >
      {/* Header & Camera Presets */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            3D Maintenance Cost Surface (D3 Projection — {policyBasis === 'threshold' ? 'RUL Threshold' : 'Risk-Aware Conformal'})
          </h3>
          <p className="text-xs text-slate-400">
            {evalEngineCount !== undefined ? `Evaluated on ${evalEngineCount} synthetic eval engines · ` : ''}
            Z: Maintenance Cost ($/cyc) vs X: Preventive Cost Cp ($) and Y: RUL Threshold τ (cyc). Drag to orbit or click any mesh region.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap items-center gap-0.5 rounded-md border border-slate-700 bg-[#080B12] p-0.5"
            role="group"
            aria-label="3D Camera Angle Presets"
          >
            {CAMERA_PRESETS.map((preset) => {
              const isCurrent =
                Math.abs(camera.yawDeg - preset.camera.yawDeg) < 2 &&
                Math.abs(camera.pitchDeg - preset.camera.pitchDeg) < 2;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isCurrent}
                  onClick={() => setCamera(preset.camera)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                    isCurrent
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div
            className="flex items-center rounded-md border border-slate-700 bg-[#080B12] p-0.5 text-[11px] font-mono"
            role="group"
            aria-label="Keyboard orbit step controls"
          >
            <button
              type="button"
              onClick={() => setCamera((p) => ({ ...p, yawDeg: normalizeYaw(p.yawDeg - 15) }))}
              aria-label="Rotate surface yaw left 15 degrees"
              className="px-2 py-1 text-slate-300 hover:text-cyan-300 rounded"
            >
              Yaw −
            </button>
            <button
              type="button"
              onClick={() => setCamera((p) => ({ ...p, yawDeg: normalizeYaw(p.yawDeg + 15) }))}
              aria-label="Rotate surface yaw right 15 degrees"
              className="px-2 py-1 text-slate-300 hover:text-cyan-300 rounded"
            >
              Yaw +
            </button>
            <button
              type="button"
              onClick={() => setCamera((p) => ({ ...p, pitchDeg: clampPitch(p.pitchDeg + 10) }))}
              aria-label="Tilt surface pitch up 10 degrees"
              className="px-2 py-1 text-slate-300 hover:text-cyan-300 rounded"
            >
              Pitch +
            </button>
            <button
              type="button"
              onClick={() => setCamera((p) => ({ ...p, pitchDeg: clampPitch(p.pitchDeg - 10) }))}
              aria-label="Tilt surface pitch down 10 degrees"
              className="px-2 py-1 text-slate-300 hover:text-cyan-300 rounded"
            >
              Pitch −
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCamera(DEFAULT_SURFACE_3D_CAMERA)}
            aria-label="Reset 3D camera view"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-[#080B12] px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:text-slate-100 hover:bg-slate-800 whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      </div>

      {/* Color Scale & Global Minimum Region Callout Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800/90 bg-[#080B12] px-3.5 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono tabular-nums">
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
            Global Min:{' '}
            <strong data-testid="surface-3d-global-min">
              ${scene.basin.globalMinCost.toFixed(3)}/cyc
            </strong>{' '}
            (Cp=${gMin.preventiveCost} · τ={gMin.rulThreshold}c)
          </span>
          <span className="text-slate-400">
            Optimal Basin (+10%):{' '}
            <strong className="text-slate-200">
              Cp ${scene.basin.cpMin}–${scene.basin.cpMax} · τ {scene.basin.tauMin}–{scene.basin.tauMax}c
            </strong>{' '}
            ({scene.basin.basinCells.length} pts)
          </span>
        </div>

        {/* Continuous D3 gradient legend */}
        <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-slate-400">
          <span>${scene.zMin.toFixed(3)}/cyc</span>
          <div
            className="h-2.5 w-32 sm:w-40 rounded-xs border border-slate-700"
            style={{
              background:
                'linear-gradient(90deg, #10B981 0%, #06B6D4 34%, #F59E0B 68%, #F43F5E 100%)',
            }}
            aria-label="Maintenance cost color scale from low emerald to high rose"
          />
          <span>${scene.zMax.toFixed(3)}/cyc</span>
        </div>
      </div>

      {/* D3 3D Surface SVG Canvas */}
      <div className="relative rounded-md border border-slate-800/80 bg-[#080B12] overflow-hidden">
        {hoveredQuad && (
          <div
            data-testid="surface-3d-hover-card"
            className="pointer-events-none absolute top-2.5 left-2.5 z-10 rounded-md border border-slate-700/90 bg-[#0E131D]/95 px-3 py-2 text-[11px] font-mono tabular-nums shadow-lg space-y-0.5"
          >
            <div className="font-semibold text-slate-100">
              Cp=${hoveredQuad.representativeCell.preventiveCost} · τ={hoveredQuad.representativeCell.rulThreshold} cyc
            </div>
            <div className="text-cyan-300">
              Cost: ${inspectedCost.toFixed(3)}/cyc ({deltaFromMinPct <= 0.1 ? 'Global Min' : `+${deltaFromMinPct.toFixed(1)}% vs min`})
            </div>
            <div className="text-slate-300">
              Failures: {inspectedFailPct.toFixed(1)}% · Waste: {inspectedWastedRul.toFixed(1)}c
            </div>
          </div>
        )}
        <svg
          ref={svgRef}
          data-testid="sensitivity-3d-svg"
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          className="w-full h-auto block select-none touch-none cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-cyan-400"
          role="img"
          tabIndex={0}
          onKeyDown={handleOrbitKeyDown}
          aria-label={`D3 3D surface plot of Maintenance Cost versus Preventive Cost and RUL Threshold for Failure Penalty $${failureCost}`}
        >
          {/* D3-managed layers */}
          <g className="layer-walls" />
          <g className="layer-floor" />
          <g className="layer-z-guides" />
          <g className="layer-surface" />
          <g className="layer-vertices" />
          <g className="layer-axes" />

          {/* Axis Titles */}
          <text
            x={scene.xAxisTitlePos.sx}
            y={Math.min(VIEWBOX_H - 10, scene.xAxisTitlePos.sy + 14)}
            textAnchor="middle"
            stroke="#080B12"
            strokeWidth={3}
            paintOrder="stroke"
            className="fill-cyan-300 text-[11px] font-mono font-semibold"
          >
            X: Preventive Cost Cp ($)
          </text>

          <text
            x={Math.min(VIEWBOX_W - 14, scene.yAxisTitlePos.sx + 8)}
            y={scene.yAxisTitlePos.sy + 4}
            textAnchor={scene.yAxisTitlePos.sx >= 404 ? 'start' : 'end'}
            stroke="#080B12"
            strokeWidth={3}
            paintOrder="stroke"
            className="fill-amber-300 text-[11px] font-mono font-semibold"
          >
            Y: RUL Threshold τ (cyc)
          </text>

          <text
            x={Math.max(12, scene.zAxisTitlePos.sx)}
            y={Math.max(18, scene.zAxisTitlePos.sy)}
            textAnchor="start"
            stroke="#080B12"
            strokeWidth={3}
            paintOrder="stroke"
            className="fill-emerald-300 text-[11px] font-mono font-semibold"
          >
            Z: Maintenance Cost ($/cyc)
          </text>

          {/* Active Simulator Operating Point Drop-Line & Pin */}
          {showActiveSeparate && activeV && scene.activeFloor && (
            <g data-testid="surface-3d-active-pin" className="pointer-events-none">
              <line
                x1={activeV.projected.sx}
                y1={activeV.projected.sy}
                x2={scene.activeFloor.sx}
                y2={scene.activeFloor.sy}
                stroke="#F59E0B"
                strokeWidth={1.3}
                strokeDasharray="3 3"
                opacity={0.85}
              />
              <circle
                cx={scene.activeFloor.sx}
                cy={scene.activeFloor.sy}
                r={3}
                fill="#F59E0B"
                opacity={0.75}
              />
              <circle
                cx={activeV.projected.sx}
                cy={activeV.projected.sy}
                r={5.5}
                fill="#F59E0B"
                stroke="#080B12"
                strokeWidth={2}
              />
              <text
                x={
                  activeV.projected.sx > VIEWBOX_W - 210
                    ? activeV.projected.sx - 9
                    : activeV.projected.sx + 9
                }
                y={Math.max(18, activeV.projected.sy - 8)}
                textAnchor={activeV.projected.sx > VIEWBOX_W - 210 ? 'end' : 'start'}
                fill="#FCD34D"
                stroke="#080B12"
                strokeWidth={3}
                paintOrder="stroke"
                className="text-[10px] font-mono font-semibold"
              >
                Active (Cp=${activeV.preventiveCost}, τ={activeV.rulThreshold})
              </text>
            </g>
          )}

          {/* Global Minimum Beacon Pin & Vertical Drop-Line to XY Floor */}
          <g data-testid="surface-3d-global-pin" className="pointer-events-none">
            <line
              x1={gMin.projected.sx}
              y1={gMin.projected.sy}
              x2={scene.globalMinFloor.sx}
              y2={scene.globalMinFloor.sy}
              stroke="#34D399"
              strokeWidth={1.6}
              strokeDasharray="3 3"
            />
            <circle
              cx={scene.globalMinFloor.sx}
              cy={scene.globalMinFloor.sy}
              r={3.5}
              fill="#34D399"
              opacity={0.8}
            />
            <line
              x1={gMin.projected.sx}
              y1={gMin.projected.sy}
              x2={gMin.projected.sx < 380 ? gMin.projected.sx + 20 : gMin.projected.sx}
              y2={Math.max(24, gMin.projected.sy - 36)}
              stroke="#34D399"
              strokeWidth={1.6}
            />
            <circle
              cx={gMin.projected.sx}
              cy={gMin.projected.sy}
              r={6.5}
              fill="#10B981"
              stroke="#F8FAFC"
              strokeWidth={2}
            />
            <text
              x={
                gMin.projected.sx < 380
                  ? gMin.projected.sx + 24
                  : Math.max(150, Math.min(VIEWBOX_W - 150, gMin.projected.sx))
              }
              y={Math.max(16, gMin.projected.sy - 40)}
              textAnchor={gMin.projected.sx < 380 ? 'start' : 'middle'}
              fill="#6EE7B7"
              stroke="#080B12"
              strokeWidth={3.5}
              paintOrder="stroke"
              className="text-[11px] font-mono font-bold"
            >
              Global Min ${scene.basin.globalMinCost.toFixed(3)}/c (Cp=${gMin.preventiveCost}, τ={gMin.rulThreshold})
            </text>
          </g>
        </svg>

        <div className="px-3.5 py-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
          <span>
            Orbit: Yaw {camera.yawDeg.toFixed(0)}° · Pitch {camera.pitchDeg.toFixed(0)}°
          </span>
          <span>
            Failure Penalty Cf=${failureCost} · Emerald mesh outline marks +10% Global Minimum Basin
          </span>
        </div>
      </div>

      {/* Inspected Point Telemetry & Simulator Action */}
      <div className="pt-1 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300 font-mono tabular-nums">
          <span>
            Selected:{' '}
            <strong className="text-slate-100">
              Cp=${inspectedCell.preventiveCost} · τ={inspectedCell.rulThreshold} cyc
            </strong>
          </span>
          <span>
            Cost:{' '}
            <strong className="text-cyan-300">${inspectedCost.toFixed(3)}/cyc</strong>{' '}
            ({deltaFromMinPct <= 0.1 ? 'Global Minimum' : `+${deltaFromMinPct.toFixed(1)}% vs min`})
          </span>
          <span>
            Risk:{' '}
            <strong className="text-slate-200">{inspectedFailPct.toFixed(1)}% fail</strong> ·{' '}
            {inspectedWastedRul.toFixed(1)}c wasted RUL
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setSelectedCoord({
                cp: gMin.preventiveCost,
                tau: gMin.rulThreshold,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors whitespace-nowrap shrink-0"
          >
            <Crosshair className="w-3.5 h-3.5" />
            Select Global Minimum
          </button>

          <button
            type="button"
            onClick={() => onApplyPoint(inspectedCell.preventiveCost, inspectedCell.rulThreshold)}
            className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
          >
            Apply to Simulator
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <TechnicalInterpretation
        title="3D Cost Surface Topology"
        summary="Isolates the global minimum cost basin between failure penalties and premature replacement"
        whatItShows="The U-shaped trough shows the optimal economic tradeoff between late catastrophic failure penalties (steep crimson cliff at low τ) and early premature preventive swaps (gradual upward slope at high τ). Emerald edges mark the +10% Global Minimum Basin where operating points remain cost-resilient."
        sampleScope={evalEngineCount !== undefined ? `${evalEngineCount} synthetic evaluation engines per mesh vertex` : undefined}
        metrics={['cost_per_cycle', 'failure_rate', 'wasted_useful_life', 'preventive_replacement']}
      />
    </section>
  );
};

/**
 * sketchTools.ts - FIXED & COMPLETE
 * - LineTool: Single segment mode (Reset after draw)
 * - Trim: Uses split-and-delete logic
 * - Selection: Increased tolerance
 */

import * as THREE from 'three';
import type { Point2D, Plane, SketchEntity } from '../core/types';
import type { Sketcher } from '../sketcher/Sketcher';
import { 
  projectPointOnLine,
  vecDist,
} from '../geometry/SketchMath';

// INCREASED TOLERANCE (easier to hit lines)
const HIT_TOLERANCE = 2.0; 
const SNAP_DISTANCE = 0.8;

// --- Helpers ---
interface SnapPoint {
  point: Point2D;
  type: 'node' | 'midpoint' | 'center' | 'intersection';
  id?: string;
}

function getSegmentsFromEntity(entity: SketchEntity, sketcher: Sketcher): { p1: Point2D, p2: Point2D }[] {
  const segments: { p1: Point2D, p2: Point2D }[] = [];
  const nodes = sketcher.getNodes();

  const getP = (id: string) => {
    const n = nodes.get(id);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

  if (entity.type === 'line') {
    segments.push({ p1: getP(entity.startNodeId), p2: getP(entity.endNodeId) });
  } 
  else if (entity.type === 'polyline') {
    for (let i = 0; i < entity.nodeIds.length - 1; i++) {
      segments.push({ p1: getP(entity.nodeIds[i]), p2: getP(entity.nodeIds[i+1]) });
    }
    if (entity.closed) {
        segments.push({ p1: getP(entity.nodeIds[entity.nodeIds.length-1]), p2: getP(entity.nodeIds[0]) });
    }
  } 
  else if (entity.type === 'rectangle') {
    const p1 = getP(entity.cornerNodeId);
    const p2 = { x: p1.x + entity.width, y: p1.y };
    const p3 = { x: p1.x + entity.width, y: p1.y + entity.height };
    const p4 = { x: p1.x, y: p1.y + entity.height };
    segments.push({ p1: p1, p2: p2 });
    segments.push({ p1: p2, p2: p3 });
    segments.push({ p1: p3, p2: p4 });
    segments.push({ p1: p4, p2: p1 });
  }
  return segments;
}

// --- SNAP FINDER ---
class SnapPointFinder {
  private sketcher: Sketcher;
  
  constructor(sketcher: Sketcher) {
    this.sketcher = sketcher;
  }

  getAllSnapPoints(): SnapPoint[] {
    const snapPoints: SnapPoint[] = [];
    const nodes = this.sketcher.getNodes();
    const entities = this.sketcher.getEntities();

    for (const node of nodes.values()) {
        snapPoints.push({ point: { x: node.x, y: node.y }, type: 'node', id: node.id });
    }

    for (const entity of entities) {
      if (entity.type === 'line') {
        const n1 = nodes.get(entity.startNodeId);
        const n2 = nodes.get(entity.endNodeId);
        if (n1 && n2) {
            const mid = { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
            snapPoints.push({ point: mid, type: 'midpoint', id: entity.id });
        }
      }
    }
    return snapPoints;
  }

  findNearestSnap(point: Point2D, maxDistance: number = SNAP_DISTANCE): SnapPoint | null {
    const snapPoints = this.getAllSnapPoints();
    let nearest: SnapPoint | null = null;
    let minDist = maxDistance;

    for (const snap of snapPoints) {
      const dist = vecDist(point, snap.point);
      if (dist < minDist) {
        minDist = dist;
        nearest = snap;
      }
    }
    return nearest;
  }
}

// --- BASE TOOL ---
export abstract class SketchTool {
  protected canvas: HTMLCanvasElement | null = null;
  protected camera: THREE.Camera | null = null;
  protected sketcher: Sketcher;
  protected plane: Plane | null = null;
  protected isActive: boolean = false;
  protected snapFinder: SnapPointFinder | null = null;

  constructor(canvas: HTMLCanvasElement | null, camera: THREE.Camera | null, sketcher: Sketcher, plane: Plane | null) {
    this.canvas = canvas;
    this.camera = camera;
    this.sketcher = sketcher;
    this.plane = plane;
  }

  protected screenToPlane(screenX: number, screenY: number): Point2D | null {
    if (!this.canvas || !this.camera || !this.plane) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((screenX - rect.left) / rect.width) * 2 - 1;
    const y = -((screenY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const planeNormal = new THREE.Vector3(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z).normalize();
    const planeOrigin = new THREE.Vector3(this.plane.origin.x, this.plane.origin.y, this.plane.origin.z);
    const threePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planeOrigin);
    const intersect = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(threePlane, intersect);
    if (!hit) return null;
    const xAxis = new THREE.Vector3(this.plane.xAxis.x, this.plane.xAxis.y, this.plane.xAxis.z).normalize();
    const yAxis = new THREE.Vector3(this.plane.yAxis.x, this.plane.yAxis.y, this.plane.yAxis.z).normalize();
    const localVec = hit.clone().sub(planeOrigin);
    return { x: localVec.dot(xAxis), y: localVec.dot(yAxis) };
  }

  protected applySnapping(point: Point2D): { point: Point2D, snapInfo: SnapPoint | null } {
    if (!this.sketcher) return { point, snapInfo: null };
    this.snapFinder = new SnapPointFinder(this.sketcher);
    const snap = this.snapFinder.findNearestSnap(point);
    return { point: snap ? snap.point : point, snapInfo: snap };
  }
  
  getSnapInfo(): SnapPoint | null { return null; }
  activate(): void { this.isActive = true; }
  deactivate(): void { this.isActive = false; this.reset(); }
  abstract reset(): void;
  abstract handleMouseMove(event: MouseEvent): void;
  abstract handleClick(event: MouseEvent): void;
  abstract handleRightClick(event: MouseEvent): void;
  abstract handleKeyDown(event: KeyboardEvent): void;
}

// --- POLYLINE TOOL ---
export class PolylineTool extends SketchTool {
  private points: Point2D[] = [];
  private currentPoint: Point2D | null = null;
  private currentSnapInfo: SnapPoint | null = null;
  
  reset(): void { this.points = []; this.currentPoint = null; this.currentSnapInfo = null; }
  
  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if(p) {
        const { point: snapped, snapInfo } = this.applySnapping(p);
        this.currentSnapInfo = snapInfo;
        if (this.points.length > 2 && vecDist(snapped, this.points[0]) < SNAP_DISTANCE) {
            this.currentPoint = { ...this.points[0] };
        } else {
            this.currentPoint = snapped;
        }
    }
  }

  handleClick(event: MouseEvent): void {
    if (!this.isActive) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return;
    const { point: snapped } = this.applySnapping(p);

    if (this.points.length === 0) {
        this.points.push(snapped);
    } else {
        const distToStart = vecDist(snapped, this.points[0]);
        if (this.points.length >= 3 && distToStart < SNAP_DISTANCE) {
            this.sketcher.addPolyline(this.points, true);
            this.reset();
            return;
        }
        this.points.push(snapped);
    }
  }

  handleRightClick(event: MouseEvent): void { 
    if (this.points.length >= 2) { 
        this.sketcher.addPolyline(this.points, false); 
        this.reset(); 
    } else {
        this.reset();
    }
  }
  handleKeyDown(event: KeyboardEvent): void { if (event.key === 'Escape') this.reset(); }
  getPoints() { return this.points; }
  getCurrentPoint() { return this.currentPoint; }
  getSnapInfo() { return this.currentSnapInfo; }
  canClose() { return this.points.length >= 3 && this.currentPoint && vecDist(this.currentPoint, this.points[0]) < SNAP_DISTANCE; }
}

// --- LINE TOOL (Single Segment) ---
export class LineTool extends SketchTool {
  private startPoint: Point2D | null = null;
  private endPoint: Point2D | null = null;
  private currentSnapInfo: SnapPoint | null = null;
  
  reset(): void { 
    this.startPoint = null; 
    this.endPoint = null; 
    this.currentSnapInfo = null;
  }
  
  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return;
    
    const { point: snapped, snapInfo } = this.applySnapping(p);
    this.currentSnapInfo = snapInfo;
    
    if (this.startPoint) {
      this.endPoint = snapped;
    }
  }
  
  handleClick(event: MouseEvent): void {
    if (!this.isActive) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return;
    
    const { point: snapped } = this.applySnapping(p);
    
    if (!this.startPoint) {
      // 1. Click: Set START
      this.startPoint = snapped;
    } else {
      // 2. Click: Set END and CREATE
      this.endPoint = snapped;
      this.sketcher.addLine(this.startPoint, this.endPoint);
      this.reset();
    }
  }
  
  handleRightClick(event: MouseEvent): void { this.reset(); }
  handleKeyDown(event: KeyboardEvent): void { if (event.key === 'Escape') this.reset(); }
  getStartPoint() { return this.startPoint; }
  getEndPoint() { return this.endPoint; }
  getSnapInfo() { return this.currentSnapInfo; }
}

// --- CIRCLE TOOL ---
export class CircleTool extends SketchTool {
  private center: Point2D | null = null;
  private radius: number = 0;
  
  reset(): void { this.center = null; this.radius = 0; }
  
  handleMouseMove(event: MouseEvent): void {
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (this.isActive && this.center && p) this.radius = vecDist(p, this.center);
  }
  
  handleClick(event: MouseEvent): void {
    if (!this.isActive) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return;
    const { point: snapped } = this.applySnapping(p);
    
    if (!this.center) {
      this.center = snapped;
    } else {
        if (this.radius > 0.1) this.sketcher.addCircle(this.center, this.radius);
        this.reset();
    }
  }
  handleRightClick(event: MouseEvent): void { this.reset(); }
  handleKeyDown(e: KeyboardEvent): void { if (e.key === 'Escape') this.reset(); }
  getCenter() { return this.center; }
  getRadius() { return this.radius; }
}

// --- RECTANGLE TOOL ---
export class RectangleTool extends SketchTool {
  private corner: Point2D | null = null;
  private opposite: Point2D | null = null;
  
  reset(): void { this.corner = null; this.opposite = null; }
  
  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if(p) {
        const { point: snapped } = this.applySnapping(p);
        if (this.corner) this.opposite = snapped;
    }
  }
  
  handleClick(event: MouseEvent): void {
    if (!this.isActive) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return;
    const { point: snapped } = this.applySnapping(p);
    
    if (!this.corner) {
      this.corner = snapped;
    } else {
        this.opposite = snapped;
        const w = this.opposite.x - this.corner.x;
        const h = this.opposite.y - this.corner.y;
        if (Math.abs(w) > 0.1 && Math.abs(h) > 0.1) this.sketcher.addRectangle(this.corner, w, h);
        this.reset();
    }
  }
  handleRightClick(event: MouseEvent): void { this.reset(); }
  handleKeyDown(e: KeyboardEvent): void { if (e.key === 'Escape') this.reset(); }
  getCorner() { return this.corner; }
  getOppositeCorner() { return this.opposite; }
}

// --- MODIFICATION TOOLS ---

abstract class ModificationTool extends SketchTool {
  handleRightClick(event: MouseEvent): void { this.deactivate(); }
  handleKeyDown(e: KeyboardEvent): void { if(e.key === 'Escape') this.deactivate(); }
  abstract handleClick(event: MouseEvent): void;
  
  // FIXED DETECTION WITH TOLERANCE
  protected findEntityAtMouse(event: MouseEvent): { id: string, point: Point2D } | null {
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return null;

    const entities = this.sketcher.getEntities();
    let closestId: string | null = null;
    let minDist = HIT_TOLERANCE;

    for (const entity of entities) {
        const segments = getSegmentsFromEntity(entity, this.sketcher);
        for(const seg of segments) {
            const proj = projectPointOnLine(p, seg.p1, seg.p2);
            if (proj.dist < minDist) {
                minDist = proj.dist;
                closestId = entity.id;
            }
        }
    }
    return closestId ? { id: closestId, point: p } : null;
  }
}

export class TrimTool extends ModificationTool {
  reset(): void {}
  handleMouseMove(event: MouseEvent): void {}
  handleClick(event: MouseEvent): void {
    const hit = this.findEntityAtMouse(event);
    if (hit) this.sketcher.trimEntity(hit.id, hit.point);
  }
}

export class ExtendTool extends ModificationTool {
  reset(): void {}
  handleMouseMove(event: MouseEvent): void {}
  handleClick(event: MouseEvent): void {
    const hit = this.findEntityAtMouse(event);
    if (hit) this.sketcher.extendEntity(hit.id, hit.point);
  }
}

export class OffsetTool extends SketchTool {
  private selectedId: string | null = null;
  
  reset(): void { this.selectedId = null; }
  handleMouseMove(event: MouseEvent): void {}
  handleRightClick(event: MouseEvent): void { this.reset(); }
  handleKeyDown(e: KeyboardEvent): void { if (e.key === 'Escape') this.reset(); }

  handleClick(event: MouseEvent): void {
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return;

    if (!this.selectedId) {
      let minDist = HIT_TOLERANCE;
      const entities = this.sketcher.getEntities();
      for (const entity of entities) {
        const segments = getSegmentsFromEntity(entity, this.sketcher);
        for(const seg of segments) {
            const proj = projectPointOnLine(p, seg.p1, seg.p2);
            if (proj.dist < minDist) {
                minDist = proj.dist;
                this.selectedId = entity.id;
            }
        }
      }
      if (this.selectedId) console.log("Offset: Selected. Click for side/dist.");
      return;
    }

    const input = prompt("Offset distance:", "5");
    if (input) {
        const dist = parseFloat(input);
        if (!isNaN(dist)) this.sketcher.offsetEntity(this.selectedId, dist, p);
    }
    this.reset();
  }
  
  getPreviewArrow() { return null; }
}
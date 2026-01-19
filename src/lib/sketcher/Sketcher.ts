/**
 * ============================================================================
 * 2D SKETCHER MODULE (NODE-BASED TOPOLOGY)
 * ============================================================================
 * * This module handles 2D sketch creation and editing using a topological
 * approach where geometry is defined by Nodes (points) and Entities (connections).
 * * Features:
 * - Automatic "magnetic" snapping (Node acquisition)
 * - Line, polyline, rectangle, circle creation
 * - Automatic profile detection (closed contours) for fill rendering
 * - Constraints solver integration (Vertical/Horizontal)
 * - Geometric operations (Trim, Extend, Offset) adapted for topology
 * * @module sketcher/Sketcher
 */

import type {
  CADSketch,
  SketchEntity,
  SketchNode,
  SketchLine,
  SketchPolyline,
  SketchRectangle,
  SketchCircle,
  SketchPoint,
  Constraint,
  Point2D,
  Plane,
  VerticalConstraint,
  HorizontalConstraint,
  Result
} from '../core/types';
import { generateId } from '../stores/cadStore';
import { SketchMath } from '../geometry/SketchMath';
import { solveConstraints } from './ConstraintSolver';

/**
 * Tolerance for point snapping (Node acquisition)
 */
const SNAP_DISTANCE = 0.5;

/**
 * ============================================================================
 * SKETCHER CLASS
 * ============================================================================
 * Main class for managing sketch geometry
 */
export class Sketcher {
  private id: string;
  private plane: Plane;
  
  // Data Storage
  private nodes: Map<string, SketchNode> = new Map();
  private entities: Map<string, SketchEntity> = new Map();
  private constraints: Map<string, Constraint> = new Map();

  constructor(sketchId: string, plane: Plane) {
    this.id = sketchId;
    this.plane = plane;
  }

  // ==========================================================================
  // NODE MANAGEMENT (TOPOLOGY)
  // ==========================================================================

  private acquireNode(x: number, y: number): string {
    for (const node of this.nodes.values()) {
      const dx = Math.abs(node.x - x);
      const dy = Math.abs(node.y - y);
      if (dx < SNAP_DISTANCE && dy < SNAP_DISTANCE) {
        return node.id; 
      }
    }

    const newNode: SketchNode = {
      id: generateId(),
      x,
      y
    };
    this.nodes.set(newNode.id, newNode);
    return newNode.id;
  }

  getNode(id: string): SketchNode | undefined {
    return this.nodes.get(id);
  }

  private getPoint(nodeId: string): Point2D | null {
    const n = this.nodes.get(nodeId);
    return n ? { x: n.x, y: n.y } : null;
  }

  // ==========================================================================
  // ENTITY CREATION
  // ==========================================================================

  addLine(start: Point2D, end: Point2D): SketchLine {
    const startId = this.acquireNode(start.x, start.y);
    const endId = this.acquireNode(end.x, end.y);

    const line: SketchLine = {
      type: 'line',
      id: generateId(),
      startNodeId: startId,
      endNodeId: endId,
      construction: false,
      connections: []
    };

    this.entities.set(line.id, line);
    return line;
  }

  addPolyline(points: Point2D[], closed: boolean): SketchPolyline {
    const nodeIds = points.map(p => this.acquireNode(p.x, p.y));

    const poly: SketchPolyline = {
      type: 'polyline',
      id: generateId(),
      nodeIds,
      closed,
      construction: false,
      connections: []
    };

    this.entities.set(poly.id, poly);
    return poly;
  }

  addRectangle(corner: Point2D, width: number, height: number): SketchRectangle {
    const cornerId = this.acquireNode(corner.x, corner.y);

    const rect: SketchRectangle = {
      type: 'rectangle',
      id: generateId(),
      cornerNodeId: cornerId,
      width,
      height,
      construction: false,
      connections: []
    };

    this.entities.set(rect.id, rect);
    return rect;
  }

  addCircle(center: Point2D, radius: number): SketchCircle {
    const centerId = this.acquireNode(center.x, center.y);

    const circle: SketchCircle = {
      type: 'circle',
      id: generateId(),
      centerNodeId: centerId,
      radius,
      construction: false,
      connections: []
    };

    this.entities.set(circle.id, circle);
    return circle;
  }

  addPoint(pos: Point2D): SketchPoint {
    const nodeId = this.acquireNode(pos.x, pos.y);
    
    const point: SketchPoint = {
      type: 'point',
      id: generateId(),
      nodeId: nodeId,
      construction: false,
      connections: []
    };
    
    this.entities.set(point.id, point);
    return point;
  }

  // ==========================================================================
  // DATA ACCESS
  // ==========================================================================

  getEntities(): SketchEntity[] {
    return Array.from(this.entities.values());
  }
  
  getNodes(): Map<string, SketchNode> {
    return this.nodes;
  }

  getAllConstraints(): Constraint[] {
    return Array.from(this.constraints.values());
  }

  getConstraints(): Constraint[] {
    return this.getAllConstraints();
  }

  clear(): void {
    this.entities.clear();
    this.nodes.clear();
    this.constraints.clear();
  }

  removeEntity(entityId: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    this.entities.delete(entityId);
    
    for (const [id, constraint] of this.constraints) {
      if (constraint.entityIds.includes(entityId)) {
        this.constraints.delete(id);
      }
    }
    
    this.cleanupUnusedNodes();
  }

  private cleanupUnusedNodes() {
    const usedNodeIds = new Set<string>();
    
    for (const ent of this.entities.values()) {
      if (ent.type === 'line') {
        usedNodeIds.add(ent.startNodeId);
        usedNodeIds.add(ent.endNodeId);
      } else if (ent.type === 'polyline') {
        ent.nodeIds.forEach(id => usedNodeIds.add(id));
      } else if (ent.type === 'rectangle') {
        usedNodeIds.add(ent.cornerNodeId);
      } else if (ent.type === 'circle') {
        usedNodeIds.add(ent.centerNodeId);
      } else if (ent.type === 'point') {
        usedNodeIds.add(ent.nodeId);
      }
    }

    for (const nodeId of this.nodes.keys()) {
      if (!usedNodeIds.has(nodeId)) {
        this.nodes.delete(nodeId);
      }
    }
  }

  updateEntity(entityId: string, updates: Partial<SketchEntity>): void {
    const entity = this.entities.get(entityId);
    if (entity) {
      const updated = { ...entity, ...updates } as SketchEntity;
      this.entities.set(entityId, updated);
      
      const legacyUpdates = updates as any;
      if (entity.type === 'line') {
        if (legacyUpdates.start) {
          const n = this.nodes.get(entity.startNodeId);
          if (n) { n.x = legacyUpdates.start.x; n.y = legacyUpdates.start.y; }
        }
        if (legacyUpdates.end) {
          const n = this.nodes.get(entity.endNodeId);
          if (n) { n.x = legacyUpdates.end.x; n.y = legacyUpdates.end.y; }
        }
      }
    }
  }

  // ==========================================================================
  // HELPERY GEOMETRYCZNE (ROZBIJANIE NA SEGMENTY)
  // ==========================================================================
  
  // Pobiera WSZYSTKIE segmenty (linii, polilinii, prostokątów) do wykrywania kolizji
  private getAllSegments(): { p1: Point2D, p2: Point2D }[] {
    const segments: { p1: Point2D, p2: Point2D }[] = [];
    
    for (const ent of this.entities.values()) {
      if (ent.type === 'line') {
        const p1 = this.getPoint(ent.startNodeId);
        const p2 = this.getPoint(ent.endNodeId);
        if (p1 && p2) segments.push({ p1, p2 });
      } 
      else if (ent.type === 'polyline') {
        for (let i = 0; i < ent.nodeIds.length - 1; i++) {
          const p1 = this.getPoint(ent.nodeIds[i]);
          const p2 = this.getPoint(ent.nodeIds[i+1]);
          if (p1 && p2) segments.push({ p1, p2 });
        }
        if (ent.closed) {
           const p1 = this.getPoint(ent.nodeIds[ent.nodeIds.length - 1]);
           const p2 = this.getPoint(ent.nodeIds[0]);
           if (p1 && p2) segments.push({ p1, p2 });
        }
      }
      else if (ent.type === 'rectangle') {
        const p1 = this.getPoint(ent.cornerNodeId);
        if (p1) {
          const p2 = { x: p1.x + ent.width, y: p1.y };
          const p3 = { x: p1.x + ent.width, y: p1.y + ent.height };
          const p4 = { x: p1.x, y: p1.y + ent.height };
          segments.push({ p1, p2 }, { p1: p2, p2: p3 }, { p1: p3, p2: p4 }, { p1: p4, p2: p1 });
        }
      }
    }
    return segments;
  }

  // Pobiera wszystkie okręgi (do użycia jako granice cięcia/wydłużania)
  private getAllCircles(): { center: Point2D, radius: number }[] {
    const circles: { center: Point2D, radius: number }[] = [];
    for (const ent of this.entities.values()) {
      if (ent.type === 'circle') {
        const c = this.getPoint(ent.centerNodeId);
        if (c) circles.push({ center: c, radius: ent.radius });
      }
    }
    return circles;
  }

  // ==========================================================================
  // CONSTRAINT MANAGEMENT
  // ==========================================================================

  addVerticalConstraint(entityId: string): Result<string> {
    const entity = this.entities.get(entityId);
    if (!entity || entity.type !== 'line') return { success: false, error: 'Target not a line' };

    for (const c of this.constraints.values()) {
      if (c.type === 'vertical' && c.entityIds.includes(entityId)) {
        return { success: false, error: 'Already vertical' };
      }
    }

    const constraint: VerticalConstraint = {
      id: generateId(),
      type: 'vertical',
      entityIds: [entityId],
      enabled: true
    };

    this.constraints.set(constraint.id, constraint);
    this.solveAllConstraints();
    return { success: true, value: constraint.id };
  }

  addHorizontalConstraint(entityId: string): Result<string> {
    const entity = this.entities.get(entityId);
    if (!entity || entity.type !== 'line') return { success: false, error: 'Target not a line' };

    for (const c of this.constraints.values()) {
      if (c.type === 'horizontal' && c.entityIds.includes(entityId)) {
        return { success: false, error: 'Already horizontal' };
      }
    }

    const constraint: HorizontalConstraint = {
      id: generateId(),
      type: 'horizontal',
      entityIds: [entityId],
      enabled: true
    };

    this.constraints.set(constraint.id, constraint);
    this.solveAllConstraints();
    return { success: true, value: constraint.id };
  }

  solveAllConstraints(): void {
    if (this.constraints.size === 0) return;
    const result = solveConstraints(this.nodes, this.entities, this.constraints);
    if (!result.success) {
      console.warn(`[Sketcher] Solve failed`);
    }
  }

  // ==========================================================================
  // PROFILE DETECTION (For Blue Fill)
  // ==========================================================================

  getClosedContours(): Point2D[][] {
    const adj = new Map<string, string[]>();

    const addEdge = (id1: string, id2: string) => {
      if (!adj.has(id1)) adj.set(id1, []);
      if (!adj.has(id2)) adj.set(id2, []);
      // Unikaj duplikatów krawędzi
      if (!adj.get(id1)!.includes(id2)) adj.get(id1)!.push(id2);
      if (!adj.get(id2)!.includes(id1)) adj.get(id2)!.push(id1);
    };

    // Buduj graf ze wszystkich Linii i Polilinii
    for (const ent of this.entities.values()) {
      if (ent.type === 'line') {
        addEdge(ent.startNodeId, ent.endNodeId);
      } else if (ent.type === 'polyline') {
        for (let i = 0; i < ent.nodeIds.length - 1; i++) {
          addEdge(ent.nodeIds[i], ent.nodeIds[i+1]);
        }
        if (ent.closed) {
          addEdge(ent.nodeIds[ent.nodeIds.length-1], ent.nodeIds[0]);
        }
      }
    }

    const cycles: Point2D[][] = [];

    // Dodaj prostokąty (one zawsze są profilami)
    for (const ent of this.entities.values()) {
        if (ent.type === 'rectangle') {
            const p = this.getPoint(ent.cornerNodeId);
            if (p) {
                cycles.push([
                    {x: p.x, y: p.y},
                    {x: p.x + ent.width, y: p.y},
                    {x: p.x + ent.width, y: p.y + ent.height},
                    {x: p.x, y: p.y + ent.height}
                ]);
            }
        }
    }

    // Szukaj cykli
    const nodeKeys = Array.from(adj.keys());
    const visitedPaths = new Set<string>();

    for (const startNodeId of nodeKeys) {
        if ((adj.get(startNodeId)?.length || 0) < 2) continue;

        const stack: { curr: string, path: string[], visited: Set<string> }[] = [];
        stack.push({ curr: startNodeId, path: [startNodeId], visited: new Set([startNodeId]) });

        let limit = 0;
        while(stack.length > 0 && limit++ < 5000) {
            const { curr, path, visited } = stack.pop()!;
            const neighbors = adj.get(curr) || [];

            for (const neighbor of neighbors) {
                // Nie wracaj po tej samej krawędzi od razu
                if (path.length >= 2 && path[path.length - 2] === neighbor) continue;

                if (neighbor === startNodeId && path.length >= 3) {
                    // Mamy cykl!
                    // Sortujemy path żeby stworzyć unikalny podpis
                    const sortedPath = [...path].sort().join('-');
                    if (!visitedPaths.has(sortedPath)) {
                        visitedPaths.add(sortedPath);
                        
                        const contour = path.map(id => {
                            const n = this.nodes.get(id);
                            return { x: n!.x, y: n!.y };
                        });
                        cycles.push(contour);
                    }
                    continue; // Znaleziono zamknięcie, nie idź dalej tą ścieżką
                }

                if (!visited.has(neighbor)) {
                    const newVisited = new Set(visited);
                    newVisited.add(neighbor);
                    stack.push({ curr: neighbor, path: [...path, neighbor], visited: newVisited });
                }
            }
        }
    }

    return cycles;
  }

  // ==========================================================================
  // GEOMETRIC OPERATIONS (TRIM/EXTEND/OFFSET)
  // ==========================================================================

  trimEntity(targetId: string, clickPoint: Point2D): void {
    const target = this.entities.get(targetId);
    if (!target) return;

    // --- CASE 1: LINIA ---
    if (target.type === 'line') {
        const pStart = this.getPoint(target.startNodeId);
        const pEnd = this.getPoint(target.endNodeId);
        if (!pStart || !pEnd) return;

        // Zbieramy inne segmenty i okręgi
        const allSegs = this.getAllSegments().filter(s => 
            !(Math.abs(s.p1.x - pStart.x) < 0.001 && Math.abs(s.p1.y - pStart.y) < 0.001 &&
              Math.abs(s.p2.x - pEnd.x) < 0.001 && Math.abs(s.p2.y - pEnd.y) < 0.001)
        );
        const allCircles = this.getAllCircles();

        const newSegments = SketchMath.calculateTrim({ p1: pStart, p2: pEnd }, clickPoint, allSegs, allCircles);

        if (newSegments) {
            this.removeEntity(targetId);
            for (const seg of newSegments) {
                if (SketchMath.distance(seg.p1, seg.p2) > 0.001) this.addLine(seg.p1, seg.p2);
            }
        }
    } 
    // --- CASE 2: POLILINIA (ROZBIJANIE I CIĘCIE) ---
    else if (target.type === 'polyline') {
        const nodes = target.nodeIds.map(id => this.getPoint(id)).filter(p => p !== null) as Point2D[];
        if (nodes.length < 2) return;

        // 1. Rozbijamy polilinię na segmenty
        const polySegments: {p1: Point2D, p2: Point2D, idx: number}[] = [];
        for (let i = 0; i < nodes.length - 1; i++) {
            polySegments.push({ p1: nodes[i], p2: nodes[i+1], idx: i });
        }
        if (target.closed) {
            polySegments.push({ p1: nodes[nodes.length-1], p2: nodes[0], idx: nodes.length - 1 });
        }

        // 2. Znajdź, który segment polilinii kliknięto
        let clickedSegIdx = -1;
        let minDist = Infinity;
        
        for (let i = 0; i < polySegments.length; i++) {
            const seg = polySegments[i];
            const proj = SketchMath.projectPointOnLine(clickPoint, seg.p1, seg.p2);
            if (proj.dist < minDist) {
                minDist = proj.dist;
                clickedSegIdx = i;
            }
        }

        if (clickedSegIdx !== -1) {
            // 3. Usuwamy polilinię
            this.removeEntity(targetId);

            // 4. Odtwarzamy WSZYSTKIE segmenty jako linie, OPRÓCZ klikniętego
            const targetSeg = polySegments[clickedSegIdx];

            // Inne segmenty -> zamień na linie
            for (let i = 0; i < polySegments.length; i++) {
                if (i === clickedSegIdx) continue;
                this.addLine(polySegments[i].p1, polySegments[i].p2);
            }

            // 5. Segment kliknięty -> Trimuj
            const allSegs = this.getAllSegments(); // Pobierz nowe otoczenie
            const allCircles = this.getAllCircles();
            
            const trimmedParts = SketchMath.calculateTrim(
                { p1: targetSeg.p1, p2: targetSeg.p2 },
                clickPoint,
                allSegs,
                allCircles
            );

            if (trimmedParts) {
                for (const part of trimmedParts) {
                    if (SketchMath.distance(part.p1, part.p2) > 0.001) this.addLine(part.p1, part.p2);
                }
            }
        }
    }
  }

  extendEntity(targetId: string, clickPoint: Point2D): void {
    const target = this.entities.get(targetId);
    if (!target || target.type !== 'line') return;

    const pStart = this.getPoint(target.startNodeId);
    const pEnd = this.getPoint(target.endNodeId);
    if (!pStart || !pEnd) return;

    const allSegs = this.getAllSegments().filter(s => 
        !(Math.abs(s.p1.x - pStart.x) < 0.001 && Math.abs(s.p1.y - pStart.y) < 0.001 &&
          Math.abs(s.p2.x - pEnd.x) < 0.001 && Math.abs(s.p2.y - pEnd.y) < 0.001)
    );
    const allCircles = this.getAllCircles();

    const result = SketchMath.calculateExtend(
        { p1: pStart, p2: pEnd },
        clickPoint,
        allSegs,
        allCircles 
    );

    if (result) {
      // Sprawdź, który koniec wydłużyć
      const dStart = SketchMath.distance(clickPoint, pStart);
      const dEnd = SketchMath.distance(clickPoint, pEnd);
      const extendStart = dStart < dEnd;

      const nodeId = extendStart ? target.startNodeId : target.endNodeId;
      const newNodePos = extendStart ? result.p1 : result.p2;

      // Aktualizujemy współrzędne WĘZŁA
      const node = this.nodes.get(nodeId);
      if (node) {
        node.x = newNodePos.x;
        node.y = newNodePos.y;
      }
    }
  }

  offsetEntity(targetId: string, distance: number, sidePoint: Point2D): void {
    const target = this.entities.get(targetId);
    if (!target || target.type !== 'line') return;

    const pStart = this.getPoint(target.startNodeId);
    const pEnd = this.getPoint(target.endNodeId);
    if (!pStart || !pEnd) return;

    const normal = SketchMath.getNormal2D(pStart, pEnd);
    
    const pTestPos = { x: pStart.x + normal.x * distance, y: pStart.y + normal.y * distance };
    const pTestNeg = { x: pStart.x - normal.x * distance, y: pStart.y - normal.y * distance };
    
    const distPos = SketchMath.distance(pTestPos, sidePoint);
    const distNeg = SketchMath.distance(pTestNeg, sidePoint);
    
    const finalOffset = distPos < distNeg 
      ? { x: normal.x * distance, y: normal.y * distance }
      : { x: -normal.x * distance, y: -normal.y * distance };

    const newStart = { x: pStart.x + finalOffset.x, y: pStart.y + finalOffset.y };
    const newEnd = { x: pEnd.x + finalOffset.x, y: pEnd.y + finalOffset.y };

    this.addLine(newStart, newEnd);
  }

  // ==========================================================================
  // EXPORT
  // ==========================================================================

  exportToNode(planeId: string): Omit<CADSketch, 'id' | 'name' | 'visible' | 'locked' | 'parentId' | 'childIds' | 'transform' | 'createdAt' | 'modifiedAt' | 'metadata'> {
    return {
      type: 'sketch',
      planeId,
      nodes: Array.from(this.nodes.values()), 
      entities: this.getEntities(),
      constraints: this.getAllConstraints(),
      fullyConstrained: false,
      profiles: this.getClosedContours()
    };
  }

  loadFromNode(sketch: CADSketch): void {
    this.clear();
    
    if (sketch.nodes) {
      for (const n of sketch.nodes) {
        this.nodes.set(n.id, { ...n });
      }
    }
    for (const e of sketch.entities) {
      this.entities.set(e.id, e);
    }
    for (const c of sketch.constraints) {
      this.constraints.set(c.id, c);
    }
  }
}

/**
 * Factory
 */
export function createSketcher(sketchId: string, plane: Plane): Sketcher {
  return new Sketcher(sketchId, plane);
}
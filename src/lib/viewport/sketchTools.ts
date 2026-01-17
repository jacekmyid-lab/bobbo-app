/**
 * sketchTools.ts - REFACTORED
 * - Polyline closing fixed
 * - Offset direction fixed (2-step process)
 * - Hit tolerance increased (easier selection)
 */

import * as THREE from 'three';
import type { Point2D, Plane, SketchEntity } from '../core/types';
import { Sketcher, SketchEntityFactory } from '../sketcher/Sketcher';
import { 
  calculateTrim, 
  calculateExtend, 
  calculateOffsetChain, 
  projectPointOnLine,
  vecDist,
  vecSub,
  getLineIntersection
} from '../geometry/SketchMath';

// ZWIĘKSZONA TOLERANCJA KLIKNIĘCIA (ułatwia trafianie w linie)
const HIT_TOLERANCE = 1.5; // Było 0.5, teraz łatwiej trafić
const SNAP_DISTANCE = 5.0; // Dystans przyciągania do punktów

/**
 * ============================================================================
 * HELPER: Entity to Segments Converter
 * ============================================================================
 */
function getSegmentsFromEntity(entity: any): { p1: Point2D, p2: Point2D }[] {
  const segments: { p1: Point2D, p2: Point2D }[] = [];

  if (entity.type === 'line') {
    segments.push({ p1: entity.start, p2: entity.end });
  } 
  else if (entity.type === 'polyline') {
    for (let i = 0; i < entity.points.length - 1; i++) {
      segments.push({ p1: entity.points[i], p2: entity.points[i+1] });
    }
    if (entity.closed) {
        segments.push({ p1: entity.points[entity.points.length-1], p2: entity.points[0] });
    }
  } 
  else if (entity.type === 'rectangle') {
    const x = entity.corner.x;
    const y = entity.corner.y;
    const w = entity.width;
    const h = entity.height;
    
    const p1 = { x, y };
    const p2 = { x: x + w, y };
    const p3 = { x: x + w, y: y + h };
    const p4 = { x, y: y + h };

    segments.push({ p1: p1, p2: p2 });
    segments.push({ p1: p2, p2: p3 });
    segments.push({ p1: p3, p2: p4 });
    segments.push({ p1: p4, p2: p1 });
  }

  return segments;
}

export abstract class SketchTool {
  protected canvas: HTMLCanvasElement | null = null;
  protected camera: THREE.Camera | null = null;
  protected sketcher: Sketcher | null = null;
  protected plane: Plane | null = null;
  protected isActive: boolean = false;

  constructor(
    canvas: HTMLCanvasElement | null,
    camera: THREE.Camera | null,
    sketcher: Sketcher | null,
    plane: Plane | null
  ) {
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
    
    return {
      x: localVec.dot(xAxis),
      y: localVec.dot(yAxis)
    };
  }

  activate(): void { this.isActive = true; }
  deactivate(): void { this.isActive = false; this.reset(); }
  abstract reset(): void;
  abstract handleMouseMove(event: MouseEvent): void;
  abstract handleClick(event: MouseEvent): void;
  abstract handleRightClick(event: MouseEvent): void;
  abstract handleKeyDown(event: KeyboardEvent): void;
}

// --- POPRAWIONA POLILINIA ---

export class PolylineTool extends SketchTool {
  private points: Point2D[] = [];
  private currentPoint: Point2D | null = null;
  
  reset(): void { this.points = []; this.currentPoint = null; }
  
  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if(p) {
        // Logika przyciągania do startu
        if (this.points.length > 2 && vecDist(p, this.points[0]) < SNAP_DISTANCE) {
            this.currentPoint = { ...this.points[0] }; // Snap to start
        } else {
            this.currentPoint = p;
        }
    }
  }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return;

    if (this.points.length === 0) {
        this.points.push(p);
    } 
    else {
        // Sprawdź czy zamykamy (kliknięcie w pobliżu startu)
        const distToStart = vecDist(p, this.points[0]);
        if (this.points.length >= 3 && distToStart < SNAP_DISTANCE) {
            this.finishPolyline(true); // ZAMKNIJ
            return;
        }
        
        this.points.push(p);
    }
  }

  handleRightClick(event: MouseEvent): void {
    if (this.isActive && this.points.length >= 2) this.finishPolyline(false); // Zakończ otwartą
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.reset();
    if (event.key === 'Enter' && this.points.length >= 2) this.finishPolyline(false); // Enter kończy (otwarta)
    if ((event.key === 'c' || event.key === 'C') && this.points.length >= 3) this.finishPolyline(true); // 'C' zamyka
    if (event.key === 'Backspace' && this.points.length > 0) this.points.pop();
  }

  private finishPolyline(closed: boolean): void {
    if (!this.sketcher) return;
    try {
      this.sketcher.addEntity(SketchEntityFactory.polyline(this.points, closed));
      // Jeśli zamknięta, system powinien wykryć profil automatycznie
      this.reset();
    } catch (e) { console.error(e); }
  }
  
  getPoints() { return this.points; }
  getCurrentPoint() { return this.currentPoint; }
// Dodaj tę metodę do klasy PolylineTool
canClose(): boolean {
  // Musimy mieć przynajmniej 3 punkty, aby zamknąć wielokąt
  if (this.points.length < 3) return false;
  
  // Musimy mieć aktualną pozycję kursora
  if (!this.currentPoint) return false;
  
  const startPoint = this.points[0];
  
  // Sprawdzamy dystans między kursorem a punktem startowym
  // SNAP_DISTANCE jest zdefiniowane na górze Twojego pliku (wartość 5.0)
  return vecDist(this.currentPoint, startPoint) < SNAP_DISTANCE;
}

}

export class LineTool extends SketchTool {
  private startPoint: Point2D | null = null;
  private endPoint: Point2D | null = null;
  reset(): void { this.startPoint = null; this.endPoint = null; }
  handleMouseMove(event: MouseEvent): void {
    if (this.isActive && this.startPoint) this.endPoint = this.screenToPlane(event.clientX, event.clientY);
  }
  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return;
    if (!this.startPoint) this.startPoint = p;
    else {
      this.endPoint = p;
      this.sketcher.addEntity(SketchEntityFactory.line(this.startPoint, this.endPoint));
      this.reset();
    }
  }
  handleRightClick(event: MouseEvent): void { this.reset(); }
  handleKeyDown(event: KeyboardEvent): void { if (event.key === 'Escape') this.reset(); }
  getStartPoint() { return this.startPoint; }
  getEndPoint() { return this.endPoint; }
}

export class CircleTool extends SketchTool {
  private center: Point2D | null = null;
  private radius: number = 0;
  reset(): void { this.center = null; this.radius = 0; }
  handleMouseMove(event: MouseEvent): void {
    if (this.isActive && this.center) {
        const p = this.screenToPlane(event.clientX, event.clientY);
        if(p) this.radius = vecDist(p, this.center);
    }
  }
  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return;
    if (!this.center) this.center = p;
    else {
        if (this.radius > 0.1) this.sketcher.addEntity(SketchEntityFactory.circle(this.center, this.radius));
        this.reset();
    }
  }
  handleRightClick(event: MouseEvent): void { this.reset(); }
  handleKeyDown(event: KeyboardEvent): void { if (event.key === 'Escape') this.reset(); }
  getCenter() { return this.center; }
  getRadius() { return this.radius; }
}

export class RectangleTool extends SketchTool {
  private corner: Point2D | null = null;
  private oppositeCorner: Point2D | null = null;
  reset(): void { this.corner = null; this.oppositeCorner = null; }
  handleMouseMove(event: MouseEvent): void {
    if (this.isActive && this.corner) this.oppositeCorner = this.screenToPlane(event.clientX, event.clientY);
  }
  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) return;
    const p = this.screenToPlane(event.clientX, event.clientY);
    if (!p) return;
    if (!this.corner) this.corner = p;
    else {
        this.oppositeCorner = p;
        const w = this.oppositeCorner.x - this.corner.x;
        const h = this.oppositeCorner.y - this.corner.y;
        if (Math.abs(w) > 0.1 && Math.abs(h) > 0.1) this.sketcher.addEntity(SketchEntityFactory.rectangle(this.corner, w, h));
        this.reset();
    }
  }
  handleRightClick(event: MouseEvent): void { this.reset(); }
  handleKeyDown(event: KeyboardEvent): void { if (event.key === 'Escape') this.reset(); }
  getCorner() { return this.corner; }
  getOppositeCorner() { return this.oppositeCorner; }
}

/**
 * ============================================================================
 * NARZĘDZIA EDYCJI (TRIM, EXTEND, OFFSET)
 * ============================================================================
 */

export class TrimTool extends SketchTool {
  reset(): void {}
  handleMouseMove(event: MouseEvent): void {}
  handleRightClick(event: MouseEvent): void { this.deactivate(); }
  handleKeyDown(event: KeyboardEvent): void { if(event.key === 'Escape') this.deactivate(); }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) return;
    const clickPoint = this.screenToPlane(event.clientX, event.clientY);
    if (!clickPoint) return;

    const entities = this.sketcher.getEntities();
    
    // 1. Znajdź segment-ofiarę (używamy HIT_TOLERANCE)
    let targetEntityId: string | null = null;
    let targetSegment: { p1: Point2D, p2: Point2D } | null = null;
    let minDist = HIT_TOLERANCE; // Większa tolerancja!

    for (const entity of entities) {
        const segments = getSegmentsFromEntity(entity);
        for (const seg of segments) {
            const proj = projectPointOnLine(clickPoint, seg.p1, seg.p2);
            if (proj.dist < minDist && proj.tClamped >= 0 && proj.tClamped <= 1) {
                minDist = proj.dist;
                targetEntityId = entity.id;
                targetSegment = seg;
            }
        }
    }

    if (!targetEntityId || !targetSegment) return;

    // 2. Zbierz bariery
    const allSegments: { p1: Point2D, p2: Point2D }[] = [];
    entities.forEach(ent => {
        allSegments.push(...getSegmentsFromEntity(ent));
    });

    // 3. Oblicz Trim
    const resultSegments = calculateTrim(targetSegment, clickPoint, allSegments);

    if (resultSegments) {
        // Explode on modify
        const oldEntity = this.sketcher.getEntity(targetEntityId);
        const oldSegments = getSegmentsFromEntity(oldEntity);
        
        // Znajdź usuwany segment w starej figurze (porównanie po wartościach)
        // (Uproszczone: zakładamy że współrzędne są identyczne)
        const segIdx = oldSegments.findIndex(s => 
            Math.abs(s.p1.x - targetSegment!.p1.x) < 0.001 && 
            Math.abs(s.p1.y - targetSegment!.p1.y) < 0.001 &&
            Math.abs(s.p2.x - targetSegment!.p2.x) < 0.001 && 
            Math.abs(s.p2.y - targetSegment!.p2.y) < 0.001
        );

        this.sketcher.removeEntity(targetEntityId);

        // Dodaj stare nietknięte
        oldSegments.forEach((seg, idx) => {
            if (idx !== segIdx) {
                this.sketcher!.addEntity(SketchEntityFactory.line(seg.p1, seg.p2));
            }
        });

        // Dodaj nowe pocięte
        resultSegments.forEach(seg => {
            this.sketcher!.addEntity(SketchEntityFactory.line(seg.p1, seg.p2));
        });
        
        console.log("Trim success");
    }
  }
}

export class ExtendTool extends SketchTool {
  reset(): void {}
  handleMouseMove(event: MouseEvent): void {}
  handleRightClick(event: MouseEvent): void { this.deactivate(); }
  handleKeyDown(event: KeyboardEvent): void { if(event.key === 'Escape') this.deactivate(); }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) return;
    const clickPoint = this.screenToPlane(event.clientX, event.clientY);
    if (!clickPoint) return;

    const entities = this.sketcher.getEntities();
    
    // 1. Znajdź linię do przedłużenia
    let targetEntityId: string | null = null;
    let targetSegment: { p1: Point2D, p2: Point2D } | null = null;
    let minDist = HIT_TOLERANCE;

    for (const entity of entities) {
        // Tylko linie proste dla Extend (dla uproszczenia)
        if (entity.type === 'line') {
            const proj = projectPointOnLine(clickPoint, entity.start, entity.end);
            if (proj.dist < minDist) {
                minDist = proj.dist;
                targetEntityId = entity.id;
                targetSegment = { p1: entity.start, p2: entity.end };
            }
        }
    }

    if (!targetEntityId || !targetSegment) return;

    // 2. Bariery
    const barrierSegments: { p1: Point2D, p2: Point2D }[] = [];
    entities.forEach(ent => {
        if (ent.id !== targetEntityId) {
            barrierSegments.push(...getSegmentsFromEntity(ent));
        }
    });

    // 3. Extend
    const newCoords = calculateExtend(targetSegment, clickPoint, barrierSegments);

    if (newCoords) {
        this.sketcher.updateEntity(targetEntityId, {
            start: newCoords.p1,
            end: newCoords.p2
        });
        console.log("Extend success");
    }
  }
}

// --- POPRAWIONY OFFSET (2 ETAPY: WYBÓR -> STRONA) ---

export class OffsetTool extends SketchTool {
  private selectedId: string | null = null;
  // Przechowujemy oryginalne punkty wybranej figury, żeby nie pobierać ich ciągle
  private sourceChain: Point2D[] = []; 
  private isClosed: boolean = false;

  reset(): void {
    this.selectedId = null;
    this.sourceChain = [];
    this.isClosed = false;
  }

  handleMouseMove(event: MouseEvent): void {
    // Tu można dodać podgląd (ghost) offsetu, jeśli mamy this.selectedId
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.reset();
  }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) return;
    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) return;

    // FAZA 1: Brak wyboru -> Wybierz figurę
    if (!this.selectedId) {
      let minDist = HIT_TOLERANCE;
      const entities = this.sketcher.getEntities();
      
      for (const entity of entities) {
        const segments = getSegmentsFromEntity(entity);
        for(const seg of segments) {
            const proj = projectPointOnLine(point, seg.p1, seg.p2);
            if (proj.dist < minDist) {
                minDist = proj.dist;
                this.selectedId = entity.id;
            }
        }
      }
      
      if (this.selectedId) {
          // Przygotuj dane figury
          const entity = this.sketcher.getEntity(this.selectedId);
          if (entity.type === 'line') {
              this.sourceChain = [entity.start, entity.end];
              this.isClosed = false;
          } else if (entity.type === 'polyline') {
              this.sourceChain = [...entity.points];
              this.isClosed = entity.closed;
          } else if (entity.type === 'rectangle') {
              const { x, y } = entity.corner;
              const w = entity.width; 
              const h = entity.height;
              this.sourceChain = [
                 {x, y}, {x: x+w, y}, {x: x+w, y: y+h}, {x, y: y+h}, {x, y}
              ];
              this.isClosed = true;
          }
          console.log("Offset: Selected. Now click to indicate side.");
      }
      return; // Czekamy na drugie kliknięcie
    }

    // FAZA 2: Mamy wybraną figurę -> Wskazanie strony i dystansu
    // Użytkownik kliknął gdzieś w przestrzeni (point), co wskazuje stronę.
    
    // Obliczamy orientacyjny dystans od kursora do figury (dla domyślnej wartości w prompt)
    // Ale ważniejsza jest strona.
    
    const input = prompt("Podaj odległość offsetu:", "10");
    if (input !== null) {
        let distVal = parseFloat(input.replace(',', '.'));
        if (!isNaN(distVal) && distVal !== 0) {
            
            // Oblicz dwa warianty (lewo/prawo)
            // Zakładamy, że distVal jest dodatnie (np. 10), a my decydujemy o znaku
            distVal = Math.abs(distVal);

            const resPos = calculateOffsetChain(this.sourceChain, distVal);
            const resNeg = calculateOffsetChain(this.sourceChain, -distVal);
            
            // Sprawdzamy, który wynik jest bliżej punktu kliknięcia (point)
            // Bierzemy środek pierwszego segmentu wyniku jako próbkę
            const midPos = { x: (resPos[0].x + resPos[1].x)/2, y: (resPos[0].y + resPos[1].y)/2 };
            const midNeg = { x: (resNeg[0].x + resNeg[1].x)/2, y: (resNeg[0].y + resNeg[1].y)/2 };
            
            const dPos = vecDist(midPos, point);
            const dNeg = vecDist(midNeg, point);
            
            const finalPoints = (dPos < dNeg) ? resPos : resNeg;

            if (finalPoints.length > 0) {
                // Jeśli oryginał był zamknięty (Rect/Closed Poly), wynik też traktujemy jako zamknięty
                // (Funkcja calculateOffsetChain zwraca otwarty łańcuch punktów, ale dla zamkniętych pierwszy i ostatni punkt powinny się zejść)
                
                // Dodajemy nową geometrię
                this.sketcher.addEntity(SketchEntityFactory.polyline(finalPoints, this.isClosed));
                console.log("Offset created.");
            }
        }
    }
    
    // Reset po wykonaniu
    this.reset();
  }
}
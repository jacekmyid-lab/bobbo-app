/**
 * sketchTools.ts - FIXED with debug logging
 * ✅ Proper coordinate conversion
 * ✅ Debug logs for troubleshooting
 * ✅ Clear event handling
 */

import * as THREE from 'three';
import type { Point2D, Plane } from '$lib/core/types';
import { Sketcher, SketchEntityFactory } from '$lib/sketcher/Sketcher';

/**
 * Base class for sketch tools
 */
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
    
    console.log('[SketchTool] Initialized:', {
      hasCanvas: !!canvas,
      hasCamera: !!camera,
      hasSketcher: !!sketcher,
      hasPlane: !!plane
    });
  }

  /**
   * Convert screen coordinates to 2D plane coordinates
   */
  protected screenToPlane(screenX: number, screenY: number): Point2D | null {
    if (!this.canvas || !this.camera || !this.plane) {
      console.warn('[SketchTool] screenToPlane failed - missing:', {
        canvas: !!this.canvas,
        camera: !!this.camera,
        plane: !!this.plane
      });
      return null;
    }

    // Get canvas bounding rect
    const rect = this.canvas.getBoundingClientRect();
    
    // Convert to NDC (Normalized Device Coordinates)
    const x = ((screenX - rect.left) / rect.width) * 2 - 1;
    const y = -((screenY - rect.top) / rect.height) * 2 + 1;

    console.log('[SketchTool] Screen to NDC:', {
      screen: { x: screenX, y: screenY },
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      ndc: { x, y }
    });

    // Create raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

    // Create THREE.js plane
    const planeNormal = new THREE.Vector3(
      this.plane.normal.x,
      this.plane.normal.y,
      this.plane.normal.z
    ).normalize();
    
    const planeOrigin = new THREE.Vector3(
      this.plane.origin.x,
      this.plane.origin.y,
      this.plane.origin.z
    );
    
    const threePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNormal,
      planeOrigin
    );

    // Intersect ray with plane
    const intersect = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(threePlane, intersect);

    if (!hit) {
      console.warn('[SketchTool] Ray did not intersect plane');
      return null;
    }

    console.log('[SketchTool] Ray hit plane at:', {
      x: hit.x,
      y: hit.y,
      z: hit.z
    });

    // Convert to plane local coordinates
    const xAxis = new THREE.Vector3(
      this.plane.xAxis.x,
      this.plane.xAxis.y,
      this.plane.xAxis.z
    ).normalize();
    
    const yAxis = new THREE.Vector3(
      this.plane.yAxis.x,
      this.plane.yAxis.y,
      this.plane.yAxis.z
    ).normalize();
    
    const localVec = hit.clone().sub(planeOrigin);
    
    const result = {
      x: localVec.dot(xAxis),
      y: localVec.dot(yAxis)
    };

    console.log('[SketchTool] 🎯 Plane coords:', result);
    
    return result;
  }

  /**
   * Activate tool
   */
  activate(): void {
    this.isActive = true;
    console.log(`[${this.constructor.name}] ✅ Activated`);
  }

  /**
   * Deactivate tool
   */
  deactivate(): void {
    this.isActive = false;
    this.reset();
    console.log(`[${this.constructor.name}] ❌ Deactivated`);
  }

  /**
   * Reset tool state
   */
  abstract reset(): void;

  /**
   * Handle mouse move
   */
  abstract handleMouseMove(event: MouseEvent): void;

  /**
   * Handle mouse click
   */
  abstract handleClick(event: MouseEvent): void;

  /**
   * Handle right click
   */
  abstract handleRightClick(event: MouseEvent): void;

  /**
   * Handle key press
   */
  abstract handleKeyDown(event: KeyboardEvent): void;
}

/**
 * Polyline drawing tool
 */
export class PolylineTool extends SketchTool {
  private points: Point2D[] = [];
  private currentPoint: Point2D | null = null;
  private snapDistance: number = 5;

  reset(): void {
    this.points = [];
    this.currentPoint = null;
    console.log('[PolylineTool] 🔄 Reset');
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) return;

    this.currentPoint = this.snapToFirstPoint(point);
  }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) {
      console.warn('[PolylineTool] ⚠️ Not active or no sketcher');
      return;
    }

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) {
      console.warn('[PolylineTool] ⚠️ Could not convert to plane coords');
      return;
    }

    if (this.points.length === 0) {
      // Start new polyline
      this.points.push(point);
      console.log('[PolylineTool] ▶️ Started polyline at', point);
    } else if (this.canClose()) {
      // Close the polyline
      console.log('[PolylineTool] 🔒 Closing polyline');
      this.finishPolyline(true);
    } else {
      // Add point
      this.points.push(this.snapToFirstPoint(point));
      console.log('[PolylineTool] ➕ Added point', point, 'total:', this.points.length);
    }
  }

  handleRightClick(event: MouseEvent): void {
    if (!this.isActive || this.points.length < 2) return;
    event.preventDefault();
    console.log('[PolylineTool] ⏹️ Right-click: finishing open polyline');
    this.finishPolyline(false);
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (!this.isActive) return;

    switch (event.key) {
      case 'Escape':
        console.log('[PolylineTool] ⛔ ESC: canceling');
        this.reset();
        break;
      case 'Enter':
        if (this.points.length >= 2) {
          console.log('[PolylineTool] ✅ ENTER: closing polyline');
          this.finishPolyline(true);
        }
        break;
      case 'Backspace':
        if (this.points.length > 0) {
          this.points.pop();
          console.log('[PolylineTool] ⬅️ BACKSPACE: removed point, remaining:', this.points.length);
          if (this.points.length === 0) {
            this.reset();
          }
        }
        break;
    }
  }

  private snapToFirstPoint(point: Point2D): Point2D {
    if (this.isNearFirstPoint(point)) {
      return { ...this.points[0] };
    }
    return point;
  }

  private isNearFirstPoint(point: Point2D): boolean {
    if (this.points.length < 3) return false;
    
    const first = this.points[0];
    const dist = Math.sqrt(
      (point.x - first.x) ** 2 + 
      (point.y - first.y) ** 2
    );
    
    return dist < this.snapDistance;
  }

  canClose(): boolean {
    if (!this.currentPoint || this.points.length < 3) return false;
    return this.isNearFirstPoint(this.currentPoint);
  }

  private finishPolyline(closed: boolean): void {
    if (!this.sketcher || this.points.length < 2) {
      console.warn('[PolylineTool] ⚠️ Cannot finish: no sketcher or too few points');
      return;
    }

    try {
      const entity = SketchEntityFactory.polyline(this.points, closed);
      this.sketcher.addEntity(entity);
      console.log(`[PolylineTool] ✅ Created ${closed ? 'closed' : 'open'} polyline with ${this.points.length} points`);

      if (closed) {
        const profiles = this.sketcher.detectProfiles();
        console.log(`[PolylineTool] 📐 Detected ${profiles.length} profile(s)`);
      }

      this.reset();
    } catch (error) {
      console.error('[PolylineTool] ❌ Error creating polyline:', error);
    }
  }

  getPoints(): Point2D[] {
    return this.points;
  }

  getCurrentPoint(): Point2D | null {
    return this.currentPoint;
  }

  getPointCount(): number {
    return this.points.length;
  }
}

/**
 * Line drawing tool
 */
export class LineTool extends SketchTool {
  private startPoint: Point2D | null = null;
  private endPoint: Point2D | null = null;

  reset(): void {
    this.startPoint = null;
    this.endPoint = null;
    console.log('[LineTool] 🔄 Reset');
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive || !this.startPoint) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (point) {
      this.endPoint = point;
    }
  }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) {
      console.warn('[LineTool] ⚠️ Not active or no sketcher');
      return;
    }

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) {
      console.warn('[LineTool] ⚠️ Could not convert to plane coords');
      return;
    }

    if (!this.startPoint) {
      this.startPoint = point;
      console.log('[LineTool] ▶️ Set start point', point);
    } else {
      this.endPoint = point;
      console.log('[LineTool] ⏹️ Set end point', point);
      
      try {
        const entity = SketchEntityFactory.line(this.startPoint, this.endPoint);
        this.sketcher.addEntity(entity);
        console.log('[LineTool] ✅ Created line');
        this.reset();
      } catch (error) {
        console.error('[LineTool] ❌ Error creating line:', error);
      }
    }
  }

  handleRightClick(event: MouseEvent): void {
    event.preventDefault();
    this.reset();
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.reset();
    }
  }

  getStartPoint(): Point2D | null {
    return this.startPoint;
  }

  getEndPoint(): Point2D | null {
    return this.endPoint;
  }
}

/**
 * Circle drawing tool
 */
export class CircleTool extends SketchTool {
  private center: Point2D | null = null;
  private radius: number = 0;

  reset(): void {
    this.center = null;
    this.radius = 0;
    console.log('[CircleTool] 🔄 Reset');
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive || !this.center) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (point) {
      this.radius = Math.sqrt(
        (point.x - this.center.x) ** 2 + 
        (point.y - this.center.y) ** 2
      );
    }
  }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) {
      console.warn('[CircleTool] ⚠️ Not active or no sketcher');
      return;
    }

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) {
      console.warn('[CircleTool] ⚠️ Could not convert to plane coords');
      return;
    }

    if (!this.center) {
      this.center = point;
      console.log('[CircleTool] ▶️ Set center', point);
    } else {
      if (this.radius > 0.1) {
        try {
          const entity = SketchEntityFactory.circle(this.center, this.radius);
          this.sketcher.addEntity(entity);
          console.log('[CircleTool] ✅ Created circle, radius:', this.radius);
        } catch (error) {
          console.error('[CircleTool] ❌ Error creating circle:', error);
        }
      }
      this.reset();
    }
  }

  handleRightClick(event: MouseEvent): void {
    event.preventDefault();
    this.reset();
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.reset();
    }
  }

  getCenter(): Point2D | null {
    return this.center;
  }

  getRadius(): number {
    return this.radius;
  }
}

/**
 * Rectangle drawing tool
 */
export class RectangleTool extends SketchTool {
  private corner: Point2D | null = null;
  private oppositeCorner: Point2D | null = null;

  reset(): void {
    this.corner = null;
    this.oppositeCorner = null;
    console.log('[RectangleTool] 🔄 Reset');
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive || !this.corner) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (point) {
      this.oppositeCorner = point;
    }
  }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) {
      console.warn('[RectangleTool] ⚠️ Not active or no sketcher');
      return;
    }

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) {
      console.warn('[RectangleTool] ⚠️ Could not convert to plane coords');
      return;
    }

    if (!this.corner) {
      this.corner = point;
      console.log('[RectangleTool] ▶️ Set corner', point);
    } else {
      this.oppositeCorner = point;
      const width = this.oppositeCorner.x - this.corner.x;
      const height = this.oppositeCorner.y - this.corner.y;
      
      if (Math.abs(width) > 0.1 && Math.abs(height) > 0.1) {
        try {
          const entity = SketchEntityFactory.rectangle(this.corner, width, height);
          this.sketcher.addEntity(entity);
          console.log('[RectangleTool] ✅ Created rectangle', width, 'x', height);
        } catch (error) {
          console.error('[RectangleTool] ❌ Error creating rectangle:', error);
        }
      }
      this.reset();
    }
  }

  handleRightClick(event: MouseEvent): void {
    event.preventDefault();
    this.reset();
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.reset();
    }
  }

  getCorner(): Point2D | null {
    return this.corner;
  }

  getOppositeCorner(): Point2D | null {
    return this.oppositeCorner;
  }
}
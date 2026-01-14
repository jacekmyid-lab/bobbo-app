/**
 * sketchTools.ts
 * Manager for all sketch drawing tools (line, polyline, circle, etc.)
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
  }

  /**
   * Convert screen coordinates to 2D plane coordinates
   */
  protected screenToPlane(screenX: number, screenY: number): Point2D | null {
    if (!this.canvas || !this.camera || !this.plane) return null;

    const rect = this.canvas.getBoundingClientRect();
    const x = ((screenX - rect.left) / rect.width) * 2 - 1;
    const y = -((screenY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

    const planeNormal = new THREE.Vector3(
      this.plane.normal.x,
      this.plane.normal.y,
      this.plane.normal.z
    );
    const planeOrigin = new THREE.Vector3(
      this.plane.origin.x,
      this.plane.origin.y,
      this.plane.origin.z
    );
    const threePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      planeNormal,
      planeOrigin
    );

    const intersect = new THREE.Vector3();
    raycaster.ray.intersectPlane(threePlane, intersect);

    if (!intersect) return null;

    const xAxis = new THREE.Vector3(
      this.plane.xAxis.x,
      this.plane.xAxis.y,
      this.plane.xAxis.z
    );
    const yAxis = new THREE.Vector3(
      this.plane.yAxis.x,
      this.plane.yAxis.y,
      this.plane.yAxis.z
    );
    
    const localVec = intersect.clone().sub(planeOrigin);
    
    return {
      x: localVec.dot(xAxis),
      y: localVec.dot(yAxis)
    };
  }

  /**
   * Activate tool
   */
  activate(): void {
    this.isActive = true;
  }

  /**
   * Deactivate tool
   */
  deactivate(): void {
    this.isActive = false;
    this.reset();
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
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) return;

    this.currentPoint = this.snapToFirstPoint(point);
  }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) return;

    if (this.points.length === 0) {
      this.points.push(point);
    } else if (this.canClose()) {
      this.finishPolyline(true);
    } else {
      this.points.push(this.snapToFirstPoint(point));
    }
  }

  handleRightClick(event: MouseEvent): void {
    if (!this.isActive || this.points.length < 2) return;
    event.preventDefault();
    this.finishPolyline(false);
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (!this.isActive) return;

    switch (event.key) {
      case 'Escape':
        this.reset();
        break;
      case 'Enter':
        if (this.points.length >= 2) {
          this.finishPolyline(true);
        }
        break;
      case 'Backspace':
        if (this.points.length > 0) {
          this.points.pop();
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
    if (!this.sketcher || this.points.length < 2) return;

    const entity = SketchEntityFactory.polyline(this.points, closed);
    this.sketcher.addEntity(entity);

    if (closed) {
      const profiles = this.sketcher.detectProfiles();
      console.log(`[PolylineTool] Created closed polyline with ${profiles.length} profile(s)`);
    }

    this.reset();
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
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive || !this.startPoint) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (point) {
      this.endPoint = point;
    }
  }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) return;

    if (!this.startPoint) {
      this.startPoint = point;
    } else {
      this.endPoint = point;
      const entity = SketchEntityFactory.line(this.startPoint, this.endPoint);
      this.sketcher.addEntity(entity);
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
    if (!this.isActive || !this.sketcher) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) return;

    if (!this.center) {
      this.center = point;
    } else {
      if (this.radius > 0.1) {
        const entity = SketchEntityFactory.circle(this.center, this.radius);
        this.sketcher.addEntity(entity);
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
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.isActive || !this.corner) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (point) {
      this.oppositeCorner = point;
    }
  }

  handleClick(event: MouseEvent): void {
    if (!this.isActive || !this.sketcher) return;

    const point = this.screenToPlane(event.clientX, event.clientY);
    if (!point) return;

    if (!this.corner) {
      this.corner = point;
    } else {
      this.oppositeCorner = point;
      const width = this.oppositeCorner.x - this.corner.x;
      const height = this.oppositeCorner.y - this.corner.y;
      
      if (Math.abs(width) > 0.1 && Math.abs(height) > 0.1) {
        const entity = SketchEntityFactory.rectangle(this.corner, width, height);
        this.sketcher.addEntity(entity);
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

  getWidth(): number {
    if (!this.corner || !this.oppositeCorner) return 0;
    return this.oppositeCorner.x - this.corner.x;
  }

  getHeight(): number {
    if (!this.corner || !this.oppositeCorner) return 0;
    return this.oppositeCorner.y - this.corner.y;
  }
}
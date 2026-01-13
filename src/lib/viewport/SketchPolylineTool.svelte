<!--
  SketchPolylineTool.svelte - Tool for drawing closed polylines in sketch mode
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import * as THREE from 'three';
    import { 
      sketchEditStore, 
      documentStore,
      toolStore 
    } from '$lib/stores/cadStore';
    import { Sketcher, SketchEntityFactory } from '$lib/sketcher/Sketcher';
    import type { Point2D, Plane } from '$lib/core/types';
  
    // Props
    export let canvas: HTMLCanvasElement | null = null;
    export let camera: THREE.Camera | null = null;
    export let sketcher: Sketcher | null = null;
    export let plane: Plane | null = null;
  
    // Drawing state
    let points: Point2D[] = $state([]);
    let isDrawing = $state(false);
    let currentPoint: Point2D | null = $state(null);
    let canClose = $state(false);
    let snapDistance = 5; // pixels
  
    // Get tool state
    let activeTool = $derived($toolStore.activeTool);
    let isActive = $derived(activeTool === 'sketch-polyline');
  
    /**
     * Convert screen coordinates to plane coordinates
     */
    function screenToPlane(screenX: number, screenY: number): Point2D | null {
      if (!canvas || !camera || !plane) return null;
  
      const rect = canvas.getBoundingClientRect();
      const x = ((screenX - rect.left) / rect.width) * 2 - 1;
      const y = -((screenY - rect.top) / rect.height) * 2 + 1;
  
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  
      // Create plane in 3D space
      const planeNormal = new THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z);
      const planeOrigin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
      const threePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planeOrigin);
  
      const intersect = new THREE.Vector3();
      raycaster.ray.intersectPlane(threePlane, intersect);
  
      if (!intersect) return null;
  
      // Convert 3D point to 2D plane coordinates
      const xAxis = new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z);
      const yAxis = new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z);
      
      const localVec = intersect.clone().sub(planeOrigin);
      
      return {
        x: localVec.dot(xAxis),
        y: localVec.dot(yAxis)
      };
    }
  
    /**
     * Check if point is close to first point (for closing)
     */
    function isNearFirstPoint(point: Point2D): boolean {
      if (points.length < 3) return false;
      
      const first = points[0];
      const dist = Math.sqrt(
        (point.x - first.x) ** 2 + 
        (point.y - first.y) ** 2
      );
      
      return dist < snapDistance;
    }
  
    /**
     * Snap point to first point if close
     */
    function snapToFirstPoint(point: Point2D): Point2D {
      if (isNearFirstPoint(point)) {
        return { ...points[0] };
      }
      return point;
    }
  
    /**
     * Handle mouse move
     */
    function handleMouseMove(event: MouseEvent): void {
      if (!isActive || !isDrawing) return;
  
      const point = screenToPlane(event.clientX, event.clientY);
      if (!point) return;
  
      const snapped = snapToFirstPoint(point);
      currentPoint = snapped;
      canClose = points.length >= 3 && isNearFirstPoint(point);
    }
  
    /**
     * Handle mouse click
     */
    function handleClick(event: MouseEvent): void {
      if (!isActive || !sketcher) return;
  
      const point = screenToPlane(event.clientX, event.clientY);
      if (!point) return;
  
      if (!isDrawing) {
        // Start drawing
        isDrawing = true;
        points = [point];
        currentPoint = point;
      } else {
        // Check if we should close the polyline
        if (canClose) {
          finishPolyline(true);
        } else {
          // Add point
          const snapped = snapToFirstPoint(point);
          points = [...points, snapped];
        }
      }
    }
  
    /**
     * Handle right click - finish polyline without closing
     */
    function handleContextMenu(event: MouseEvent): void {
      if (!isActive || !isDrawing) return;
      event.preventDefault();
      
      if (points.length >= 2) {
        finishPolyline(false);
      }
    }
  
    /**
     * Handle escape key - cancel drawing
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (!isActive) return;
  
      if (event.key === 'Escape') {
        cancelDrawing();
      } else if (event.key === 'Enter' && points.length >= 2) {
        finishPolyline(true);
      } else if (event.key === 'Backspace' && points.length > 0) {
        // Remove last point
        points = points.slice(0, -1);
        if (points.length === 0) {
          cancelDrawing();
        }
      }
    }
  
    /**
     * Finish polyline and add to sketch
     */
    function finishPolyline(closed: boolean): void {
      if (!sketcher || points.length < 2) return;
  
      const entity = SketchEntityFactory.polyline(points, closed);
      sketcher.addEntity(entity);
  
      // If closed, detect profiles
      if (closed) {
        const profiles = sketcher.detectProfiles();
        console.log(`[SketchPolyline] Created closed polyline with ${profiles.length} profile(s)`);
        
        if (profiles.length > 0) {
          // Notify that we have profiles ready for extrusion
          console.log(`[SketchPolyline] Profile ready:`, profiles[0]);
        }
      }
  
      // Reset state
      resetDrawing();
    }
  
    /**
     * Cancel drawing
     */
    function cancelDrawing(): void {
      resetDrawing();
    }
  
    /**
     * Reset drawing state
     */
    function resetDrawing(): void {
      points = [];
      isDrawing = false;
      currentPoint = null;
      canClose = false;
    }
  
    /**
     * Get preview line geometry
     */
    function getPreviewPoints(): number[] {
      if (points.length === 0 || !currentPoint) return [];
      
      const result: number[] = [];
      
      // Add all points
      for (const p of points) {
        result.push(p.x, p.y, 0);
      }
      
      // Add current point
      result.push(currentPoint.x, currentPoint.y, 0);
      
      // If can close, add line back to first point
      if (canClose) {
        result.push(points[0].x, points[0].y, 0);
      }
      
      return result;
    }
  
    /**
     * Convert 2D plane point to 3D world point
     */
    function planeToWorld(point: Point2D): THREE.Vector3 {
      if (!plane) return new THREE.Vector3();
  
      const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
      const xAxis = new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z);
      const yAxis = new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z);
      
      return origin.clone()
        .add(xAxis.clone().multiplyScalar(point.x))
        .add(yAxis.clone().multiplyScalar(point.y));
    }
  
    onMount(() => {
      if (canvas) {
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('contextmenu', handleContextMenu);
      }
      window.addEventListener('keydown', handleKeyDown);
  
      return () => {
        if (canvas) {
          canvas.removeEventListener('mousemove', handleMouseMove);
          canvas.removeEventListener('click', handleClick);
          canvas.removeEventListener('contextmenu', handleContextMenu);
        }
        window.removeEventListener('keydown', handleKeyDown);
      };
    });
  
    // Reset when tool changes
    $effect(() => {
      if (!isActive && isDrawing) {
        resetDrawing();
      }
    });
  </script>
  
  <!-- Render preview if drawing -->
  {#if isActive && isDrawing && plane}
    <div class="polyline-overlay">
      <!-- Instructions -->
      <div class="instructions">
        <div class="instruction-row">
          <span class="key">Click</span> Add point
        </div>
        <div class="instruction-row">
          <span class="key">Right-click</span> Finish open
        </div>
        {#if canClose}
          <div class="instruction-row highlight">
            <span class="key">Click</span> Close shape
          </div>
        {/if}
        <div class="instruction-row">
          <span class="key">Backspace</span> Undo point
        </div>
        <div class="instruction-row">
          <span class="key">ESC</span> Cancel
        </div>
      </div>
  
      <!-- Point count -->
      <div class="point-count">
        Points: {points.length}
        {#if canClose}
          <span class="closeable">● Can close</span>
        {/if}
      </div>
    </div>
  {/if}
  
  <style>
    .polyline-overlay {
      position: absolute;
      top: 80px;
      left: 12px;
      pointer-events: none;
      z-index: 20;
    }
  
    .instructions {
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid #06b6d4;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
    }
  
    .instruction-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: #94a3b8;
      margin: 4px 0;
    }
  
    .instruction-row.highlight {
      color: #06b6d4;
      font-weight: 600;
    }
  
    .key {
      display: inline-block;
      padding: 2px 6px;
      background: #334155;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      color: #e2e8f0;
      min-width: 60px;
      text-align: center;
    }
  
    .point-count {
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid #334155;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 11px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 12px;
    }
  
    .closeable {
      color: #22c55e;
      font-weight: 600;
    }
  </style>
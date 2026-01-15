/**
 * cameraAnimation.ts - FIXED VERSION
 * ✅ Proper grid scaling
 * ✅ Correct zoom calculation
 * ✅ Better camera positioning
 */

import * as THREE from 'three';
import { writable } from 'svelte/store';
import type { Plane } from '$lib/core/types';
import type { Solid } from '$lib/geometry/Solid';

interface CameraState {
  position: THREE.Vector3;
  target: THREE.Vector3;
  zoom?: number;
}

interface SketchBasis {
  origin: THREE.Vector3;
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
  gridSize: number;
  gridDivisions: number;
}

export function useCameraAnimation(planes: Map<string, Plane>, getSolids: () => Map<string, Solid>) {
  let savedCameraState: CameraState | null = null;
  let animating = false;
  let targetCameraPos = { x: 50, y: 50, z: 50 };
  let targetCameraLookAt = { x: 0, y: 0, z: 0 };
  let targetZoom = 1;
  let sketchBasis: SketchBasis | null = null;

  const animatingStore = writable(false);
  const sketchBasisStore = writable<SketchBasis | null>(null);

  /**
   * Calculate grid size based on models - FIXED
   */
  function calculateGridSize(): { size: number; divisions: number } {
    const solids = getSolids();
    
    // Default grid for empty scene
    if (solids.size === 0) {
      return { size: 100, divisions: 10 }; // 100x100 grid, 10 unit divisions
    }

    // Find bounding box of all models
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const solid of solids.values()) {
      const box = new THREE.Box3().setFromObject(solid);
      if (!box.isEmpty()) {
        minX = Math.min(minX, box.min.x);
        minY = Math.min(minY, box.min.y);
        minZ = Math.min(minZ, box.min.z);
        maxX = Math.max(maxX, box.max.x);
        maxY = Math.max(maxY, box.max.y);
        maxZ = Math.max(maxZ, box.max.z);
      }
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;
    const maxDim = Math.max(width, height, depth, 10); // Minimum 10 units

    // Grid should be 3x model size for comfortable working space
    const gridSize = Math.ceil(maxDim * 3 / 10) * 10; // Round to nearest 10
    
    // Divisions: every 10 units = 1 division
    const divisions = Math.max(10, gridSize / 10);

    console.log('[CameraAnim] Calculated grid:', {
      modelBounds: { width, height, depth, maxDim },
      gridSize,
      divisions
    });

    return { size: gridSize, divisions };
  }

  /**
   * Enter sketch mode - FIXED
   */
  function enterSketchMode(
    planeId: string,
    camera: THREE.Camera | null,
    controls: any
  ): void {
    if (!camera || !controls) {
      console.error('[CameraAnim] Missing camera or controls');
      return;
    }
    
    const plane = planes.get(planeId);
    if (!plane) {
      console.error('[CameraAnim] Plane not found:', planeId);
      return;
    }

    console.log('[CameraAnim] Entering sketch mode on plane:', plane.name);

    // Save current camera state
    savedCameraState = {
      position: camera.position.clone(),
      target: controls.target?.clone() || new THREE.Vector3(),
      zoom: camera instanceof THREE.OrthographicCamera ? camera.zoom : 1
    };

    // Plane basis vectors
    const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
    const normal = new THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z).normalize();
    
    // Calculate plane axes
    const worldUp = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    
    if (Math.abs(normal.dot(worldUp)) > 0.9) {
      x.crossVectors(new THREE.Vector3(1, 0, 0), normal).normalize();
    } else {
      x.crossVectors(worldUp, normal).normalize();
    }
    y.crossVectors(normal, x).normalize();

    // Calculate grid size
    const { size, divisions } = calculateGridSize();

    // Create sketch basis
    sketchBasis = { 
      origin, 
      x, 
      y, 
      z: normal, 
      gridSize: size, 
      gridDivisions: divisions 
    };
    sketchBasisStore.set(sketchBasis);
    
    console.log('[CameraAnim] Sketch basis created:', {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      normal: { x: normal.x, y: normal.y, z: normal.z },
      gridSize: size,
      gridDivisions: divisions
    });

    // Position camera perpendicular to plane
    // Distance based on grid size for good view
    const distance = size * 1.2;
    const newPos = origin.clone().add(normal.clone().multiplyScalar(distance));
    
    targetCameraPos = { x: newPos.x, y: newPos.y, z: newPos.z };
    targetCameraLookAt = { x: origin.x, y: origin.y, z: origin.z };
    
    // Calculate zoom for ortho camera
    // Zoom = viewport_size / grid_size
    // Higher zoom = more zoomed in
    if (camera instanceof THREE.OrthographicCamera) {
      targetZoom = 100 / size; // Adjust this factor for comfortable zoom level
    }
    
    animating = true;
    animatingStore.set(true);

    // Disable rotation immediately
    if (controls) {
      controls.enableRotate = false;
    }

    console.log(`[CameraAnim] Target camera:`, {
      position: targetCameraPos,
      lookAt: targetCameraLookAt,
      zoom: targetZoom,
      distance
    });
  }

  /**
   * Exit sketch mode - FIXED
   */
  function exitSketchMode(camera: THREE.Camera | null, controls: any): void {
    if (!savedCameraState || !camera || !controls) {
      console.warn('[CameraAnim] Cannot exit sketch mode - missing state');
      return;
    }

    console.log('[CameraAnim] Exiting sketch mode');

    targetCameraPos = { 
      x: savedCameraState.position.x, 
      y: savedCameraState.position.y, 
      z: savedCameraState.position.z 
    };
    targetCameraLookAt = {
      x: savedCameraState.target.x,
      y: savedCameraState.target.y,
      z: savedCameraState.target.z
    };
    
    if (camera instanceof THREE.OrthographicCamera && savedCameraState.zoom) {
      targetZoom = savedCameraState.zoom;
    }
    
    animating = true;
    animatingStore.set(true);

    // Re-enable rotation
    controls.enableRotate = true;

    sketchBasis = null;
    sketchBasisStore.set(null);
    savedCameraState = null;
  }

  /**
   * Update animation - FIXED
   */
  function updateAnimation(camera: THREE.Camera | null, controls: any): void {
    if (!camera || !controls || !animating) return;

    const lerp = 0.12; // Smooth interpolation
    
    // Interpolate position
    camera.position.x += (targetCameraPos.x - camera.position.x) * lerp;
    camera.position.y += (targetCameraPos.y - camera.position.y) * lerp;
    camera.position.z += (targetCameraPos.z - camera.position.z) * lerp;
    
    // Interpolate target
    if (controls.target) {
      controls.target.x += (targetCameraLookAt.x - controls.target.x) * lerp;
      controls.target.y += (targetCameraLookAt.y - controls.target.y) * lerp;
      controls.target.z += (targetCameraLookAt.z - controls.target.z) * lerp;
    }
    
    // Interpolate zoom for ortho camera
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom += (targetZoom - camera.zoom) * lerp;
      camera.updateProjectionMatrix();
    }
    
    // Update controls
    controls.update?.();
    
    // Check if animation is complete
    const dist = Math.abs(camera.position.x - targetCameraPos.x) +
                 Math.abs(camera.position.y - targetCameraPos.y) +
                 Math.abs(camera.position.z - targetCameraPos.z);
    
    if (dist < 0.1) {
      animating = false;
      animatingStore.set(false);
      console.log('[CameraAnim] Animation complete');
    }
  }

  return {
    get savedCameraState() { return savedCameraState; },
    get animating() { return animating; },
    get targetCameraPos() { return targetCameraPos; },
    get targetCameraLookAt() { return targetCameraLookAt; },
    get targetZoom() { return targetZoom; },
    get sketchBasis() { return sketchBasis; },
    animatingStore,
    sketchBasisStore,
    enterSketchMode,
    exitSketchMode,
    updateAnimation
  };
}
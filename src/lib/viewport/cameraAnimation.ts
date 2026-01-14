/**
 * cameraAnimation.ts
 * Handles camera animations and sketch mode transitions
 * FIXED: Ortho camera, grid scaling 1:1 z modelem, blokada rotacji
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
  gridSize: number; // Calculated based on model size
  gridDivisions: number;
}

export function useCameraAnimation(planes: Map<string, Plane>, getSolids: () => Map<string, Solid>) {
  let savedCameraState: CameraState | null = null;
  let animating = false;
  let targetCameraPos = { x: 50, y: 50, z: 50 };
  let targetCameraLookAt = { x: 0, y: 0, z: 0 };
  let targetZoom = 10;
  let sketchBasis: SketchBasis | null = null;

  const animatingStore = writable(false);
  const sketchBasisStore = writable<SketchBasis | null>(null);

  /**
   * Calculate grid size based on all models in scene
   * Returns grid size where 1 unit = 1 model unit
   */
  function calculateGridSize(): { size: number; divisions: number } {
    const solids = getSolids();
    if (solids.size === 0) {
      return { size: 200, divisions: 20 }; // Default
    }

    // Find bounding box of all models
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const solid of solids.values()) {
      // Get solid bounds from vertices
      for (const vertex of solid.vertices) {
        const worldPos = new THREE.Vector3(
          vertex.position3D.x + solid.position.x,
          vertex.position3D.y + solid.position.y,
          vertex.position3D.z + solid.position.z
        );
        minX = Math.min(minX, worldPos.x);
        minY = Math.min(minY, worldPos.y);
        minZ = Math.min(minZ, worldPos.z);
        maxX = Math.max(maxX, worldPos.x);
        maxY = Math.max(maxY, worldPos.y);
        maxZ = Math.max(maxZ, worldPos.z);
      }
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;
    const maxDim = Math.max(width, height, depth);

    // Grid should be at least 2x the model size
    const gridSize = Math.ceil(maxDim * 2 / 10) * 10; // Round up to nearest 10
    const divisions = gridSize / 10; // 1 division = 10 units, so grid shows individual units

    return {
      size: Math.max(gridSize, 100), // Minimum 100 units
      divisions: Math.max(divisions, 10)
    };
  }

  function enterSketchMode(
    planeId: string,
    camera: THREE.Camera | null,
    controls: any
  ): void {
    if (!camera || !controls) return;
    
    const plane = planes.get(planeId);
    if (!plane) return;

    // Save current camera state
    savedCameraState = {
      position: camera.position.clone(),
      target: controls.target?.clone() || new THREE.Vector3(),
      zoom: camera instanceof THREE.OrthographicCamera ? camera.zoom : undefined
    };

    const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
    const normal = new THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z).normalize();
    
    const worldUp = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    
    if (Math.abs(normal.dot(worldUp)) > 0.9) {
      x.crossVectors(new THREE.Vector3(1, 0, 0), normal).normalize();
    } else {
      x.crossVectors(worldUp, normal).normalize();
    }
    y.crossVectors(normal, x).normalize();

    // Calculate grid size based on models
    const { size, divisions } = calculateGridSize();

    sketchBasis = { origin, x, y, z: normal, gridSize: size, gridDivisions: divisions };
    sketchBasisStore.set(sketchBasis);

    // Position camera perpendicular to plane
    const distance = size * 0.8; // Camera at 80% of grid size for good view
    const newPos = origin.clone().add(normal.clone().multiplyScalar(distance));
    
    targetCameraPos = { x: newPos.x, y: newPos.y, z: newPos.z };
    targetCameraLookAt = { x: origin.x, y: origin.y, z: origin.z };
    
    // Calculate zoom for ortho camera (fit grid in view)
    if (camera instanceof THREE.OrthographicCamera) {
      targetZoom = 50 / size; // Adjust zoom so grid fits nicely
    }
    
    animating = true;
    animatingStore.set(true);

    // Disable rotation after animation completes
    setTimeout(() => {
      if (controls) controls.enableRotate = false;
    }, 600);
  }

  function exitSketchMode(camera: THREE.Camera | null, controls: any): void {
    if (savedCameraState && camera && controls) {
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

      if (controls) controls.enableRotate = true;
    }

    sketchBasis = null;
    sketchBasisStore.set(null);
    savedCameraState = null;
  }

  function updateAnimation(camera: THREE.Camera | null, controls: any): void {
    if (!camera || !controls || !animating) return;

    const lerp = 0.12;
    
    camera.position.x += (targetCameraPos.x - camera.position.x) * lerp;
    camera.position.y += (targetCameraPos.y - camera.position.y) * lerp;
    camera.position.z += (targetCameraPos.z - camera.position.z) * lerp;
    
    if (controls.target) {
      controls.target.x += (targetCameraLookAt.x - controls.target.x) * lerp;
      controls.target.y += (targetCameraLookAt.y - controls.target.y) * lerp;
      controls.target.z += (targetCameraLookAt.z - controls.target.z) * lerp;
    }
    
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom += (targetZoom - camera.zoom) * lerp;
      camera.updateProjectionMatrix();
    }
    
    controls.update?.();
    
    const dist = Math.abs(camera.position.x - targetCameraPos.x) +
                 Math.abs(camera.position.y - targetCameraPos.y) +
                 Math.abs(camera.position.z - targetCameraPos.z);
    if (dist < 0.1) {
      animating = false;
      animatingStore.set(false);
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
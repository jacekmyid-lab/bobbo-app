/**
 * cameraAnimation.ts
 * Handles camera animations and sketch mode transitions
 */

import * as THREE from 'three';
import type { Plane } from '$lib/core/types';

export function useCameraAnimation(planes: Map<string, Plane>) {
  let savedCameraState: { position: THREE.Vector3; target: THREE.Vector3 } | null = $state(null);
  let animating = $state(false);
  let targetCameraPos = $state({ x: 50, y: 50, z: 50 });
  let targetCameraLookAt = $state({ x: 0, y: 0, z: 0 });
  let sketchBasis: { 
    origin: THREE.Vector3; 
    x: THREE.Vector3; 
    y: THREE.Vector3; 
    z: THREE.Vector3 
  } | null = $state(null);

  /**
   * Enter sketch mode - animate camera to face plane
   */
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
      target: controls.target?.clone() || new THREE.Vector3()
    };

    // Compute plane basis
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

    sketchBasis = { origin, x, y, z: normal };

    // Set camera target position
    const distance = 100;
    const newPos = origin.clone().add(normal.clone().multiplyScalar(distance));
    
    targetCameraPos = { x: newPos.x, y: newPos.y, z: newPos.z };
    targetCameraLookAt = { x: origin.x, y: origin.y, z: origin.z };
    animating = true;

    // Disable rotation after animation
    setTimeout(() => {
      if (controls) controls.enableRotate = false;
    }, 600);
  }

  /**
   * Exit sketch mode - restore camera
   */
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
      animating = true;

      if (controls) controls.enableRotate = true;
    }

    sketchBasis = null;
    savedCameraState = null;
  }

  return {
    savedCameraState,
    animating,
    targetCameraPos,
    targetCameraLookAt,
    sketchBasis,
    enterSketchMode,
    exitSketchMode
  };
}
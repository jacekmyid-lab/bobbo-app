/**
 * cameraAnimation.ts
 * Handles camera animations and sketch mode transitions
 * FIXED: Używa zwykłych zmiennych zamiast $state (runes tylko w .svelte!)
 */

import * as THREE from 'three';
import { writable } from 'svelte/store';
import type { Plane } from '$lib/core/types';

interface CameraState {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

interface SketchBasis {
  origin: THREE.Vector3;
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
}

export function useCameraAnimation(planes: Map<string, Plane>) {
  // Używamy zwykłych zmiennych zamiast $state
  let savedCameraState: CameraState | null = null;
  let animating = false;
  let targetCameraPos = { x: 50, y: 50, z: 50 };
  let targetCameraLookAt = { x: 0, y: 0, z: 0 };
  let sketchBasis: SketchBasis | null = null;

  // Reactive store dla animating (żeby Svelte wiedział o zmianach)
  const animatingStore = writable(false);
  const sketchBasisStore = writable<SketchBasis | null>(null);

  function enterSketchMode(
    planeId: string,
    camera: THREE.Camera | null,
    controls: any
  ): void {
    if (!camera || !controls) return;
    
    const plane = planes.get(planeId);
    if (!plane) return;

    savedCameraState = {
      position: camera.position.clone(),
      target: controls.target?.clone() || new THREE.Vector3()
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

    sketchBasis = { origin, x, y, z: normal };
    sketchBasisStore.set(sketchBasis);

    const distance = 100;
    const newPos = origin.clone().add(normal.clone().multiplyScalar(distance));
    
    targetCameraPos = { x: newPos.x, y: newPos.y, z: newPos.z };
    targetCameraLookAt = { x: origin.x, y: origin.y, z: origin.z };
    animating = true;
    animatingStore.set(true);

    setTimeout(() => {
      if (controls) controls.enableRotate = false;
      animating = false;
      animatingStore.set(false);
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
      animating = true;
      animatingStore.set(true);

      if (controls) controls.enableRotate = true;
      
      setTimeout(() => {
        animating = false;
        animatingStore.set(false);
      }, 600);
    }

    sketchBasis = null;
    sketchBasisStore.set(null);
    savedCameraState = null;
  }

  // Zwracamy obiekty z getterami zamiast reactive values
  return {
    get savedCameraState() { return savedCameraState; },
    get animating() { return animating; },
    get targetCameraPos() { return targetCameraPos; },
    get targetCameraLookAt() { return targetCameraLookAt; },
    get sketchBasis() { return sketchBasis; },
    animatingStore,
    sketchBasisStore,
    enterSketchMode,
    exitSketchMode
  };
}
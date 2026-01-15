<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';
  import { onMount } from 'svelte';

  // Props - grid size calculated based on model (1:1 scale)
  let { basis } = $props<{
    basis: {
      origin: THREE.Vector3;
      x: THREE.Vector3;
      y: THREE.Vector3;
      z: THREE.Vector3;
      gridSize: number;
      gridDivisions: number;
    }
  }>();
  
  onMount(() => {
    console.log('[SketchGrid] Mounted with basis:', {
      origin: { x: basis.origin.x, y: basis.origin.y, z: basis.origin.z },
      gridSize: basis.gridSize,
      gridDivisions: basis.gridDivisions
    });
  });

  // Calculate quaternion for plane orientation
  let quat = $derived(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), 
      basis.z
    )
  );

  // Axis length proportional to grid
  const axisLength = $derived(basis.gridSize * 0.4);
</script>

<T.Group 
  position={[basis.origin.x, basis.origin.y, basis.origin.z]}
  quaternion={quat}
>
  <!-- Main grid - 1:1 scale with model units -->
  <!-- gridSize = total size, gridDivisions = number of major divisions (every 10 units) -->
  <!-- Make grid MORE VISIBLE with brighter colors and thicker lines -->
  <T.GridHelper 
    args={[basis.gridSize, basis.gridDivisions, 0x00d9ff, 0x0088cc]} 
  />
  
  <!-- X axis (red) in plane coordinates -->
  <T.Line>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[new Float32Array([-axisLength, 0, 0, axisLength, 0, 0]), 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial color="#ff4444" linewidth={3} />
  </T.Line>
  
  <!-- Y axis (green) in plane coordinates -->
  <T.Line>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[new Float32Array([0, 0, -axisLength, 0, 0, axisLength]), 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial color="#44ff44" linewidth={3} />
  </T.Line>
  
  <!-- Origin marker -->
  <T.Mesh>
    <T.SphereGeometry args={[0.8, 16, 16]} />
    <T.MeshBasicMaterial color="#06b6d4" />
  </T.Mesh>
  
  <!-- X axis label -->
  <T.Mesh position={[axisLength + 5, 0, 0]}>
    <T.SphereGeometry args={[1.2, 16, 16]} />
    <T.MeshBasicMaterial color="#ef4444" />
  </T.Mesh>
  
  <!-- Y axis label -->
  <T.Mesh position={[0, 0, axisLength + 5]}>
    <T.SphereGeometry args={[1.2, 16, 16]} />
    <T.MeshBasicMaterial color="#22c55e" />
  </T.Mesh>
</T.Group>

<!-- Sketch plane visualization (VISIBLE for debugging) -->
<T.Mesh 
  position={[basis.origin.x, basis.origin.y, basis.origin.z]}
  quaternion={quat}
>
  <T.PlaneGeometry args={[basis.gridSize, basis.gridSize]} />
  <T.MeshBasicMaterial 
    color="#00d9ff"
    transparent
    opacity={0.15}
    side={THREE.DoubleSide}
    depthTest={false}
  />
</T.Mesh>
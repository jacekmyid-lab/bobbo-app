<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';

  // Props - Svelte 5 runes mode
  let { basis } = $props<{
    basis: {
      origin: THREE.Vector3;
      x: THREE.Vector3;
      y: THREE.Vector3;
      z: THREE.Vector3;
    }
  }>();

  // Calculate quaternion for plane orientation
  let quat = $derived(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), 
      basis.z
    )
  );

  // Grid configuration
  const gridSize = 200;
  const gridDivisions = 40;
  const axisLength = 100;
</script>

<T.Group 
  position={[basis.origin.x, basis.origin.y, basis.origin.z]}
  quaternion={quat}
>
  <!-- Main grid -->
  <T.GridHelper args={[gridSize, gridDivisions, 0x06b6d4, 0x0e7490]} />
  
  <!-- X axis (red) -->
  <T.Line>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[new Float32Array([-axisLength, 0, 0, axisLength, 0, 0]), 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial color="#ef4444" linewidth={2} />
  </T.Line>
  
  <!-- Y axis (green) -->
  <T.Line>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[new Float32Array([0, 0, -axisLength, 0, 0, axisLength]), 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial color="#22c55e" linewidth={2} />
  </T.Line>
  
  <!-- Origin marker -->
  <T.Mesh>
    <T.SphereGeometry args={[0.5, 16, 16]} />
    <T.MeshBasicMaterial color="#06b6d4" />
  </T.Mesh>
  
  <!-- X axis label -->
  <T.Mesh position={[axisLength + 5, 0, 0]}>
    <T.SphereGeometry args={[1, 16, 16]} />
    <T.MeshBasicMaterial color="#ef4444" />
  </T.Mesh>
  
  <!-- Y axis label -->
  <T.Mesh position={[0, 0, axisLength + 5]}>
    <T.SphereGeometry args={[1, 16, 16]} />
    <T.MeshBasicMaterial color="#22c55e" />
  </T.Mesh>
</T.Group>

<!-- Sketch plane visualization (semi-transparent) -->
<T.Mesh 
  position={[basis.origin.x, basis.origin.y, basis.origin.z]}
  quaternion={quat}
>
  <T.PlaneGeometry args={[gridSize, gridSize]} />
  <T.MeshBasicMaterial 
    color="#06b6d4"
    transparent
    opacity={0.03}
    side={THREE.DoubleSide}
  />
</T.Mesh>
<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';

  // Props - now includes gridSize and gridDivisions
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

  // Calculate quaternion for plane orientation
  let quat = $derived(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), 
      basis.z
    )
  );

  // Use dynamic grid size from basis (calculated based on model size)
  const axisLength = $derived(basis.gridSize * 0.4);
</script>

<T.Group 
  position={[basis.origin.x, basis.origin.y, basis.origin.z]}
  quaternion={quat}
>
  <!-- Main grid - 1:1 scale with model units -->
  <T.GridHelper args={[basis.gridSize, basis.gridDivisions, 0x06b6d4, 0x0e7490]} />
  
  <!-- X axis (red) in plane coordinates -->
  <T.Line>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[new Float32Array([-axisLength, 0, 0, axisLength, 0, 0]), 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial color="#ef4444" linewidth={2} />
  </T.Line>
  
  <!-- Y axis (green) in plane coordinates -->
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
  <T.PlaneGeometry args={[basis.gridSize, basis.gridSize]} />
  <T.MeshBasicMaterial 
    color="#06b6d4"
    transparent
    opacity={0.03}
    side={THREE.DoubleSide}
  />
</T.Mesh>
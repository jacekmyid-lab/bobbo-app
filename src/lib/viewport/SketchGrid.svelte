<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';

  // Props - grid configuration from camera animation
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

  // Axis length proportional to grid
  const axisLength = $derived(basis.gridSize * 0.3);
  
  // Grid colors - more visible
  const gridColorCenter = $derived(0x00d9ff); // Cyan
  const gridColorGrid = $derived(0x006080);   // Darker cyan
</script>

<T.Group 
  position={[basis.origin.x, basis.origin.y, basis.origin.z]}
  quaternion={quat}
>
  <!-- Main grid - MORE VISIBLE -->
  <!-- gridSize = total size in units, gridDivisions = number of major lines -->
  <T.GridHelper 
    args={[basis.gridSize, basis.gridDivisions, gridColorCenter, gridColorGrid]}
    rotation={[Math.PI / 2, 0, 0]}
  />
  
  <!-- X axis (red) in plane coordinates -->
  <T.Line>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[new Float32Array([-axisLength, 0, 0, axisLength, 0, 0]), 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial color="#ff4444" linewidth={3} depthTest={false} />
  </T.Line>
  
  <!-- Y axis (green) in plane coordinates -->
  <T.Line>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[new Float32Array([0, 0, -axisLength, 0, 0, axisLength]), 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial color="#44ff44" linewidth={3} depthTest={false} />
  </T.Line>
  
  <!-- Origin marker -->
  <T.Mesh>
    <T.SphereGeometry args={[1.0, 16, 16]} />
    <T.MeshBasicMaterial color="#06b6d4" depthTest={false} />
  </T.Mesh>
  
  <!-- X axis label -->
  <T.Mesh position={[axisLength + 3, 0, 0]}>
    <T.SphereGeometry args={[1.5, 16, 16]} />
    <T.MeshBasicMaterial color="#ef4444" depthTest={false} />
  </T.Mesh>
  
  <!-- Y axis label -->
  <T.Mesh position={[0, 0, axisLength + 3]}>
    <T.SphereGeometry args={[1.5, 16, 16]} />
    <T.MeshBasicMaterial color="#22c55e" depthTest={false} />
  </T.Mesh>
</T.Group>

<!-- Sketch plane visualization (semi-transparent) -->
<T.Mesh 
  position={[basis.origin.x, basis.origin.y, basis.origin.z]}
  quaternion={quat}
>
  <T.PlaneGeometry args={[basis.gridSize, basis.gridSize]} />
  <T.MeshBasicMaterial 
    color="#00d9ff"
    transparent
    opacity={0.1}
    side={THREE.DoubleSide}
    depthTest={false}
  />
</T.Mesh>
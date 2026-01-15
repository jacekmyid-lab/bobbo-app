<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';
  import { onMount } from 'svelte';

  // Props
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
      origin: basis.origin,
      normal: basis.z,
      gridSize: basis.gridSize,
      divisions: basis.gridDivisions
    });
  });

  // Calculate quaternion for plane orientation
  let quat = $derived(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), 
      basis.z
    )
  );

  // Axis lengths
  const axisLength = $derived(basis.gridSize * 0.3);
  
  // Create grid manually for better visibility
  let gridPoints = $derived.by(() => {
    const points: number[] = [];
    const halfSize = basis.gridSize / 2;
    const step = basis.gridSize / basis.gridDivisions;
    
    // Major grid lines (every division)
    for (let i = 0; i <= basis.gridDivisions; i++) {
      const pos = -halfSize + i * step;
      // Horizontal lines (along X)
      points.push(-halfSize, 0, pos);
      points.push(halfSize, 0, pos);
      // Vertical lines (along Z/Y in plane space)
      points.push(pos, 0, -halfSize);
      points.push(pos, 0, halfSize);
    }
    
    return new Float32Array(points);
  });

  // Minor grid lines for better precision
  let minorGridPoints = $derived.by(() => {
    const points: number[] = [];
    const halfSize = basis.gridSize / 2;
    const step = basis.gridSize / basis.gridDivisions / 5; // 5 subdivisions
    const numLines = basis.gridDivisions * 5;
    
    for (let i = 0; i <= numLines; i++) {
      const pos = -halfSize + i * step;
      // Skip major lines
      if (i % 5 === 0) continue;
      
      points.push(-halfSize, 0, pos);
      points.push(halfSize, 0, pos);
      points.push(pos, 0, -halfSize);
      points.push(pos, 0, halfSize);
    }
    
    return new Float32Array(points);
  });

  console.log('[SketchGrid] Grid created with', gridPoints.length / 6, 'major lines');
</script>

<!-- Sketch Grid Group -->
<T.Group 
  position={[basis.origin.x, basis.origin.y, basis.origin.z]}
  quaternion={quat}
>
  <!-- Major grid lines (bright cyan) -->
  <T.LineSegments>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[gridPoints, 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial 
      color="#00d9ff" 
      linewidth={2}
      transparent
      opacity={0.8}
      depthTest={false}
    />
  </T.LineSegments>

  <!-- Minor grid lines (darker cyan) -->
  <T.LineSegments>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[minorGridPoints, 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial 
      color="#006080" 
      linewidth={1}
      transparent
      opacity={0.4}
      depthTest={false}
    />
  </T.LineSegments>
  
  <!-- X axis (red) -->
  <T.Line>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[new Float32Array([0, 0, 0, axisLength, 0, 0]), 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial color="#ff4444" linewidth={4} depthTest={false} />
  </T.Line>
  
  <!-- Y axis in plane (green) - this is Z in local coords -->
  <T.Line>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[new Float32Array([0, 0, 0, 0, 0, axisLength]), 3]}
      />
    </T.BufferGeometry>
    <T.LineBasicMaterial color="#44ff44" linewidth={4} depthTest={false} />
  </T.Line>
  
  <!-- Origin marker (large cyan sphere) -->
  <T.Mesh>
    <T.SphereGeometry args={[1.5, 16, 16]} />
    <T.MeshBasicMaterial color="#06b6d4" depthTest={false} />
  </T.Mesh>
  
  <!-- X axis endpoint -->
  <T.Mesh position={[axisLength + 3, 0, 0]}>
    <T.SphereGeometry args={[2, 16, 16]} />
    <T.MeshBasicMaterial color="#ef4444" depthTest={false} />
  </T.Mesh>
  
  <!-- Y axis endpoint -->
  <T.Mesh position={[0, 0, axisLength + 3]}>
    <T.SphereGeometry args={[2, 16, 16]} />
    <T.MeshBasicMaterial color="#22c55e" depthTest={false} />
  </T.Mesh>
</T.Group>

<!-- Semi-transparent plane surface -->
<T.Mesh 
  position={[basis.origin.x, basis.origin.y, basis.origin.z]}
  quaternion={quat}
  renderOrder={-1}
>
  <T.PlaneGeometry args={[basis.gridSize, basis.gridSize]} />
  <T.MeshBasicMaterial 
    color="#00d9ff"
    transparent
    opacity={0.05}
    side={THREE.DoubleSide}
    depthTest={false}
    depthWrite={false}
  />
</T.Mesh>
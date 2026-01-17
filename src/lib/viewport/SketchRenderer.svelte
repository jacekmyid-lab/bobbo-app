<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';
  import type { Plane, SketchEntity, Point2D } from '../core/types';

  // Props
  export let plane: Plane;
  export let entities: SketchEntity[] = [];
  export let selectedEntityIds: string[] = [];
  export let hoveredEntityId: string | null = null;

  // Colors
  const COLORS = {
    normal: '#ffff00',       // ŻÓŁTY
    selected: '#f59e0b',     // Amber
    hovered: '#22c55e',      // Green
    construction: '#6366f1', // Indigo
    point: '#ff0000',        // CZERWONY
    closedProfile: '#00ff00' // ZIELONY dla zamkniętych profili
  };

  // Convert 2D point to 3D using plane coordinates
  function to3D(p: Point2D): THREE.Vector3 {
    const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
    const xAxis = new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z);
    const yAxis = new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z);
    
    return origin
      .clone()
      .add(xAxis.clone().multiplyScalar(p.x))
      .add(yAxis.clone().multiplyScalar(p.y));
  }

  // Helper to create thick line using mesh (cylinder)
  function createThickLine(start: THREE.Vector3, end: THREE.Vector3, color: string, thickness: number) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    const geometry = new THREE.CylinderGeometry(thickness, thickness, length, 8);
    const material = new THREE.MeshBasicMaterial({ color });
    
    // Rotate to align with direction
    const orientation = new THREE.Matrix4();
    orientation.lookAt(start, end, new THREE.Object3D().up);
    orientation.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    geometry.applyMatrix4(orientation);
    
    return { geometry, material, position: midpoint };
  }

  // Check if entity is part of a closed profile
  function isPartOfClosedProfile(entity: SketchEntity): boolean {
    // Standalone closed shapes
    if (entity.type === 'circle' || entity.type === 'rectangle') return true;
    if (entity.type === 'polyline' && entity.closed) return true;
    
    // Check if entity is part of a closed chain
    if (entity.connections && entity.connections.length >= 2) {
      // Try to find a closed loop
      const visited = new Set<string>();
      const stack = [entity.id];
      
      while (stack.length > 0) {
        const currentId = stack.pop()!;
        if (visited.has(currentId)) {
          // Found a cycle - it's closed!
          return true;
        }
        visited.add(currentId);
        
        const current = entities.find(e => e.id === currentId);
        if (!current || !current.connections) continue;
        
        for (const connId of current.connections) {
          if (!visited.has(connId)) {
            stack.push(connId);
          } else if (connId === entity.id && visited.size > 2) {
            return true; // Cycle back to start
          }
        }
        
        // Limit search depth to avoid infinite loops
        if (visited.size > 100) break;
      }
    }
    
    return false;
  }
</script>

{#each entities as entity (entity.id)}
  {@const isSelected = selectedEntityIds.includes(entity.id)}
  {@const isHovered = hoveredEntityId === entity.id}
  {@const isClosed = isPartOfClosedProfile(entity)}
  
  {@const color = isSelected ? 
    COLORS.selected : (isHovered ? COLORS.hovered : (isClosed ? COLORS.closedProfile : (entity.construction ? COLORS.construction : COLORS.normal)))}
  
  {@const lineThickness = isSelected || isHovered ? 0.4 : 0.3}
  {@const pointSize = isSelected || isHovered ? 1.0 : 0.8}

  {#if entity.type === 'line'}
    {@const start = to3D(entity.start)}
    {@const end = to3D(entity.end)}
    {@const lineData = createThickLine(start, end, color, lineThickness)}
    
    <!-- Thick line as mesh -->
    <T.Mesh position={lineData.position.toArray()} geometry={lineData.geometry} material={lineData.material} />
    
    <!-- Endpoint markers -->
    <T.Mesh position={start.toArray()}>
      <T.SphereGeometry args={[pointSize, 16, 16]} />
      <T.MeshBasicMaterial color={COLORS.point} />
    </T.Mesh>
    
    <T.Mesh position={end.toArray()}>
      <T.SphereGeometry args={[pointSize, 16, 16]} />
      <T.MeshBasicMaterial color={COLORS.point} />
    </T.Mesh>

  {:else if entity.type === 'polyline'}
    {@const polyPoints = entity.points.map(p => to3D(p))}
    {@const displayPoints = entity.closed ? [...polyPoints, polyPoints[0]] : polyPoints}
    
    <!-- Draw segments -->
    {#each displayPoints.slice(0, -1) as point, i}
      {@const nextPoint = displayPoints[i + 1]}
      {@const lineData = createThickLine(point, nextPoint, color, lineThickness)}
      <T.Mesh position={lineData.position.toArray()} geometry={lineData.geometry} material={lineData.material} />
    {/each}
    
    <!-- Endpoint markers -->
    {#each polyPoints as point}
      <T.Mesh position={point.toArray()}>
        <T.SphereGeometry args={[pointSize, 16, 16]} />
        <T.MeshBasicMaterial color={COLORS.point} />
      </T.Mesh>
    {/each}

  {:else if entity.type === 'rectangle'}
    {@const corner = to3D(entity.corner)}
    {@const p2 = to3D({ x: entity.corner.x + entity.width, y: entity.corner.y })}
    {@const p3 = to3D({ x: entity.corner.x + entity.width, y: entity.corner.y + entity.height })}
    {@const p4 = to3D({ x: entity.corner.x, y: entity.corner.y + entity.height })}
    {@const points = [corner, p2, p3, p4, corner]}
    
    <!-- Draw segments -->
    {#each points.slice(0, -1) as point, i}
      {@const nextPoint = points[i + 1]}
      {@const lineData = createThickLine(point, nextPoint, color, lineThickness)}
      <T.Mesh position={lineData.position.toArray()} geometry={lineData.geometry} material={lineData.material} />
    {/each}
    
    <!-- Corner markers -->
    {#each [corner, p2, p3, p4] as point}
      <T.Mesh position={point.toArray()}>
        <T.SphereGeometry args={[pointSize, 16, 16]} />
        <T.MeshBasicMaterial color={COLORS.point} />
      </T.Mesh>
    {/each}

  {:else if entity.type === 'circle'}
    {@const segments = 64}
    {@const points = []}
    {#each { length: segments + 1 } as _, i}
      {@const theta = (i / segments) * Math.PI * 2}
      {@const x = entity.center.x + Math.cos(theta) * entity.radius}
      {@const y = entity.center.y + Math.sin(theta) * entity.radius}
      {@const __ = points.push(to3D({ x, y }))}
    {/each}
    
    <!-- Draw segments -->
    {#each points.slice(0, -1) as point, i}
      {@const nextPoint = points[i + 1]}
      {@const lineData = createThickLine(point, nextPoint, color, lineThickness)}
      <T.Mesh position={lineData.position.toArray()} geometry={lineData.geometry} material={lineData.material} />
    {/each}
    
    <!-- Center marker -->
    <T.Mesh position={to3D(entity.center).toArray()}>
      <T.SphereGeometry args={[pointSize, 16, 16]} />
      <T.MeshBasicMaterial color={COLORS.point} />
    </T.Mesh>

  {:else if entity.type === 'point'}
    <T.Mesh position={to3D(entity.location).toArray()}>
      <T.SphereGeometry args={[pointSize + 0.1, 16, 16]} />
      <T.MeshBasicMaterial {color} />
    </T.Mesh>
  {/if}
{/each}
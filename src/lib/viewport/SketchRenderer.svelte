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
    normal: '#06b6d4',       // Cyan
    selected: '#f59e0b',     // Amber
    hovered: '#22c55e',      // Green
    construction: '#6366f1', // Indigo
    point: '#ffffff'
  };

  // Convert 2D point to 3D using plane coordinates
  function to3D(p: Point2D): THREE.Vector3 {
    const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
    const xAxis = new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z);
    const yAxis = new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z);
    
    return origin
      .add(xAxis.multiplyScalar(p.x))
      .add(yAxis.multiplyScalar(p.y));
  }

  // Helper to create line geometry from points
  function createLineGeometry(points: THREE.Vector3[]) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return geometry;
  }
</script>

{#each entities as entity (entity.id)}
  {@const isSelected = selectedEntityIds.includes(entity.id)}
  {@const isHovered = hoveredEntityId === entity.id}
  
  {@const color = isSelected ? COLORS.selected : (isHovered ? COLORS.hovered : (entity.construction ? COLORS.construction : COLORS.normal))}
  
  {@const lineWidth = isSelected || isHovered ? 4 : 2} 
  
  {@const pointSize = isSelected || isHovered ? 8 : 6}

  {#if entity.type === 'line'}
    {@const start = to3D(entity.start)}
    {@const end = to3D(entity.end)}
    
    <T.Line geometry={createLineGeometry([start, end])}>
      <T.LineBasicMaterial {color} linewidth={lineWidth} />
    </T.Line>
    
    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array([...start.toArray(), ...end.toArray()]), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial color={COLORS.point} size={pointSize} sizeAttenuation={false} />
    </T.Points>

  {:else if entity.type === 'rectangle'}
    {@const corner = to3D(entity.corner)}
    {@const p2 = to3D({ x: entity.corner.x + entity.width, y: entity.corner.y })}
    {@const p3 = to3D({ x: entity.corner.x + entity.width, y: entity.corner.y + entity.height })}
    {@const p4 = to3D({ x: entity.corner.x, y: entity.corner.y + entity.height })}
    {@const points = [corner, p2, p3, p4, corner]}
    
    <T.Line geometry={createLineGeometry(points)}>
      <T.LineBasicMaterial {color} linewidth={lineWidth} />
    </T.Line>
    
    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array(points.slice(0, 4).flatMap(p => p.toArray())), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial color={COLORS.point} size={pointSize} sizeAttenuation={false} />
    </T.Points>
    
  {:else if entity.type === 'polyline'}
    {@const points = entity.points.map(p => to3D(p))}
    
    {#if entity.closed}
      {@const closedPoints = [...points, points[0]]}
      <T.Line geometry={createLineGeometry(closedPoints)}>
        <T.LineBasicMaterial {color} linewidth={lineWidth} />
      </T.Line>
    {:else}
      <T.Line geometry={createLineGeometry(points)}>
        <T.LineBasicMaterial {color} linewidth={lineWidth} />
      </T.Line>
    {/if}

    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array(points.flatMap(p => p.toArray())), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial color={COLORS.point} size={pointSize} sizeAttenuation={false} />
    </T.Points>
    
  {:else if entity.type === 'point'}
    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array(to3D(entity.location).toArray()), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial {color} size={pointSize + 2} sizeAttenuation={false} />
    </T.Points>

  {:else if entity.type === 'circle'}
    {@const segments = 64}
    {@const points = []}
    {#each { length: segments + 1 } as _, i}
      {@const theta = (i / segments) * Math.PI * 2}
      {@const x = entity.center.x + Math.cos(theta) * entity.radius}
      {@const y = entity.center.y + Math.sin(theta) * entity.radius}
      {@const __ = points.push(to3D({ x, y }))}
    {/each}
    
    <T.Line geometry={createLineGeometry(points)}>
      <T.LineBasicMaterial {color} linewidth={lineWidth} />
    </T.Line>
    
    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array(to3D(entity.center).toArray()), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial color={COLORS.point} size={pointSize - 2} sizeAttenuation={false} />
    </T.Points>
  {/if}
{/each}
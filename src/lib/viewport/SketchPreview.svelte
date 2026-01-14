<!--
  SketchPreview.svelte
  Shows preview of sketch entities being drawn
-->
<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';
  import type { Plane } from '$lib/core/types';
  import type { PolylineTool, LineTool, CircleTool, RectangleTool } from './sketchTools';

  // Props
  export let tool: PolylineTool | LineTool | CircleTool | RectangleTool | null;
  export let plane: Plane;
  export let toolType: string;

  /**
   * Convert 2D plane point to 3D world point
   */
  function planeToWorld(x: number, y: number): THREE.Vector3 {
    const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
    const xAxis = new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z);
    const yAxis = new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z);
    
    return origin.clone()
      .add(xAxis.clone().multiplyScalar(x))
      .add(yAxis.clone().multiplyScalar(y));
  }

  /**
   * Generate polyline preview geometry
   */
  function getPolylineGeometry(polylineTool: PolylineTool): THREE.BufferGeometry | null {
    const points = polylineTool.getPoints();
    const current = polylineTool.getCurrentPoint();
    
    if (points.length === 0) return null;

    const positions: number[] = [];
    
    // Add all existing points
    for (const p of points) {
      const world = planeToWorld(p.x, p.y);
      positions.push(world.x, world.y, world.z);
    }
    
    // Add current point if exists
    if (current) {
      const world = planeToWorld(current.x, current.y);
      positions.push(world.x, world.y, world.z);
      
      // If can close, add line back to start
      if (polylineTool.canClose() && points.length > 0) {
        const first = planeToWorld(points[0].x, points[0].y);
        positions.push(first.x, first.y, first.z);
      }
    }
    
    if (positions.length < 6) return null; // Need at least 2 points
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }

  /**
   * Generate line preview geometry
   */
  function getLineGeometry(lineTool: LineTool): THREE.BufferGeometry | null {
    const start = lineTool.getStartPoint();
    const end = lineTool.getEndPoint();
    
    if (!start || !end) return null;
    
    const worldStart = planeToWorld(start.x, start.y);
    const worldEnd = planeToWorld(end.x, end.y);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      worldStart.x, worldStart.y, worldStart.z,
      worldEnd.x, worldEnd.y, worldEnd.z
    ], 3));
    
    return geometry;
  }

  /**
   * Generate circle preview geometry
   */
  function getCircleGeometry(circleTool: CircleTool): THREE.BufferGeometry | null {
    const center = circleTool.getCenter();
    const radius = circleTool.getRadius();
    
    if (!center || radius < 0.1) return null;
    
    const segments = 64;
    const positions: number[] = [];
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      const world = planeToWorld(x, y);
      positions.push(world.x, world.y, world.z);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }

  /**
   * Generate rectangle preview geometry
   */
  function getRectangleGeometry(rectTool: RectangleTool): THREE.BufferGeometry | null {
    const corner = rectTool.getCorner();
    const opposite = rectTool.getOppositeCorner();
    
    if (!corner || !opposite) return null;
    
    const p1 = planeToWorld(corner.x, corner.y);
    const p2 = planeToWorld(opposite.x, corner.y);
    const p3 = planeToWorld(opposite.x, opposite.y);
    const p4 = planeToWorld(corner.x, opposite.y);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p3.x, p3.y, p3.z,
      p4.x, p4.y, p4.z,
      p1.x, p1.y, p1.z  // Close the loop
    ], 3));
    
    return geometry;
  }

  /**
   * Get points for point markers
   */
  function getPointMarkers(): THREE.Vector3[] {
    if (!tool) return [];
    
    const points: THREE.Vector3[] = [];
    
    if (toolType === 'sketch-polyline' && tool instanceof Object && 'getPoints' in tool) {
      const polyPoints = (tool as PolylineTool).getPoints();
      for (const p of polyPoints) {
        points.push(planeToWorld(p.x, p.y));
      }
    } else if (toolType === 'sketch-line' && tool instanceof Object && 'getStartPoint' in tool) {
      const start = (tool as LineTool).getStartPoint();
      if (start) {
        points.push(planeToWorld(start.x, start.y));
      }
    } else if (toolType === 'sketch-circle' && tool instanceof Object && 'getCenter' in tool) {
      const center = (tool as CircleTool).getCenter();
      if (center) {
        points.push(planeToWorld(center.x, center.y));
      }
    } else if (toolType === 'sketch-rectangle' && tool instanceof Object && 'getCorner' in tool) {
      const corner = (tool as RectangleTool).getCorner();
      if (corner) {
        points.push(planeToWorld(corner.x, corner.y));
      }
    }
    
    return points;
  }

  // Computed geometry
  let previewGeometry = $derived.by(() => {
    if (!tool) return null;
    
    switch (toolType) {
      case 'sketch-polyline':
        return tool instanceof Object && 'getPoints' in tool 
          ? getPolylineGeometry(tool as PolylineTool) 
          : null;
      case 'sketch-line':
        return tool instanceof Object && 'getStartPoint' in tool 
          ? getLineGeometry(tool as LineTool) 
          : null;
      case 'sketch-circle':
        return tool instanceof Object && 'getCenter' in tool 
          ? getCircleGeometry(tool as CircleTool) 
          : null;
      case 'sketch-rectangle':
        return tool instanceof Object && 'getCorner' in tool 
          ? getRectangleGeometry(tool as RectangleTool) 
          : null;
      default:
        return null;
    }
  });

  let pointMarkers = $derived(getPointMarkers());
</script>

<!-- Preview line -->
{#if previewGeometry}
  <T.Line geometry={previewGeometry}>
    <T.LineBasicMaterial color="#06b6d4" linewidth={2} />
  </T.Line>
{/if}

<!-- Point markers -->
{#if pointMarkers.length > 0}
  <T.Points>
    <T.BufferGeometry>
      <T.BufferAttribute
        attach="attributes-position"
        args={[new Float32Array(pointMarkers.flatMap(p => [p.x, p.y, p.z])), 3]}
      />
    </T.BufferGeometry>
    <T.PointsMaterial color="#ffffff" size={8} sizeAttenuation={false} />
  </T.Points>
{/if}

<!-- Close indicator for polyline -->
{#if toolType === 'sketch-polyline' && tool instanceof Object && 'canClose' in tool && (tool as PolylineTool).canClose()}
  {@const points = (tool as PolylineTool).getPoints()}
  {#if points.length > 0}
    {@const firstPoint = planeToWorld(points[0].x, points[0].y)}
    <T.Mesh position={[firstPoint.x, firstPoint.y, firstPoint.z]}>
      <T.SphereGeometry args={[1.5, 16, 16]} />
      <T.MeshBasicMaterial color="#22c55e" transparent opacity={0.8} />
    </T.Mesh>
  {/if}
{/if}
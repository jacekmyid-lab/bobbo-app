<!--
  SketchPreview.svelte
  Shows preview of sketch entities being drawn with thick lines
-->
<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';
  import type { Plane } from '$lib/core/types';
  import type { PolylineTool, LineTool, CircleTool, RectangleTool, OffsetTool } from './sketchTools';

  // Props using $props()
  let { tool, plane, toolType } = $props<{
    tool: PolylineTool | LineTool | CircleTool | RectangleTool | OffsetTool | null;
    plane: Plane;
    toolType: string;
  }>();

  // Thickness for preview lines
  const PREVIEW_LINE_THICKNESS = 0.25;
  const PREVIEW_POINT_SIZE = 0.7;

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
   * Helper to create thick line using mesh (cylinder)
   */
  function createThickLine(start: THREE.Vector3, end: THREE.Vector3, thickness: number) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    const geometry = new THREE.CylinderGeometry(thickness, thickness, length, 8);
    
    // Rotate to align with direction
    const orientation = new THREE.Matrix4();
    orientation.lookAt(start, end, new THREE.Object3D().up);
    orientation.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    geometry.applyMatrix4(orientation);
    
    return { geometry, position: midpoint };
  }

  /**
   * Generate polyline preview segments
   */
  function getPolylineSegments(polylineTool: PolylineTool): Array<{start: THREE.Vector3, end: THREE.Vector3}> {
    const points = polylineTool.getPoints();
    const current = polylineTool.getCurrentPoint();
    
    if (points.length === 0) return [];

    const segments: Array<{start: THREE.Vector3, end: THREE.Vector3}> = [];
    
    // Add all existing segments
    for (let i = 0; i < points.length - 1; i++) {
      segments.push({
        start: planeToWorld(points[i].x, points[i].y),
        end: planeToWorld(points[i + 1].x, points[i + 1].y)
      });
    }
    
    // Add current segment if exists
    if (current && points.length > 0) {
      segments.push({
        start: planeToWorld(points[points.length - 1].x, points[points.length - 1].y),
        end: planeToWorld(current.x, current.y)
      });
      
      // If can close, add line back to start
      if (polylineTool.canClose()) {
        segments.push({
          start: planeToWorld(current.x, current.y),
          end: planeToWorld(points[0].x, points[0].y)
        });
      }
    }
    
    return segments;
  }

  /**
   * Generate offset arrow segment
   */
  function getOffsetArrowSegment(offsetTool: OffsetTool): {start: THREE.Vector3, end: THREE.Vector3} | null {
    if (!('getPreviewArrow' in offsetTool)) return null;
    
    const arrow = offsetTool.getPreviewArrow();
    if (!arrow) return null;

    return {
      start: planeToWorld(arrow.start.x, arrow.start.y),
      end: planeToWorld(arrow.end.x, arrow.end.y)
    };
  }

  /**
   * Generate line preview segment
   */
  function getLineSegment(lineTool: LineTool): {start: THREE.Vector3, end: THREE.Vector3} | null {
    const start = lineTool.getStartPoint();
    const end = lineTool.getEndPoint();
    
    if (!start || !end) return null;
    
    return {
      start: planeToWorld(start.x, start.y),
      end: planeToWorld(end.x, end.y)
    };
  }

  /**
   * Generate circle preview segments
   */
  function getCircleSegments(circleTool: CircleTool): Array<{start: THREE.Vector3, end: THREE.Vector3}> {
    const center = circleTool.getCenter();
    const radius = circleTool.getRadius();
    
    if (!center || radius < 0.1) return [];
    
    const segments: Array<{start: THREE.Vector3, end: THREE.Vector3}> = [];
    const numSegments = 64;
    
    for (let i = 0; i < numSegments; i++) {
      const angle1 = (i / numSegments) * Math.PI * 2;
      const angle2 = ((i + 1) / numSegments) * Math.PI * 2;
      
      const x1 = center.x + radius * Math.cos(angle1);
      const y1 = center.y + radius * Math.sin(angle1);
      const x2 = center.x + radius * Math.cos(angle2);
      const y2 = center.y + radius * Math.sin(angle2);
      
      segments.push({
        start: planeToWorld(x1, y1),
        end: planeToWorld(x2, y2)
      });
    }
    
    return segments;
  }

  /**
   * Generate rectangle preview segments
   */
  function getRectangleSegments(rectTool: RectangleTool): Array<{start: THREE.Vector3, end: THREE.Vector3}> {
    const corner = rectTool.getCorner();
    const opposite = rectTool.getOppositeCorner();
    
    if (!corner || !opposite) return [];
    
    const p1 = planeToWorld(corner.x, corner.y);
    const p2 = planeToWorld(opposite.x, corner.y);
    const p3 = planeToWorld(opposite.x, opposite.y);
    const p4 = planeToWorld(corner.x, opposite.y);
    
    return [
      { start: p1, end: p2 },
      { start: p2, end: p3 },
      { start: p3, end: p4 },
      { start: p4, end: p1 }
    ];
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

  // Computed segments
  let previewSegments = $derived.by(() => {
    if (!tool) return [];
    
    switch (toolType) {
      case 'sketch-polyline':
        return tool instanceof Object && 'getPoints' in tool 
          ? getPolylineSegments(tool as PolylineTool) 
          : [];
      case 'sketch-line':
        if (tool instanceof Object && 'getStartPoint' in tool) {
          const seg = getLineSegment(tool as LineTool);
          return seg ? [seg] : [];
        }
        return [];
      case 'sketch-circle':
        return tool instanceof Object && 'getCenter' in tool 
          ? getCircleSegments(tool as CircleTool) 
          : [];
      case 'sketch-rectangle':
        return tool instanceof Object && 'getCorner' in tool 
          ? getRectangleSegments(tool as RectangleTool) 
          : [];
      case 'sketch-offset':
        if (tool instanceof Object && 'getPreviewArrow' in tool) {
          const seg = getOffsetArrowSegment(tool as OffsetTool);
          return seg ? [seg] : [];
        }
        return [];
      default:
        return [];
    }
  });

  let pointMarkers = $derived(getPointMarkers());
  let isOffsetTool = $derived(toolType === 'sketch-offset');
  let previewColor = $derived(isOffsetTool ? '#f59e0b' : '#06b6d4');
</script>

<!-- Preview thick lines -->
{#each previewSegments as segment}
  {@const lineData = createThickLine(segment.start, segment.end, PREVIEW_LINE_THICKNESS)}
  <T.Mesh position={lineData.position.toArray()} geometry={lineData.geometry}>
    <T.MeshBasicMaterial color={previewColor} />
  </T.Mesh>
{/each}

<!-- Point markers -->
{#each pointMarkers as point}
  <T.Mesh position={[point.x, point.y, point.z]}>
    <T.SphereGeometry args={[PREVIEW_POINT_SIZE, 16, 16]} />
    <T.MeshBasicMaterial color="#ffffff" />
  </T.Mesh>
{/each}

<!-- Close indicator for polyline -->
{#if toolType === 'sketch-polyline' && tool instanceof Object && 'canClose' in tool && (tool as PolylineTool).canClose()}
  {@const points = (tool as PolylineTool).getPoints()}
  {#if points.length > 0}
    {@const firstPoint = planeToWorld(points[0].x, points[0].y)}
    <T.Mesh position={[firstPoint.x, firstPoint.y, firstPoint.z]}>
      <T.SphereGeometry args={[1.2, 16, 16]} />
      <T.MeshBasicMaterial color="#22c55e" transparent opacity={0.8} />
    </T.Mesh>
  {/if}
{/if}

<!-- Offset arrow end marker -->
{#if isOffsetTool && previewSegments.length > 0}
  {@const lastSegment = previewSegments[previewSegments.length - 1]}
  {@const endPos = lastSegment.end}
  <T.Mesh position={[endPos.x, endPos.y, endPos.z]}>
    <T.SphereGeometry args={[0.8, 16, 16]} />
    <T.MeshBasicMaterial color="#f59e0b" />
  </T.Mesh>
{/if}
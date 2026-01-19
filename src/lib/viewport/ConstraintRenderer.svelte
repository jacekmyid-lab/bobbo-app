<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';
  import { Text } from '@threlte/extras';
  import type { Plane, Constraint, SketchEntity, SketchNode, Point2D } from '$lib/core/types';

  export let plane: Plane;
  export let constraints: Constraint[] = [];
  export let entities: SketchEntity[] = [];
  export let nodes: Map<string, SketchNode> = new Map();

  let entityMap = new Map<string, SketchEntity>();
  $: {
    entityMap.clear();
    entities.forEach(e => entityMap.set(e.id, e));
  }

  function to3D(p: Point2D): THREE.Vector3 {
    const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
    const xAxis = new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z);
    const yAxis = new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z);
    return origin.clone().add(xAxis.clone().multiplyScalar(p.x)).add(yAxis.clone().multiplyScalar(p.y));
  }

  function getConstraintPosition(constraint: Constraint): { pos: THREE.Vector3, rot: THREE.Euler } | null {
    if (!constraint.entityIds || constraint.entityIds.length === 0) return null;
    const entity = entityMap.get(constraint.entityIds[0]);
    if (!entity || entity.type !== 'line') return null;

    const n1 = nodes.get(entity.startNodeId);
    const n2 = nodes.get(entity.endNodeId);
    if (!n1 || !n2) return null;

    const p1 = to3D({ x: n1.x, y: n1.y });
    const p2 = to3D({ x: n2.x, y: n2.y });
    
    // Środek linii
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

    // Oblicz wektor kierunkowy linii w 3D
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    
    // Oblicz wektor normalny (w płaszczyźnie szkicu)
    // Zakładamy, że normalna płaszczyzny to Z (lokalnie) lub używamy iloczynu wektorowego z normalną plane'a
    const planeNormal = new THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z);
    const sideVec = new THREE.Vector3().crossVectors(dir, planeNormal).normalize();

    // PRZESUNIĘCIE W BOK (Offset)
    const OFFSET_DISTANCE = 4.0; // Duże przesunięcie
    mid.add(sideVec.multiplyScalar(OFFSET_DISTANCE));

    // Rotacja tekstu, żeby był czytelny (opcjonalne, na razie płasko do kamery)
    const rot = new THREE.Euler(0, 0, 0);

    return { pos: mid, rot };
  }

  function getConstraintSymbol(type: string): string {
    switch (type) {
      case 'vertical': return 'V';
      case 'horizontal': return 'H';
      default: return '?';
    }
  }
  
  const ICON_BG = '#0f172a'; // Ciemniejszy granat
  const ICON_FG = '#facc15'; // Żółty dla lepszej widoczności
</script>

{#each constraints as constraint (constraint.id)}
  {@const data = getConstraintPosition(constraint)}
  {@const symbol = getConstraintSymbol(constraint.type)}

  {#if data && constraint.enabled}
    <T.Group position={data.pos.toArray()}>
      <T.Mesh>
        <T.PlaneGeometry args={[6.0, 6.0]} /> 
        <T.MeshBasicMaterial color={ICON_BG} transparent opacity={0.8} depthTest={false} />
      </T.Mesh>
      
      <Text
        text={symbol}
        fontSize={4.0} 
        color={ICON_FG}
        anchorX="center"
        anchorY="middle"
        position.z={0.1} 
      />
    </T.Group>
  {/if}
{/each}
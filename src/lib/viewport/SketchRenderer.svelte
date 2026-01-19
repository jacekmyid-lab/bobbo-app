<script lang="ts">
  /**
   * SketchRenderer.svelte (NODE-BASED)
   * Renderuje geometrię szkicu, pobierając współrzędne z Węzłów (Nodes).
   */

  import { T } from '@threlte/core';
  import * as THREE from 'three';
  import type { Plane, SketchEntity, SketchNode, Point2D } from '$lib/core/types';

  // --- PROPS ---
  export let plane: Plane;
  export let entities: SketchEntity[] = [];
  
  // NOWE: Musimy mieć dostęp do bazy punktów (Węzłów)
  // Dajemy domyślną pustą mapę, żeby nie wybuchło przy inicjalizacji
  export let nodes: Map<string, SketchNode> = new Map();
  
  // Profile do wypełnienia (niebieskie tło)
  export let profiles: Point2D[][] = []; 
  
  export let selectedEntityIds: string[] = [];
  export let hoveredEntityId: string | null = null;

  // --- KOLORY ---
  const COLORS = {
    normal: '#ffff00',       // Żółty
    selected: '#f59e0b',     // Bursztynowy
    hovered: '#22c55e',      // Zielony
    construction: '#6366f1', // Indigo (linie konstrukcyjne)
    point: '#ff0000',        // Czerwony (punkty węzłów)
    closedProfile: '#00ff00',// Zielony (zamknięta pętla - krawędź)
    fill: '#3b82f6'         // Niebieski (wypełnienie wnętrza)
  };

  // --- HELPERY ---

  // Konwersja 2D -> 3D na płaszczyźnie
  function to3D(p: Point2D): THREE.Vector3 {
    const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
    const xAxis = new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z);
    const yAxis = new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z);
    
    return origin
      .clone()
      .add(xAxis.clone().multiplyScalar(p.x))
      .add(yAxis.clone().multiplyScalar(p.y));
  }

  // NOWE: Pobieranie współrzędnych 3D z ID węzła
  function getNode3D(nodeId: string): THREE.Vector3 | null {
    if (!nodes) return null;
    const n = nodes.get(nodeId);
    if (!n) return null;
    return to3D({ x: n.x, y: n.y });
  }

  // Tworzenie grubej linii (Cylinder)
  function createThickLine(start: THREE.Vector3, end: THREE.Vector3, color: string, thickness: number) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    
    // Jeśli punkty są w tym samym miejscu (długość 0), nie rysuj cylindra (błąd Three.js)
    if (length < 0.001) return null;

    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    const geometry = new THREE.CylinderGeometry(thickness, thickness, length, 8);
    const material = new THREE.MeshBasicMaterial({ color });
    
    const orientation = new THREE.Matrix4();
    orientation.lookAt(start, end, new THREE.Object3D().up);
    orientation.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    geometry.applyMatrix4(orientation);
    
    return { geometry, material, position: midpoint };
  }

  // Geometria wypełnienia (Shape)
  function createProfileGeometry(points2D: Point2D[]) {
    if (points2D.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(points2D[0].x, points2D[0].y);
    for (let i = 1; i < points2D.length; i++) {
      shape.lineTo(points2D[i].x, points2D[i].y);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }

  // Sprawdzanie zamknięcia (stara logika, opcjonalna, bo mamy teraz profiles)
  function isPartOfClosedProfile(entity: SketchEntity): boolean {
    // Możesz tu zostawić swoją starą logikę lub użyć nowej.
    // Dla uproszczenia zostawiam prosty check typów.
    if (entity.type === 'circle' || entity.type === 'rectangle') return true;
    if (entity.type === 'polyline' && entity.closed) return true;
    return false;
  }
</script>

{#each profiles as profile}
  {@const geometry = createProfileGeometry(profile)}
  {#if geometry}
    <T.Mesh 
      geometry={geometry}
      position={[plane.origin.x, plane.origin.y, plane.origin.z]}
      quaternion={[plane.rotation.x, plane.rotation.y, plane.rotation.z, plane.rotation.w]}
    >
      <T.MeshBasicMaterial color={COLORS.fill} transparent opacity={0.5} side={THREE.DoubleSide} />
    </T.Mesh>
  {/if}
{/each}


{#each entities as entity (entity.id)}
  {@const isSelected = selectedEntityIds.includes(entity.id)}
  {@const isHovered = hoveredEntityId === entity.id}
  {@const isClosed = isPartOfClosedProfile(entity)}
  
  {@const color = isSelected ? COLORS.selected : (isHovered ? COLORS.hovered : (isClosed ? COLORS.closedProfile : (entity.construction ? COLORS.construction : COLORS.normal)))}
  {@const lineThickness = isSelected || isHovered ? 0.4 : 0.3}
  {@const pointSize = isSelected || isHovered ? 1.0 : 0.8}

  {#if entity.type === 'line'}
    {@const start = getNode3D(entity.startNodeId)}
    {@const end = getNode3D(entity.endNodeId)}

    {#if start && end}
      {@const lineData = createThickLine(start, end, color, lineThickness)}
      
      {#if lineData}
        <T.Mesh 
          position={lineData.position.toArray()} 
          geometry={lineData.geometry} 
          material={lineData.material} 
          userData={{ entityId: entity.id, type: 'line', isSketchEntity: true }}
        />
      {/if}
      
      <T.Mesh position={start.toArray()}><T.SphereGeometry args={[pointSize]} /><T.MeshBasicMaterial color={COLORS.point}/></T.Mesh>
      <T.Mesh position={end.toArray()}><T.SphereGeometry args={[pointSize]} /><T.MeshBasicMaterial color={COLORS.point}/></T.Mesh>
    {/if}

  {:else if entity.type === 'polyline'}
    {#each entity.nodeIds.slice(0, entity.nodeIds.length - (entity.closed ? 0 : 1)) as nodeId, i}
      {@const nextNodeId = entity.nodeIds[(i + 1) % entity.nodeIds.length]}
      {@const p1 = getNode3D(nodeId)}
      {@const p2 = getNode3D(nextNodeId)}
      
      {#if p1 && p2}
        {@const lineData = createThickLine(p1, p2, color, lineThickness)}
        {#if lineData}
          <T.Mesh 
            position={lineData.position.toArray()} 
            geometry={lineData.geometry} 
            material={lineData.material} 
            userData={{ entityId: entity.id, type: 'polyline', isSketchEntity: true }}
          />
        {/if}
      {/if}
    {/each}
    
    {#each entity.nodeIds as nodeId}
      {@const p = getNode3D(nodeId)}
      {#if p}
        <T.Mesh position={p.toArray()}><T.SphereGeometry args={[pointSize]} /><T.MeshBasicMaterial color={COLORS.point}/></T.Mesh>
      {/if}
    {/each}

  {:else if entity.type === 'rectangle'}
    {@const corner = getNode3D(entity.cornerNodeId)}
    
    {#if corner}
      {@const origin = corner}
      {@const xAxis = new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z).multiplyScalar(entity.width)}
      {@const yAxis = new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z).multiplyScalar(entity.height)}
      
      {@const p1 = origin.clone()}
      {@const p2 = origin.clone().add(xAxis)}
      {@const p3 = origin.clone().add(xAxis).add(yAxis)}
      {@const p4 = origin.clone().add(yAxis)}
      {@const points = [p1, p2, p3, p4, p1]}

      {#each points.slice(0, -1) as p, i}
        {@const nextP = points[i+1]}
        {@const lineData = createThickLine(p, nextP, color, lineThickness)}
        {#if lineData}
          <T.Mesh position={lineData.position.toArray()} geometry={lineData.geometry} material={lineData.material} userData={{ entityId: entity.id, type: 'rectangle', isSketchEntity: true }} />
        {/if}
        <T.Mesh position={p.toArray()}><T.SphereGeometry args={[pointSize]} /><T.MeshBasicMaterial color={COLORS.point}/></T.Mesh>
      {/each}
    {/if}

  {:else if entity.type === 'circle'}
    {@const center = getNode3D(entity.centerNodeId)}
    
    {#if center}
       {@const segments = 64}
       {@const circlePoints = []}
       {#each { length: segments + 1 } as _, i}
          {@const theta = (i / segments) * Math.PI * 2}
          {@const xDir = new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z).multiplyScalar(Math.cos(theta) * entity.radius)}
          {@const yDir = new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z).multiplyScalar(Math.sin(theta) * entity.radius)}
          {@const p = center.clone().add(xDir).add(yDir)}
          {@const __ = circlePoints.push(p)}
       {/each}

       {#each circlePoints.slice(0, -1) as p, i}
          {@const nextP = circlePoints[i+1]}
          {@const lineData = createThickLine(p, nextP, color, lineThickness)}
          {#if lineData}
             <T.Mesh position={lineData.position.toArray()} geometry={lineData.geometry} material={lineData.material} userData={{ entityId: entity.id, type: 'circle', isSketchEntity: true }} />
          {/if}
       {/each}
       
       <T.Mesh position={center.toArray()}><T.SphereGeometry args={[pointSize]} /><T.MeshBasicMaterial color={COLORS.point}/></T.Mesh>
    {/if}

  {:else if entity.type === 'point'}
    {@const p = getNode3D(entity.nodeId)}
    {#if p}
      <T.Mesh position={p.toArray()} userData={{ entityId: entity.id, type: 'point', isSketchEntity: true }}>
        <T.SphereGeometry args={[pointSize + 0.1]} />
        <T.MeshBasicMaterial {color} />
      </T.Mesh>
    {/if}
  {/if}
{/each}
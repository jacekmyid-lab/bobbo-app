<!--
  Viewport.svelte - FIXED: Usunięto nieskończoną pętlę w $effect
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Canvas, T } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import * as THREE from 'three';
  
  import { 
    viewportStore,
    sketchEditStore,
    solidStore,
    activeModelStore,
    pivotUpdateStore,
    documentStore
  } from '$lib/stores/cadStore';
  
  import SceneContent from './SceneContent.svelte';
  import ViewportOverlay from './ViewportOverlay.svelte';
  import SketchGrid from './SketchGrid.svelte';
  import SketchPreview from './SketchPreview.svelte';
  import SketchToolInstructions from './SketchToolInstructions.svelte';
  import { useViewportInteraction } from './viewportInteraction';
  import { useCameraAnimation } from './cameraAnimation';
  import { PolylineTool, LineTool, CircleTool, RectangleTool } from './sketchTools';
  import { createSketcher } from '$lib/sketcher/Sketcher';
  import { toolStore } from '$lib/stores/cadStore';

  // Reactive store values
  let viewportConfig = $derived($viewportStore);
  let isSketchMode = $derived($sketchEditStore.isEditing);
  let sketchPlaneId = $derived($sketchEditStore.planeId);
  let solids = $derived($solidStore);
  let activeModelId = $derived($activeModelStore);
  let pivotUpdate = $derived($pivotUpdateStore);
  let planes = $derived($documentStore.planes);

  // Scene references
  let canvasContainer: HTMLDivElement;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
  let controls: any = null;

  // Sketch tools
  let sketcher = $state<any>(null);
  let activeTool = $state<PolylineTool | LineTool | CircleTool | RectangleTool | null>(null);
  let currentToolType = $derived($toolStore.activeTool);

  // Camera animation
  const cameraAnim = useCameraAnimation(planes);
  let animating = $derived($cameraAnim.animatingStore);
  let sketchBasis = $derived($cameraAnim.sketchBasisStore);

  // Initialize sketcher when entering sketch mode
  $effect(() => {
    if (isSketchMode && sketchPlaneId && !sketcher) {
      const plane = planes.get(sketchPlaneId);
      if (plane) {
        sketcher = createSketcher($sketchEditStore.sketchId || 'temp', plane);
      }
    } else if (!isSketchMode) {
      sketcher = null;
      activeTool = null;
    }
  });

  // Initialize tool when tool type changes
  $effect(() => {
    if (!isSketchMode || !sketcher) {
      activeTool = null;
      return;
    }

    const plane = sketchPlaneId ? planes.get(sketchPlaneId) : null;
    if (!plane) return;

    if (activeTool) {
      activeTool.deactivate();
    }

    const canvas = canvasContainer?.querySelector('canvas') || null;
    
    switch (currentToolType) {
      case 'sketch-polyline':
        activeTool = new PolylineTool(canvas, camera, sketcher, plane);
        activeTool.activate();
        break;
      case 'sketch-line':
        activeTool = new LineTool(canvas, camera, sketcher, plane);
        activeTool.activate();
        break;
      case 'sketch-circle':
        activeTool = new CircleTool(canvas, camera, sketcher, plane);
        activeTool.activate();
        break;
      case 'sketch-rectangle':
        activeTool = new RectangleTool(canvas, camera, sketcher, plane);
        activeTool.activate();
        break;
      default:
        activeTool = null;
    }
  });

  // Viewport interaction
  const {
    handleMouseMove,
    handleClick,
    handleDoubleClick,
    handleContextMenu,
    handleKeyDown
  } = useViewportInteraction(
    () => canvasContainer,
    () => camera,
    () => scene,
    solids
  );

  // Handle sketch mode changes
  $effect(() => {
    if (isSketchMode && sketchPlaneId) {
      cameraAnim.enterSketchMode(sketchPlaneId, camera, controls);
    } else if (!isSketchMode && cameraAnim.savedCameraState) {
      cameraAnim.exitSketchMode(camera, controls);
    }
  });

  function onCameraCreate(cam: THREE.PerspectiveCamera | THREE.OrthographicCamera) {
    camera = cam;
    if (cam.parent) {
      scene = cam.parent as THREE.Scene;
      console.log('[Viewport] Scene initialized');
    }
  }

  function onControlsCreate(ctrl: any) {
    controls = ctrl;
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);

    const canvas = canvasContainer?.querySelector('canvas');
    
    const sketchMouseMove = (e: MouseEvent) => {
      if (activeTool) activeTool.handleMouseMove(e);
    };
    
    const sketchClick = (e: MouseEvent) => {
      if (activeTool) {
        e.stopPropagation();
        activeTool.handleClick(e);
      }
    };
    
    const sketchRightClick = (e: MouseEvent) => {
      if (activeTool) {
        e.preventDefault();
        e.stopPropagation();
        activeTool.handleRightClick(e);
      }
    };
    
    const sketchKeyDown = (e: KeyboardEvent) => {
      if (activeTool) activeTool.handleKeyDown(e);
    };

    if (canvas) {
      canvas.addEventListener('mousemove', sketchMouseMove);
      canvas.addEventListener('click', sketchClick, true);
      canvas.addEventListener('contextmenu', sketchRightClick);
    }
    window.addEventListener('keydown', sketchKeyDown);

    // Animation loop
    let animFrame: number;
    const animate = () => {
      if (camera && controls && animating) {
        const lerp = 0.12;
        const targetPos = cameraAnim.targetCameraPos;
        const targetLookAt = cameraAnim.targetCameraLookAt;
        
        camera.position.x += (targetPos.x - camera.position.x) * lerp;
        camera.position.y += (targetPos.y - camera.position.y) * lerp;
        camera.position.z += (targetPos.z - camera.position.z) * lerp;
        
        if (controls.target) {
          controls.target.x += (targetLookAt.x - controls.target.x) * lerp;
          controls.target.y += (targetLookAt.y - controls.target.y) * lerp;
          controls.target.z += (targetLookAt.z - controls.target.z) * lerp;
        }
        
        if (camera instanceof THREE.OrthographicCamera) {
          const dist = camera.position.distanceTo(
            new THREE.Vector3(targetLookAt.x, targetLookAt.y, targetLookAt.z)
          );
          const targetZoom = 100 / dist;
          camera.zoom += (targetZoom - camera.zoom) * lerp;
          camera.updateProjectionMatrix();
        }
        
        controls.update?.();
      }
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', sketchKeyDown);
      if (canvas) {
        canvas.removeEventListener('mousemove', sketchMouseMove);
        canvas.removeEventListener('click', sketchClick, true);
        canvas.removeEventListener('contextmenu', sketchRightClick);
      }
      cancelAnimationFrame(animFrame);
    };
  });

  let activeSolid = $derived(activeModelId ? solids.get(activeModelId) : null);
  let showWorldGrid = $derived(viewportConfig.showGrid && !isSketchMode);
  let cameraType: 'perspective' | 'orthographic' = $derived(
    isSketchMode ? 'orthographic' : 'perspective'
  );
  
  // FIX: Używamy onMount zamiast $effect żeby uniknąć nieskończonej pętli!
  let pivotPos = $state({ x: 0, y: 0, z: 0 });
  
  // Obserwuj zmiany pivotUpdate
  $effect(() => {
    // Odczytaj wartość żeby Svelte wiedział że to zależy od pivotUpdate
    const _ = pivotUpdate;
    
    // Zaktualizuj pozycję tylko jeśli activeSolid istnieje
    if (activeSolid) {
      pivotPos = {
        x: activeSolid.position.x + activeSolid.pivot.x,
        y: activeSolid.position.y + activeSolid.pivot.y,
        z: activeSolid.position.z + activeSolid.pivot.z
      };
    }
  });
</script>

<div 
  class="cad-viewport"
  class:sketch-mode={isSketchMode}
  class:has-active={activeModelId !== null}
  bind:this={canvasContainer}
  onmousemove={handleMouseMove}
  onclick={handleClick}
  ondblclick={handleDoubleClick}
  oncontextmenu={handleContextMenu}
  role="application"
  tabindex="0"
>
  <Canvas>
    <SceneContent />
    
    {#if cameraType === 'perspective'}
      <T.PerspectiveCamera
        makeDefault
        position={[50, 50, 50]}
        fov={45}
        near={0.1}
        far={10000}
        oncreate={(ref) => onCameraCreate(ref)}
      >
        <OrbitControls 
          enableDamping
          dampingFactor={0.1}
          rotateSpeed={0.5}
          panSpeed={0.5}
          zoomSpeed={1}
          oncreate={(ref) => onControlsCreate(ref)}
        />
      </T.PerspectiveCamera>
    {:else}
      <T.OrthographicCamera
        makeDefault
        position={[50, 50, 50]}
        zoom={10}
        left={-100}
        right={100}
        top={100}
        bottom={-100}
        near={0.1}
        far={10000}
        oncreate={(ref) => onCameraCreate(ref)}
      >
        <OrbitControls 
          enableDamping
          dampingFactor={0.1}
          rotateSpeed={0.5}
          panSpeed={0.5}
          zoomSpeed={1}
          oncreate={(ref) => onControlsCreate(ref)}
        />
      </T.OrthographicCamera>
    {/if}

    <T.AmbientLight intensity={0.5} />
    <T.DirectionalLight position={[50, 100, 50]} intensity={0.8} />
    <T.DirectionalLight position={[-50, 50, -50]} intensity={0.4} />
    <T.HemisphereLight args={[0xffffff, 0x444444, 0.3]} />

    {#if showWorldGrid}
      <T.GridHelper args={[200, 20, 0x2563eb, 0x1e3a5f]} />
    {/if}

    {#if isSketchMode && sketchBasis}
      <SketchGrid basis={sketchBasis} />
      
      {#if activeTool && sketchPlaneId}
        {@const plane = planes.get(sketchPlaneId)}
        {#if plane}
          <SketchPreview tool={activeTool} {plane} toolType={currentToolType} />
        {/if}
      {/if}
    {/if}

    {#if viewportConfig.showAxes && !isSketchMode}
      <T.AxesHelper args={[50]} />
    {/if}

    {#if viewportConfig.showOrigin && !isSketchMode}
      <T.Mesh position={[0, 0, 0]}>
        <T.SphereGeometry args={[0.3, 16, 16]} />
        <T.MeshBasicMaterial color="#ffffff" />
      </T.Mesh>
    {/if}

    {#if activeSolid && !isSketchMode}
      <T.Group position={[pivotPos.x, pivotPos.y, pivotPos.z]}>
        <T.Mesh>
          <T.SphereGeometry args={[0.6, 16, 16]} />
          <T.MeshBasicMaterial color="#ffff00" transparent opacity={0.9} />
        </T.Mesh>
        <T.AxesHelper args={[12]} />
        <T.Mesh rotation={[Math.PI / 2, 0, 0]}>
          <T.RingGeometry args={[0.8, 1.0, 32]} />
          <T.MeshBasicMaterial color="#ffff00" transparent opacity={0.5} side={2} />
        </T.Mesh>
      </T.Group>
    {/if}
  </Canvas>

  <ViewportOverlay 
    {isSketchMode}
    {activeModelId}
    {activeSolid}
    solidCount={solids.size}
  />
  
  {#if isSketchMode && activeTool}
    <SketchToolInstructions toolType={currentToolType} tool={activeTool} />
  {/if}
</div>

<style>
  .cad-viewport {
    position: relative;
    width: 100%;
    height: 100%;
    outline: none;
    background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  }

  .cad-viewport.sketch-mode {
    border: 2px solid #06b6d4;
  }

  .cad-viewport.has-active {
    border: 1px solid #3b82f6;
  }
</style>
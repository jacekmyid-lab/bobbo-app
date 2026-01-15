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
    documentStore,
    toolStore,
    selectionModeStore
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

  // Reactive store values
  let viewportConfig = $derived($viewportStore);
  let isSketchMode = $derived($sketchEditStore.isEditing);
  let sketchPlaneId = $derived($sketchEditStore.planeId);
  let solids = $derived($solidStore);
  let activeModelId = $derived($activeModelStore);
  let pivotUpdate = $derived($pivotUpdateStore);
  let planes = $derived($documentStore.planes);
  let selectionMode = $derived($selectionModeStore);

  // Scene references
  let canvasContainer: HTMLDivElement;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
  let controls: any = null;

  // Sketch tools - używamy $state ale BEZ reaktywności na currentToolType
  let sketcher = $state<any>(null);
  let currentToolType = $state<string>('');
  let activeTool = $state<PolylineTool | LineTool | CircleTool | RectangleTool | null>(null);

  // Camera animation
  const cameraAnim = useCameraAnimation(planes, () => solids);
  
  let animating = $state(false);
  let sketchBasis = $state<any>(null);

  // ✅ FIX 1: Initialize sketcher when entering sketch mode
  $effect(() => {
    if (isSketchMode && sketchPlaneId && !sketcher) {
      const plane = planes.get(sketchPlaneId);
      if (plane) {
        sketcher = createSketcher($sketchEditStore.sketchId || 'temp', plane);
        console.log('[Viewport] ✅ Sketcher created for plane:', plane.name);
      }
    } else if (!isSketchMode) {
      sketcher = null;
      activeTool = null;
      currentToolType = '';
    }
  });

  // ✅ FIX 2: Create tool TYLKO gdy zmieni się toolType i istnieje sketcher
  // Używamy manualnego śledzenia poprzedniej wartości
  $effect(() => {
    const newToolType = $toolStore.activeTool;
    
    // Tylko gdy jesteśmy w sketch mode i mamy sketcher
    if (!isSketchMode || !sketcher || !sketchPlaneId) {
      if (activeTool) {
        console.log('[Viewport] 🛑 Deactivating tool - exiting sketch mode');
        activeTool.deactivate();
        activeTool = null;
        currentToolType = '';
      }
      return;
    }

    // Tylko gdy tool TYPE się zmienił
    if (newToolType === currentToolType) {
      return; // Bez zmian - nie rób nic
    }

    // Deactivate old tool
    if (activeTool) {
      console.log('[Viewport] 🔄 Deactivating old tool:', currentToolType);
      activeTool.deactivate();
      activeTool = null;
    }

    // Create new tool tylko dla sketch tools
    if (newToolType.startsWith('sketch-')) {
      const plane = planes.get(sketchPlaneId);
      if (!plane) {
        console.warn('[Viewport] No plane found for sketch');
        return;
      }

      const canvas = canvasContainer?.querySelector('canvas') || null;
      
      console.log('[Viewport] 🔧 Creating tool:', newToolType);
      
      let tool: PolylineTool | LineTool | CircleTool | RectangleTool | null = null;
      
      switch (newToolType) {
        case 'sketch-polyline':
          tool = new PolylineTool(canvas, camera, sketcher, plane);
          break;
        case 'sketch-line':
          tool = new LineTool(canvas, camera, sketcher, plane);
          break;
        case 'sketch-circle':
          tool = new CircleTool(canvas, camera, sketcher, plane);
          break;
        case 'sketch-rectangle':
          tool = new RectangleTool(canvas, camera, sketcher, plane);
          break;
      }
      
      if (tool) {
        tool.activate();
        activeTool = tool;
        currentToolType = newToolType;
        console.log('[Viewport] ✅ Tool activated:', newToolType);
      }
    } else {
      currentToolType = '';
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
    () => solids
  );

  // ✅ FIX 3: Handle sketch mode changes - TYLKO dla kamery
  $effect(() => {
    if (isSketchMode && sketchPlaneId && camera && controls) {
      console.log('[Viewport] 📷 Entering sketch mode - animating camera...');
      cameraAnim.enterSketchMode(sketchPlaneId, camera, controls);
    } else if (!isSketchMode && cameraAnim.savedCameraState && camera && controls) {
      console.log('[Viewport] 📷 Exiting sketch mode - restoring camera...');
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
    console.log('[Viewport] Component mounted');
    
    // Subscribe to camera animation stores
    const unsubAnim = cameraAnim.animatingStore.subscribe(v => { animating = v; });
    const unsubBasis = cameraAnim.sketchBasisStore.subscribe(v => { 
      sketchBasis = v;
    });
    
    window.addEventListener('keydown', handleKeyDown);

    const canvas = canvasContainer?.querySelector('canvas');
    
    // ✅ FIX 4: Sketch event handlers - poprawione
    const sketchMouseMove = (e: MouseEvent) => {
      if (!activeTool || !isSketchMode) return;
      activeTool.handleMouseMove(e);
    };
    
    const sketchClick = (e: MouseEvent) => {
      if (!activeTool || !isSketchMode) return;
      console.log('[Viewport] 🖱️ Sketch click');
      e.stopPropagation();
      activeTool.handleClick(e);
    };
    
    const sketchRightClick = (e: MouseEvent) => {
      if (!activeTool || !isSketchMode) return;
      console.log('[Viewport] 🖱️ Sketch right-click');
      e.preventDefault();
      e.stopPropagation();
      activeTool.handleRightClick(e);
    };
    
    const sketchKeyDown = (e: KeyboardEvent) => {
      if (!activeTool || !isSketchMode) return;
      activeTool.handleKeyDown(e);
    };

    if (canvas) {
      canvas.addEventListener('mousemove', sketchMouseMove, false);
      canvas.addEventListener('click', sketchClick, true);
      canvas.addEventListener('contextmenu', sketchRightClick, true);
    }
    window.addEventListener('keydown', sketchKeyDown);

    // Animation loop
    let animFrame: number;
    const animate = () => {
      cameraAnim.updateAnimation(camera, controls);
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    
    return () => {
      unsubAnim();
      unsubBasis();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', sketchKeyDown);
      if (canvas) {
        canvas.removeEventListener('mousemove', sketchMouseMove, false);
        canvas.removeEventListener('click', sketchClick, true);
        canvas.removeEventListener('contextmenu', sketchRightClick, true);
      }
      cancelAnimationFrame(animFrame);
    };
  });

  let activeSolid = $derived(activeModelId ? solids.get(activeModelId) : null);
  let showWorldGrid = $derived(viewportConfig.showGrid && !isSketchMode);
  let cameraType: 'perspective' | 'orthographic' = $derived(
    isSketchMode ? 'orthographic' : 'perspective'
  );
  
  let pivotPos = $state({ x: 0, y: 0, z: 0 });
  
  $effect(() => {
    const _ = pivotUpdate;
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
          enableRotate={!isSketchMode}
          oncreate={(ref) => onControlsCreate(ref)}
        />
      </T.PerspectiveCamera>
    {:else}
      <T.OrthographicCamera
        makeDefault
        position={[0, 0, 100]}
        zoom={1}
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
          enableRotate={false}
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

    <!-- ✅ FIXED: Grid rendering in sketch mode -->
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
    cursor: default;
  }

  .cad-viewport :global(canvas) {
    pointer-events: auto !important;
    touch-action: none;
  }

  .cad-viewport.sketch-mode {
    border: 2px solid #06b6d4;
  }

  .cad-viewport.has-active {
    border: 1px solid #3b82f6;
  }
</style>
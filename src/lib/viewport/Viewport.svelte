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
    selectionModeStore,
    selectionStore // Dodano brakujący import
  } from '$lib/stores/cadStore';
  import SceneContent from './SceneContent.svelte';
  import ViewportOverlay from './ViewportOverlay.svelte';
  import SketchGrid from './SketchGrid.svelte';
  import SketchPreview from './SketchPreview.svelte';
  import SketchRenderer from './SketchRenderer.svelte'; // Komponent do renderowania gotowych linii
  import SketchToolInstructions from './SketchToolInstructions.svelte';
  import { useViewportInteraction } from './viewportInteraction';
  import { useCameraAnimation } from './cameraAnimation';
  import { PolylineTool, LineTool, CircleTool, RectangleTool, TrimTool, ExtendTool, OffsetTool } from './sketchTools';
  import { createSketcher } from '$lib/sketcher/Sketcher';
  import type { SketchEntity } from '$lib/core/types';

  // --- ZMIENNE STANU (Reactive Stores) ---
  let viewportConfig = $derived($viewportStore);
  let isSketchMode = $derived($sketchEditStore.isEditing);
  let sketchPlaneId = $derived($sketchEditStore.planeId);
  
  // Naprawione zmienne (brakowało ich wcześniej)
  let activeModelId = $derived($activeModelStore);
  let solids = $derived($solidStore);
  let activeSolid = $derived(activeModelId ? solids.get(activeModelId) : null);

  let pivotUpdate = $derived($pivotUpdateStore);
  let planes = $derived($documentStore.planes);
  let selectionMode = $derived($selectionModeStore);

  // --- REFERENCJE SCENY ---
  let canvasContainer: HTMLDivElement;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
  let controls: any = null;

  // --- NARZĘDZIA SZKICOWNIKA ---
  let sketcher = $state<any>(null);
  let currentToolType = $state<string>('');
 let activeTool = $state<PolylineTool | LineTool | CircleTool | RectangleTool | TrimTool | ExtendTool | OffsetTool | null>(null);
  // ... inne zmienne derived ...
let activeToolName = $derived($toolStore.activeTool);
let isPrecisionTool = $derived(['sketch-trim', 'sketch-extend', 'sketch-offset'].includes(activeToolName));
  // NOWE: Stan dla renderowania szkicu
  let sketchEntities = $state<SketchEntity[]>([]);
  let uiUpdateTrigger = $state(0); // Wymusza odświeżanie podglądu przy ruchu myszy

  // --- ANIMACJA KAMERY ---
  const cameraAnim = useCameraAnimation(planes, () => solids);
  let animating = $state(false);
  let sketchBasis = $state<any>(null);

  // --- EFEKTY (LOGIKA) ---

  // Inicjalizacja szkicownika przy wejściu w tryb Sketch
  $effect(() => {
    if (isSketchMode && sketchPlaneId && !sketcher) {
      const plane = planes.get(sketchPlaneId);
      if (plane) {
        sketcher = createSketcher($sketchEditStore.sketchId || 'temp', plane);
        // Załaduj istniejące encje jeśli są
        sketchEntities = sketcher.getEntities(); 
        console.log('[Viewport] ✅ Sketcher created for plane:', plane.name);
      }
    } else if (!isSketchMode) {
      // Sprzątanie po wyjściu
      sketcher = null;
      activeTool = null;
      currentToolType = '';
      sketchEntities = [];
    }
  });

  // Obsługa zmiany narzędzia (Active Tool)
  $effect(() => {
    const newToolType = $toolStore.activeTool;
    
    if (!isSketchMode || !sketcher || !sketchPlaneId) {
      if (activeTool) {
        console.log('[Viewport] 🛑 Deactivating tool - exiting sketch mode');
        activeTool.deactivate();
        activeTool = null;
        currentToolType = '';
      }
      return;
    }

    if (newToolType === currentToolType) return;

    if (activeTool) {
      activeTool.deactivate();
      activeTool = null;
    }

    if (newToolType.startsWith('sketch-')) {
      const plane = planes.get(sketchPlaneId);
      if (!plane) return;

      const canvas = canvasContainer?.querySelector('canvas') || null;
      console.log('[Viewport] 🔧 Creating tool:', newToolType);
      
      let tool: PolylineTool | LineTool | CircleTool | RectangleTool | null = null;
      
      switch (newToolType) {
        case 'sketch-polyline': tool = new PolylineTool(canvas, camera, sketcher, plane); break;
        case 'sketch-line': tool = new LineTool(canvas, camera, sketcher, plane); break;
        case 'sketch-circle': tool = new CircleTool(canvas, camera, sketcher, plane); break;
        case 'sketch-rectangle': tool = new RectangleTool(canvas, camera, sketcher, plane); break;
        case 'sketch-trim': tool = new TrimTool(canvas, camera, sketcher, plane); break;
        case 'sketch-extend': tool = new ExtendTool(canvas, camera, sketcher, plane); break;
        case 'sketch-offset': tool = new OffsetTool(canvas, camera, sketcher, plane); break;
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

  // Interakcja z viewportem (Standardowa)
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

  // Animacja kamery przy wejściu/wyjściu ze szkicownika
  $effect(() => {
    if (isSketchMode && sketchPlaneId && camera && controls) {
      cameraAnim.enterSketchMode(sketchPlaneId, camera, controls);
    } else if (!isSketchMode && cameraAnim.savedCameraState && camera && controls) {
      cameraAnim.exitSketchMode(camera, controls);
    }
  });

  // Callbacks Threlte
  function onCameraCreate(cam: THREE.PerspectiveCamera | THREE.OrthographicCamera) {
    camera = cam;
    if (cam.parent) scene = cam.parent as THREE.Scene;
  }

  function onControlsCreate(ctrl: any) {
    controls = ctrl;
  }

  // --- OBSŁUGA ZDARZEŃ (Unified Handlers) ---

  function handleCanvasClick(e: MouseEvent) {
    if (isSketchMode && activeTool) {
      activeTool.handleClick(e);
      // Aktualizacja UI po kliknięciu (np. dodanie punktu)
      uiUpdateTrigger++;
      if (sketcher) sketchEntities = [...sketcher.getEntities()];
    } else {
      handleClick(e);
    }
  }

  function handleCanvasContextMenu(e: MouseEvent) {
    if (isSketchMode && activeTool) {
      e.preventDefault();
      e.stopPropagation();
      activeTool.handleRightClick(e);
      uiUpdateTrigger++;
      if (sketcher) sketchEntities = [...sketcher.getEntities()];
    } else {
      handleContextMenu(e);
    }
  }

  function handleCanvasMouseMove(e: MouseEvent) {
    if (isSketchMode && activeTool) {
      activeTool.handleMouseMove(e);
      uiUpdateTrigger++; // Wymusza odświeżenie podglądu (SketchPreview)
    } else {
      handleMouseMove(e);
    }
  }

  function handleCanvasDoubleClick(e: MouseEvent) {
    if (!isSketchMode) handleDoubleClick(e);
  }

  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (isSketchMode && activeTool) {
      activeTool.handleKeyDown(e);
      uiUpdateTrigger++;
      if (sketcher) sketchEntities = [...sketcher.getEntities()];
    }
    handleKeyDown(e);
  }

  // --- CYKL ŻYCIA ---
  onMount(() => {
    const unsubAnim = cameraAnim.animatingStore.subscribe(v => { animating = v; });
    const unsubBasis = cameraAnim.sketchBasisStore.subscribe(v => { sketchBasis = v; });
    window.addEventListener('keydown', handleGlobalKeyDown);

    let animFrame: number;
    const animate = () => {
      cameraAnim.updateAnimation(camera, controls);
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    
    return () => {
      unsubAnim();
      unsubBasis();
      window.removeEventListener('keydown', handleGlobalKeyDown);
      cancelAnimationFrame(animFrame);
    };
  });

  // --- CALCULATED VALUES FOR RENDER ---
  let showWorldGrid = $derived(viewportConfig.showGrid && !isSketchMode);
  let cameraType: 'perspective' | 'orthographic' = $derived(isSketchMode ? 'orthographic' : 'perspective');
  
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
  class:cursor-picker={isPrecisionTool} 
  bind:this={canvasContainer} 
  onmousemove={handleCanvasMouseMove}
  onclick={handleCanvasClick}
  ondblclick={handleCanvasDoubleClick}
  oncontextmenu={handleCanvasContextMenu}
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
        oncreate={onCameraCreate}
      >
        <OrbitControls 
          enableDamping
          dampingFactor={0.1}
          rotateSpeed={0.5}
          panSpeed={0.5}
          zoomSpeed={1}
          enableRotate={!isSketchMode}
          oncreate={onControlsCreate}
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
        oncreate={onCameraCreate}
      >
        <OrbitControls 
          enableDamping
          dampingFactor={0.1}
          rotateSpeed={0.5}
          panSpeed={0.5}
          zoomSpeed={1}
          enableRotate={false}
          oncreate={onControlsCreate}
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
      
      {#if sketchPlaneId}
        {@const plane = planes.get(sketchPlaneId)}
        
        {#if plane}
          <SketchRenderer 
            {plane} 
            entities={sketchEntities} 
          />

          {#key uiUpdateTrigger}
            {#if activeTool}
              <SketchPreview tool={activeTool} {plane} toolType={currentToolType} />
            {/if}
          {/key}
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
    {#key uiUpdateTrigger}
      <SketchToolInstructions toolType={currentToolType} tool={activeTool} />
    {/key}
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

  /* Kursor typu "Picker" - kwadrat 16x16 z pustym środkiem */
.cursor-picker :global(canvas) {
  cursor: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="8" height="8" stroke="white" stroke-width="2" fill="none" style="filter: drop-shadow(1px 1px 1px black);"/></svg>') 12 12, crosshair !important;
}

</style>
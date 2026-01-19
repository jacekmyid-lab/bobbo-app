<script lang="ts">
  // --- 1. IMPORTY BIBLIOTEK ---
  import { onMount } from 'svelte';
  import { Canvas, T } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import * as THREE from 'three';

  // --- 2. IMPORTY STORES (STAN APLIKACJI) ---
  import { 
    viewportStore,
    sketchEditStore,
    solidStore,
    activeModelStore,
    pivotUpdateStore,
    documentStore,
    toolStore,
    selectionModeStore,
    selectionStore
  } from '$lib/stores/cadStore';

  // --- 3. KOMPONENTY WIDOKU I SCENY ---
  import SceneContent from './SceneContent.svelte';
  import ViewportOverlay from './ViewportOverlay.svelte';
  
  // --- 4. KOMPONENTY SZKICOWNIKA ---
  import SketchGrid from './SketchGrid.svelte';
  import SketchPreview from './SketchPreview.svelte';
  import SketchRenderer from './SketchRenderer.svelte';
  import SketchToolInstructions from './SketchToolInstructions.svelte';
  import ConstraintRenderer from './ConstraintRenderer.svelte';

  // --- 5. LOGIKA I NARZEDZIA ---
  import { useViewportInteraction } from './viewportInteraction';
  import { useCameraAnimation } from './cameraAnimation';
  import { 
    PolylineTool, 
    LineTool, 
    CircleTool, 
    RectangleTool, 
    TrimTool, 
    ExtendTool, 
    OffsetTool 
  } from './sketchTools';
  import { createSketcher } from '$lib/sketcher/Sketcher';
  
  // --- 6. TYPY ---
  // DODANO: SketchNode, Point2D
  import type { SketchEntity, Constraint, SketchNode, Point2D } from '$lib/core/types';


  // ==========================================================================
  // SEKCJA ZMIENNYCH STANU (REACTIVE STORES & STATE)
  // ==========================================================================

  // --- Konfiguracja globalna ---
  let viewportConfig = $derived($viewportStore);
  let isSketchMode = $derived($sketchEditStore.isEditing);
  let sketchPlaneId = $derived($sketchEditStore.planeId);
  
  // --- Modele i selekcja ---
  let activeModelId = $derived($activeModelStore);
  let solids = $derived($solidStore);
  let activeSolid = $derived(activeModelId ? solids.get(activeModelId) : null);
  let selectionMode = $derived($selectionModeStore);
  
  // --- Dane dokumentu ---
  let pivotUpdate = $derived($pivotUpdateStore);
  let planes = $derived($documentStore.planes);

  // --- Referencje do elementow DOM i Three.js ---
  let canvasContainer: HTMLDivElement;
  let scene: THREE.Scene | null = null; 
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
  let controls: any = null;

  // --- Stan Szkicownika ---
  let sketcher = $state<any>(null);
  let currentToolType = $state<string>('');
  let activeTool = $state<PolylineTool | LineTool | CircleTool | RectangleTool | TrimTool | ExtendTool | OffsetTool | null>(null);
  
  let activeToolName = $derived($toolStore.activeTool);
  // Sprawdzenie czy narzedzie wymaga precyzyjnego kursora
  let isPrecisionTool = $derived(['sketch-trim', 'sketch-extend', 'sketch-offset', 'vertical-constraint', 'horizontal-constraint' ].includes(activeToolName));

  // --- Dane do renderowania szkicu ---
  let sketchConstraints = $state<Constraint[]>([]);
  let sketchEntities = $state<SketchEntity[]>([]);
  // NOWE: Węzły i Profile
  let sketchNodes = $state<Map<string, SketchNode>>(new Map());
  let sketchProfiles = $state<Point2D[][]>([]);

  let uiUpdateTrigger = $state(0); // Wymusza odswiezanie UI

  // --- Animacja i Grid ---
  const cameraAnim = useCameraAnimation(planes, () => solids);
  let animating = $state(false);
  let sketchBasis = $state<any>(null);


  // ==========================================================================
  // SEKCJA FUNKCJI POMOCNICZYCH
  // ==========================================================================

  // Funkcja odswiezajaca stan encji i wiezow ze sketchera
  function refreshSketchState() {
    if (sketcher) {
      // Pobieramy wszystko: Encje, Więzy, Węzły i Profile
      sketchEntities = [...sketcher.getEntities()];
      sketchConstraints = [...sketcher.getAllConstraints()];
      
      // Kopiujemy mapę węzłów, aby wymusić reaktywność Svelte 5
      sketchNodes = new Map(sketcher.getNodes());
      
      // Pobieramy zamknięte obszary do wypełnienia
      sketchProfiles = sketcher.getClosedContours();
      
      uiUpdateTrigger += 1;
    }
  }

  // Obliczenia dla renderowania (Pivot, Grid, Camera Type)
  let showWorldGrid = $derived(viewportConfig.showGrid && !isSketchMode);
  let cameraType: 'perspective' | 'orthographic' = $derived(isSketchMode ? 'orthographic' : 'perspective');
  
  let pivotPos = $state({ x: 0, y: 0, z: 0 });
  
  // Aktualizacja pozycji pivota
  $effect(() => {
    const _ = pivotUpdate; // Subskrypcja zmian
    if (activeSolid) {
      pivotPos = {
        x: activeSolid.position.x + activeSolid.pivot.x,
        y: activeSolid.position.y + activeSolid.pivot.y,
        z: activeSolid.position.z + activeSolid.pivot.z
      };
    }
  });


  // ==========================================================================
  // SEKCJA HOOKOW I INTERAKCJI
  // ==========================================================================

  // Glowny hook interakcji (mysz, raycasting)
  const { handleMouseMove, handleClick, handleKeyDown, handleKeyUp } = useViewportInteraction(
    () => canvasContainer,
    () => camera,
    () => scene,
    () => solids,
    () => sketcher,      
    refreshSketchState   
  );

  // Callbacki Threlte (tworzenie obiektow)
  function onCameraCreate(cam: THREE.PerspectiveCamera | THREE.OrthographicCamera) {
    camera = cam;
    if (cam.parent) scene = cam.parent as THREE.Scene;
  }

  function onControlsCreate(ctrl: any) {
    controls = ctrl;
  }


  // ==========================================================================
  // SEKCJA EFEKTOW (LIFECYCLE & LOGIC)
  // ==========================================================================

  // Efekt 1: Inicjalizacja szkicownika
  $effect(() => {
    if (isSketchMode && sketchPlaneId && !sketcher) {
      const plane = planes.get(sketchPlaneId);
      if (plane) {
        sketcher = createSketcher($sketchEditStore.sketchId || 'temp', plane);
        // Zaladuj dane i odswiez WSZYSTKIE stany (wezly, encje, profile)
        if ($sketchEditStore.sketchId) {
             // Tu mozna by dodac ladowanie z zapisanego modelu, 
             // ale createSketcher tworzy nowy pusty lub laduje jesli zaimplementujemy load
        }
        refreshSketchState(); 
        
        console.log('[Viewport] ✅ Sketcher created for plane:', plane.name);
      }
    } else if (!isSketchMode) {
      // Sprzatanie
      sketcher = null;
      activeTool = null;
      currentToolType = '';
      sketchEntities = [];
      sketchNodes = new Map();
      sketchProfiles = [];
    }
  });

  // Efekt 2: Zarzadzanie narzedziami (Active Tool)
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

    // Dezaktywacja starego narzedzia
    if (activeTool) {
      activeTool.deactivate();
      activeTool = null;
    }

    // Aktywacja nowego narzedzia
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

  // Efekt 3: Animacja kamery
  $effect(() => {
    if (isSketchMode && sketchPlaneId && camera && controls) {
      cameraAnim.enterSketchMode(sketchPlaneId, camera, controls);
    } else if (!isSketchMode && cameraAnim.savedCameraState && camera && controls) {
      cameraAnim.exitSketchMode(camera, controls);
    }
  });


  // ==========================================================================
  // SEKCJA HANDLEROW ZDARZEN (EVENT HANDLERS)
  // ==========================================================================

  function handleCanvasClick(e: MouseEvent) {
    if (isSketchMode && activeTool) {
      activeTool.handleClick(e);
      // Uzywamy refreshSketchState zamiast recznego pobierania entities
      // To zapewnia, ze wezly i profile tez sie aktualizuja
      refreshSketchState();
    } else {
      handleClick(e);
    }
  }

  function handleCanvasContextMenu(e: MouseEvent) {
    if (isSketchMode && activeTool) {
      e.preventDefault();
      e.stopPropagation();
      activeTool.handleRightClick(e);
      refreshSketchState();
    } else {
      handleContextMenu(e);
    }
  }

  function handleCanvasMouseMove(e: MouseEvent) {
    if (isSketchMode && activeTool) {
      activeTool.handleMouseMove(e);
      // Opcjonalnie: mozna ograniczyc czestotliwosc odswiezania tutaj jesli bedzie mulic
      uiUpdateTrigger++; 
    } else {
      handleMouseMove(e);
    }
  }

  function handleCanvasDoubleClick(e: MouseEvent) {
    if (!isSketchMode) handleClick(e); 
  }

  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (isSketchMode && activeTool) {
      activeTool.handleKeyDown(e);
      refreshSketchState();
    }
    handleKeyDown(e);
  }


  // ==========================================================================
  // SEKCJA ONMOUNT (LISTENERY OKNA)
  // ==========================================================================

  onMount(() => {
    // Subskrypcje store'ow animacji
    const unsubAnim = cameraAnim.animatingStore.subscribe(v => { animating = v; });
    const unsubBasis = cameraAnim.sketchBasisStore.subscribe(v => { sketchBasis = v; });
    
    // Globalne listenery klawiatury
    window.addEventListener('keydown', handleGlobalKeyDown);

    // Petla animacji
    let animFrame: number;
    const animate = () => {
      cameraAnim.updateAnimation(camera, controls);
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    
    // Listenery Custom Events dla Constraintow
    const handleVerticalConstraint = (e: CustomEvent) => {
      if (sketcher && e.detail.entityId) {
        const result = sketcher.addVerticalConstraint(e.detail.entityId);
        if (result.success) {
          console.log('[Viewport] ✓ Applied vertical constraint');
          refreshSketchState();
        } else {
          console.error('[Viewport] ✗ Failed:', result.error);
        }
      }
    };

    const handleHorizontalConstraint = (e: CustomEvent) => {
      if (sketcher && e.detail.entityId) {
        const result = sketcher.addHorizontalConstraint(e.detail.entityId);
        if (result.success) {
          console.log('[Viewport] ✓ Applied horizontal constraint');
          refreshSketchState();
        } else {
          console.error('[Viewport] ✗ Failed:', result.error);
        }
      }
    };

    window.addEventListener('apply-vertical-constraint', handleVerticalConstraint as EventListener);
    window.addEventListener('apply-horizontal-constraint', handleHorizontalConstraint as EventListener);

    // Czyszczenie przy odmontowaniu
    return () => {
      unsubAnim();
      unsubBasis();
      window.removeEventListener('keydown', handleGlobalKeyDown);
      cancelAnimationFrame(animFrame);
      window.removeEventListener('apply-vertical-constraint', handleVerticalConstraint as EventListener);
      window.removeEventListener('apply-horizontal-constraint', handleHorizontalConstraint as EventListener);
    };
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
            nodes={sketchNodes}
            profiles={sketchProfiles}
          />

          <ConstraintRenderer 
            {plane} 
            constraints={sketchConstraints}
            entities={sketchEntities}
            nodes={sketchNodes}
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

  .cursor-picker :global(canvas) {
    cursor: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="8" height="8" stroke="white" stroke-width="2" fill="none" style="filter: drop-shadow(1px 1px 1px black);"/></svg>') 12 12, crosshair !important;
  }
</style>
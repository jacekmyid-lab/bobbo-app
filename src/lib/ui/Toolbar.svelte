<script lang="ts">
  // --- IMPORTY ---
  import { 
    toolStore, 
    selectionModeStore, 
    documentStore,
    viewportStore,
    sketchEditStore,
    planesStore
  } from '$lib/stores/cadStore';
  
  import { 
    createBox, 
    createSphere, 
    createCylinder, 
    createCone, 
    createTorus,
    performBoolean,
    createSketch
  } from '$lib/tools/CADOperations';
  
  import type { ToolType, SelectionMode } from '$lib/core/types';

  // --- ZMIENNE STANU (Derived) ---
  let activeTool = $derived($toolStore.activeTool);
  let selectionMode = $derived($selectionModeStore);
  let isSketchMode = $derived($sketchEditStore.isEditing);
  let activePlaneId = $derived($documentStore.activePlaneId);
  let planes = $derived($documentStore.planes);
  
  let showPlaneSelector = $state(false);

  // Wyświetlanie nazwy aktywnej płaszczyzny
  let activePlaneName = $derived.by(() => {
    if (!activePlaneId) return 'No Plane';
    const plane = planes.get(activePlaneId);
    return plane?.name || 'Unknown';
  });

  // --- FUNKCJE ---

  function setTool(tool: ToolType): void {
    toolStore.setTool(tool);
  }

  function setSelectionMode(mode: SelectionMode): void {
    selectionModeStore.set(mode);
  }

  function toggleViewportSetting(setting: 'showGrid' | 'showAxes' | 'showOrigin'): void {
    viewportStore.toggle(setting);
  }

  function selectPlane(planeId: string): void {
    documentStore.setActivePlane(planeId);
    showPlaneSelector = false;
  }

  function togglePlaneSelector(): void {
    showPlaneSelector = !showPlaneSelector;
  }

  // --- LOGIKA SZKICOWNIKA ---

  function enterSketchMode(): void {
    if (!activePlaneId) {
      alert('Please select a plane first');
      return;
    }
    const result = createSketch(activePlaneId);
    if (result.success) {
      sketchEditStore.enter(result.value.id, activePlaneId);
    }
  }

  function exitSketchMode(): void {
    sketchEditStore.exit();
  }

  // Tworzenie brył (Primitives)
  async function createPrimitive(type: string): Promise<void> {
    try {
      switch (type) {
        case 'box': await createBox({ width: 20, height: 20, depth: 20, center: true }); break;
        case 'sphere': await createSphere({ radius: 10, circularSegments: 32 }); break;
        case 'cylinder': await createCylinder({ radius: 10, height: 20, circularSegments: 32, center: true }); break;
        case 'cone': await createCone({ bottomRadius: 10, topRadius: 0, height: 20, circularSegments: 32, center: true }); break;
        case 'torus': await createTorus({ majorRadius: 15, minorRadius: 5, majorSegments: 32, minorSegments: 16 }); break;
      }
    } catch (error) {
      console.error(error);
    }
  }
</script>

<header class="cad-toolbar">
  <div class="toolbar-logo">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M7 12L10 9L13 12L16 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="12" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
    </svg>
    <span>Manifold CAD</span>
  </div>

  <div class="toolbar-separator"></div>

  <div class="cad-btn-group">
    <button class="cad-btn-icon" class:active={selectionMode === 'model'} onclick={() => setSelectionMode('model')} title="Select Models (M)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>
    <button class="cad-btn-icon" class:active={selectionMode === 'face'} onclick={() => setSelectionMode('face')} title="Select Faces (F)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4L8 2L14 4V12L8 14L2 12V4Z" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>
    <button class="cad-btn-icon" class:active={selectionMode === 'edge'} onclick={() => setSelectionMode('edge')} title="Select Edges (E)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="2"/>
        <circle cx="3" cy="13" r="1.5" fill="currentColor"/><circle cx="13" cy="3" r="1.5" fill="currentColor"/>
      </svg>
    </button>
    <button class="cad-btn-icon" class:active={selectionMode === 'vertex'} onclick={() => setSelectionMode('vertex')} title="Select Vertices (V)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" fill="currentColor"/></svg>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <div class="cad-btn-group">
    <button class="cad-btn-icon" onclick={() => createPrimitive('box')} title="Box"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="3" width="10" height="10" stroke="currentColor"/></svg></button>
    <button class="cad-btn-icon" onclick={() => createPrimitive('sphere')} title="Sphere"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor"/></svg></button>
    <button class="cad-btn-icon" onclick={() => createPrimitive('cylinder')} title="Cylinder"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><ellipse cx="8" cy="4" rx="5" ry="2" stroke="currentColor"/><path d="M3 4V12C3 13.1 8 14 8 14S13 13.1 13 12V4" stroke="currentColor"/></svg></button>
  </div>

  <div class="toolbar-separator"></div>

  {#if isSketchMode}
    <div class="cad-btn-group sketch-tools">
      <button class="cad-btn-icon" class:active={activeTool === 'sketch-line'} onclick={() => setTool('sketch-line')} title="Line (L)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="1.5"/></svg>
      </button>
      <button class="cad-btn-icon" class:active={activeTool === 'sketch-polyline'} onclick={() => setTool('sketch-polyline')} title="Polyline (P)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12L5 8L8 10L11 5L14 7" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
      </button>
      <button class="cad-btn-icon" class:active={activeTool === 'sketch-circle'} onclick={() => setTool('sketch-circle')} title="Circle (C)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5"/></svg>
      </button>
      <button class="cad-btn-icon" class:active={activeTool === 'sketch-rectangle'} onclick={() => setTool('sketch-rectangle')} title="Rectangle (R)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="4" width="10" height="8" stroke="currentColor" stroke-width="1.5"/></svg>
      </button>

      <div class="toolbar-separator" style="height: 16px; margin: 0 4px;"></div>

      <button class="cad-btn-icon" class:active={activeTool === 'sketch-trim'} onclick={() => setTool('sketch-trim')} title="Trim">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M10 2L2 10" stroke="currentColor"/><path d="M14 8L8 14" stroke="currentColor" stroke-dasharray="2 2"/></svg>
      </button>
      <button class="cad-btn-icon" class:active={activeTool === 'sketch-extend'} onclick={() => setTool('sketch-extend')} title="Extend">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8H8" stroke="currentColor"/><path d="M8 8H14" stroke="currentColor" stroke-dasharray="2 2"/><line x1="14" y1="4" x2="14" y2="12" stroke="currentColor"/></svg>
      </button>
      <button class="cad-btn-icon" class:active={activeTool === 'sketch-offset'} onclick={() => setTool('sketch-offset')} title="Offset">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3H10V10" stroke="currentColor"/><path d="M6 6H13V13" stroke="currentColor" opacity="0.6"/></svg>
      </button>

      <div class="toolbar-separator" style="height: 16px; margin: 0 4px;"></div>

      <button 
        class="cad-btn-icon constraint-btn" 
        class:active={activeTool === 'vertical-constraint'}
        onclick={() => setTool('vertical-constraint')} 
        title="Make Vertical (V)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" stroke-width="2"/>
          <path d="M6 4L8 2L10 4" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <path d="M6 12L8 14L10 12" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
      
      <button 
        class="cad-btn-icon constraint-btn" 
        class:active={activeTool === 'horizontal-constraint'}
        onclick={() => setTool('horizontal-constraint')} 
        title="Make Horizontal (H)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="2"/>
          <path d="M4 6L2 8L4 10" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <path d="M12 6L14 8L12 10" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
    </div>
    
    <button class="cad-btn exit-sketch" onclick={exitSketchMode}>Exit Sketch</button>

  {:else}
    <div style="position: relative;">
      <button class="cad-btn plane-selector-btn" onclick={togglePlaneSelector}>
        {activePlaneName}
      </button>
      {#if showPlaneSelector}
        <div class="plane-dropdown">
          {#each Array.from(planes.values()) as plane (plane.id)}
            <button class="plane-dropdown-item" class:active={activePlaneId === plane.id} onclick={() => selectPlane(plane.id)}>
              {plane.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <button class="cad-btn" onclick={enterSketchMode}>New Sketch</button>
  {/if}

  <div class="toolbar-spacer"></div>

  <div class="cad-btn-group">
    <button class="cad-btn-icon" class:active={$viewportStore.showGrid} onclick={() => toggleViewportSetting('showGrid')} title="Grid">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2H14V14H2V2Z" stroke="currentColor"/></svg>
    </button>
  </div>
</header>

<style>
  /* Style identyczne jak w twoim poprzednim pliku, zachowaj je */
  .toolbar-logo { display: flex; align-items: center; gap: 8px; color: var(--cad-primary-light); font-weight: 600; font-size: 14px; padding-right: 12px; }
  .toolbar-separator { width: 1px; height: 24px; background-color: var(--cad-border); margin: 0 8px; }
  .toolbar-spacer { flex: 1; }
  .sketch-tools { background-color: rgba(6, 182, 212, 0.1); border: 1px solid var(--cad-sketch-line); }
  .exit-sketch { background-color: var(--cad-sketch-line) !important; color: white !important; margin-left: 8px; }
  .exit-sketch:hover { background-color: #0891b2 !important; }
  .plane-selector-btn { display: flex; align-items: center; gap: 4px; background-color: var(--cad-bg-panel-light); border: 1px solid var(--cad-border); margin-right: 8px; }
  .plane-dropdown { position: absolute; top: 100%; left: 0; margin-top: 4px; min-width: 200px; background-color: var(--cad-bg-panel); border: 1px solid var(--cad-border); border-radius: 6px; padding: 4px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); z-index: 1000; }
  .plane-dropdown-item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: none; border: none; border-radius: 4px; color: var(--cad-text-primary); font-size: 12px; text-align: left; cursor: pointer; transition: background-color 0.15s ease; }
  .plane-dropdown-item:hover { background-color: var(--cad-bg-panel-light); }
  .plane-dropdown-item.active { background-color: var(--cad-primary); color: white; }
  .constraint-btn { background-color: rgba(168, 85, 247, 0.1); }
  .constraint-btn:hover { background-color: rgba(168, 85, 247, 0.2); }
</style>
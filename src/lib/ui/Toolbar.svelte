<script lang="ts">
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

  // Current states
  let activeTool = $derived($toolStore.activeTool);
  let selectionMode = $derived($selectionModeStore);
  let isSketchMode = $derived($sketchEditStore.isEditing);
  let activePlaneId = $derived($documentStore.activePlaneId);
  let planes = $derived($documentStore.planes);
  
  // Plane selector state
  let showPlaneSelector = $state(false);

  function setTool(tool: ToolType): void {
    toolStore.setTool(tool);
  }

  function setSelectionMode(mode: SelectionMode): void {
    selectionModeStore.set(mode);
  }

  async function createPrimitive(type: string): Promise<void> {
    console.log('[Toolbar] Creating primitive:', type);
    try {
      switch (type) {
        case 'box':
          await createBox({ width: 20, height: 20, depth: 20, center: true });
          break;
        case 'sphere':
          await createSphere({ radius: 10, circularSegments: 32 });
          break;
        case 'cylinder':
          await createCylinder({ radius: 10, height: 20, circularSegments: 32, center: true });
          break;
        case 'cone':
          await createCone({ bottomRadius: 10, topRadius: 0, height: 20, circularSegments: 32, center: true });
          break;
        case 'torus':
          await createTorus({ majorRadius: 15, minorRadius: 5, majorSegments: 32, minorSegments: 16 });
          break;
      }
    } catch (error) {
      console.error('[Toolbar] Error creating primitive:', error);
    }
  }

  function toggleViewportSetting(setting: 'showGrid' | 'showAxes' | 'showOrigin'): void {
    viewportStore.toggle(setting);
  }

  function selectPlane(planeId: string): void {
    documentStore.setActivePlane(planeId);
    showPlaneSelector = false;
    console.log('[Toolbar] Selected plane:', planeId);
  }

  function enterSketchMode(): void {
    if (!activePlaneId) {
      console.warn('[Toolbar] No active plane selected');
      alert('Please select a plane first');
      return;
    }
    
    const result = createSketch(activePlaneId);
    if (result.success) {
      sketchEditStore.enter(result.value.id, activePlaneId);
      console.log('[Toolbar] Entered sketch mode on plane:', activePlaneId);
    } else {
      console.error('[Toolbar] Failed to create sketch:', result.error);
    }
  }

  function exitSketchMode(): void {
    sketchEditStore.exit();
  }

  function togglePlaneSelector(): void {
    showPlaneSelector = !showPlaneSelector;
  }

  // Get active plane name
  let activePlaneName = $derived.by(() => {
    if (!activePlaneId) return 'No Plane';
    const plane = planes.get(activePlaneId);
    return plane?.name || 'Unknown';
  });
</script>

<header class="cad-toolbar">
  <!-- Logo -->
  <div class="toolbar-logo">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M7 12L10 9L13 12L16 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="12" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
    </svg>
    <span>Manifold CAD</span>
  </div>

  <div class="toolbar-separator"></div>

  <!-- Selection Mode -->
  <div class="cad-btn-group" title="Selection Mode">
    <button
      class="cad-btn-icon"
      class:active={selectionMode === 'model'}
      onclick={() => setSelectionMode('model')}
      title="Select Models (M)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={selectionMode === 'face'}
      onclick={() => setSelectionMode('face')}
      title="Select Faces (F)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 4L8 2L14 4V12L8 14L2 12V4Z" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={selectionMode === 'edge'}
      onclick={() => setSelectionMode('edge')}
      title="Select Edges (E)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="2"/>
        <circle cx="3" cy="13" r="1.5" fill="currentColor"/>
        <circle cx="13" cy="3" r="1.5" fill="currentColor"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={selectionMode === 'vertex'}
      onclick={() => setSelectionMode('vertex')}
      title="Select Vertices (V)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3" fill="currentColor"/>
      </svg>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <!-- Primitives -->
  <div class="cad-btn-group" title="Create Primitives">
    <button class="cad-btn-icon" onclick={() => createPrimitive('box')} title="Create Box (B)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 5L8 2L14 5V11L8 14L2 11V5Z" stroke="currentColor" stroke-width="1.5"/>
        <path d="M2 5L8 8M8 8L14 5M8 8V14" stroke="currentColor" stroke-width="1" opacity="0.5"/>
      </svg>
    </button>
    <button class="cad-btn-icon" onclick={() => createPrimitive('sphere')} title="Create Sphere">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button class="cad-btn-icon" onclick={() => createPrimitive('cylinder')} title="Create Cylinder">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="4" rx="5" ry="2" stroke="currentColor" stroke-width="1.5"/>
        <path d="M3 4V12C3 13.1 5.24 14 8 14C10.76 14 13 13.1 13 12V4" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button class="cad-btn-icon" onclick={() => createPrimitive('cone')} title="Create Cone">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L3 12C3 13.1 5.24 14 8 14C10.76 14 13 13.1 13 12L8 2Z" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button class="cad-btn-icon" onclick={() => createPrimitive('torus')} title="Create Torus">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="8" rx="6" ry="3" stroke="currentColor" stroke-width="1.5"/>
        <ellipse cx="8" cy="8" rx="2" ry="1" stroke="currentColor" stroke-width="1"/>
      </svg>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <!-- Boolean Operations -->
  <div class="cad-btn-group" title="Boolean Operations">
    <button class="cad-btn-icon" class:active={activeTool === 'union'} onclick={() => setTool('union')} title="Union (U)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="10" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button class="cad-btn-icon" class:active={activeTool === 'difference'} onclick={() => setTool('difference')} title="Difference (D)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="10" cy="8" r="4" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>
      </svg>
    </button>
    <button class="cad-btn-icon" class:active={activeTool === 'intersection'} onclick={() => setTool('intersection')} title="Intersection (I)">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="8" r="4" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
        <circle cx="10" cy="8" r="4" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
        <path d="M8 5.5C9 6.5 9 9.5 8 10.5C7 9.5 7 6.5 8 5.5Z" fill="currentColor"/>
      </svg>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <!-- Sketch Tools -->
  {#if isSketchMode}
    <div class="cad-btn-group sketch-tools">
      <button class="cad-btn-icon" class:active={activeTool === 'sketch-line'} onclick={() => setTool('sketch-line')} title="Line (L)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
      <button class="cad-btn-icon" class:active={activeTool === 'sketch-polyline'} onclick={() => setTool('sketch-polyline')} title="Polyline (P)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 12L5 8L8 10L11 5L14 7" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <circle cx="2" cy="12" r="1" fill="currentColor"/>
          <circle cx="5" cy="8" r="1" fill="currentColor"/>
          <circle cx="8" cy="10" r="1" fill="currentColor"/>
          <circle cx="11" cy="5" r="1" fill="currentColor"/>
          <circle cx="14" cy="7" r="1" fill="currentColor"/>
        </svg>
      </button>
      <button class="cad-btn-icon" class:active={activeTool === 'sketch-rectangle'} onclick={() => setTool('sketch-rectangle')} title="Rectangle (R)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="4" width="10" height="8" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
      <button class="cad-btn-icon" class:active={activeTool === 'sketch-circle'} onclick={() => setTool('sketch-circle')} title="Circle (C)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
    </div>
    <button class="cad-btn exit-sketch" onclick={exitSketchMode}>Exit Sketch</button>
  {:else}
    <!-- Plane Selector + New Sketch -->
    <div style="position: relative;">
      <button class="cad-btn plane-selector-btn" onclick={togglePlaneSelector} title="Select Plane">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right: 4px;">
          <rect x="2" y="2" width="12" height="12" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
        {activePlaneName}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="margin-left: 4px;">
          <path d="M2 4L5 7L8 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      
      {#if showPlaneSelector}
        <div class="plane-dropdown">
          {#each Array.from(planes.values()) as plane (plane.id)}
            <button 
              class="plane-dropdown-item"
              class:active={activePlaneId === plane.id}
              onclick={() => selectPlane(plane.id)}
            >
              <span class="plane-icon">
                {#if plane.source.type === 'reference'}
                  {plane.source.axis}
                {:else}
                  ◇
                {/if}
              </span>
              {plane.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    
    <button class="cad-btn" onclick={enterSketchMode} title="Create Sketch">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right: 4px;">
        <rect x="2" y="2" width="12" height="12" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M5 8H11M8 5V11" stroke="currentColor" stroke-width="1.5"/>
      </svg>
      New Sketch
    </button>
  {/if}

  <!-- Spacer -->
  <div class="toolbar-spacer"></div>

  <!-- View Controls -->
  <div class="cad-btn-group">
    <button class="cad-btn-icon" class:active={$viewportStore.showGrid} onclick={() => toggleViewportSetting('showGrid')} title="Toggle Grid">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 2H14V14H2V2Z" stroke="currentColor" stroke-width="1"/>
        <path d="M2 6H14M2 10H14M6 2V14M10 2V14" stroke="currentColor" stroke-width="0.5" opacity="0.5"/>
      </svg>
    </button>
    <button class="cad-btn-icon" class:active={$viewportStore.showAxes} onclick={() => toggleViewportSetting('showAxes')} title="Toggle Axes">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="8" y1="14" x2="8" y2="4" stroke="#22c55e" stroke-width="1.5"/>
        <line x1="8" y1="8" x2="14" y2="8" stroke="#ef4444" stroke-width="1.5"/>
        <line x1="8" y1="8" x2="4" y2="12" stroke="#3b82f6" stroke-width="1.5"/>
      </svg>
    </button>
  </div>
</header>

<style>
  .toolbar-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--cad-primary-light);
    font-weight: 600;
    font-size: 14px;
    padding-right: 12px;
  }

  .toolbar-separator {
    width: 1px;
    height: 24px;
    background-color: var(--cad-border);
    margin: 0 8px;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .sketch-tools {
    background-color: rgba(6, 182, 212, 0.1);
    border: 1px solid var(--cad-sketch-line);
  }

  .exit-sketch {
    background-color: var(--cad-sketch-line) !important;
    border-color: var(--cad-sketch-line) !important;
    color: white !important;
    margin-left: 8px;
  }

  .exit-sketch:hover {
    background-color: #0891b2 !important;
  }

  /* Plane Selector */
  .plane-selector-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: var(--cad-bg-panel-light);
    border: 1px solid var(--cad-border);
    margin-right: 8px;
  }

  .plane-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    min-width: 200px;
    background-color: var(--cad-bg-panel);
    border: 1px solid var(--cad-border);
    border-radius: 6px;
    padding: 4px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    z-index: 1000;
  }

  .plane-dropdown-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--cad-text-primary);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .plane-dropdown-item:hover {
    background-color: var(--cad-bg-panel-light);
  }

  .plane-dropdown-item.active {
    background-color: var(--cad-primary);
    color: white;
  }

  .plane-icon {
    width: 20px;
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    color: var(--cad-accent);
  }

  .plane-dropdown-item.active .plane-icon {
    color: white;
  }
</style>
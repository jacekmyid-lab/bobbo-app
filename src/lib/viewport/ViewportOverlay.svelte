<!--
  ViewportOverlay.svelte
  UI overlay showing mode, selection, and shortcuts
-->
<script lang="ts">
  import { selectionModeStore, hoverStore } from '$lib/stores/cadStore';
  import type { Solid } from '$lib/geometry/Solid';

  // Props using $props()
  let { isSketchMode, activeModelId, activeSolid, solidCount } = $props<{
    isSketchMode: boolean;
    activeModelId: string | null;
    activeSolid: Solid | null;
    solidCount: number;
  }>();

  // Store values
  let selectionMode = $derived($selectionModeStore);
  let hover = $derived($hoverStore);
</script>

<div class="viewport-overlay">
  <div class="status-row">
    <span class="mode-badge" class:active={selectionMode === 'model'}>
      {selectionMode.toUpperCase()}
    </span>
    <span class="count-badge">
      {solidCount} solid{solidCount !== 1 ? 's' : ''}
    </span>
    {#if isSketchMode}
      <span class="camera-badge ortho">ORTHO</span>
    {/if}
  </div>
  
  {#if activeModelId && activeSolid}
    <div class="active-badge">
      Active: {activeSolid.name || activeModelId.slice(0, 8)}
      <span class="topo-counts">
        ({activeSolid.faces.length}F / {activeSolid.edges.length}E / {activeSolid.vertices.length}V)
      </span>
    </div>
  {:else if selectionMode !== 'model'}
    <div class="hint-badge">Click a model first (M)</div>
  {/if}

  {#if hover}
    <div 
      class="hover-badge" 
      class:face={hover.type === 'face'} 
      class:edge={hover.type === 'edge'} 
      class:vertex={hover.type === 'vertex'}
    >
      {hover.type}: {hover.elementName || hover.modelId?.slice(0, 8)}
    </div>
  {/if}

  {#if isSketchMode}
    <div class="sketch-badge">✏️ SKETCH MODE</div>
  {/if}
</div>

<!-- Shortcuts -->
<div class="shortcuts">
  <span><kbd>M</kbd> Model</span>
  <span><kbd>F</kbd> Face</span>
  <span><kbd>E</kbd> Edge</span>
  <span><kbd>V</kbd> Vertex</span>
  <span><kbd>P</kbd> Pivot</span>
  <span><kbd>ESC</kbd> Clear</span>
</div>

<style>
  .viewport-overlay {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
  }

  .status-row {
    display: flex;
    gap: 8px;
  }

  .mode-badge {
    padding: 4px 10px;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid #334155;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
  }

  .mode-badge.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  .camera-badge {
    padding: 4px 10px;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid #334155;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
  }

  .camera-badge.ortho {
    background: #06b6d4;
    border-color: #06b6d4;
    color: white;
  }

  .count-badge {
    padding: 4px 10px;
    background: rgba(15, 23, 42, 0.95);
    border-radius: 4px;
    font-size: 11px;
    color: #64748b;
  }

  .active-badge {
    padding: 6px 12px;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid #3b82f6;
    border-radius: 4px;
    font-size: 11px;
    color: #93c5fd;
  }

  .topo-counts {
    color: #64748b;
    margin-left: 4px;
  }

  .hint-badge {
    padding: 4px 10px;
    background: rgba(15, 23, 42, 0.95);
    border-radius: 4px;
    font-size: 10px;
    color: #64748b;
    font-style: italic;
  }

  .hover-badge {
    padding: 4px 10px;
    background: rgba(34, 197, 94, 0.9);
    border-radius: 4px;
    font-size: 11px;
    color: white;
    font-weight: 500;
  }

  .hover-badge.face { background: rgba(59, 130, 246, 0.9); }
  .hover-badge.edge { background: rgba(34, 197, 94, 0.9); }
  .hover-badge.vertex { background: rgba(251, 191, 36, 0.9); color: black; }

  .sketch-badge {
    padding: 6px 14px;
    background: #06b6d4;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    color: white;
    letter-spacing: 1px;
  }

  .shortcuts {
    position: absolute;
    bottom: 12px;
    left: 12px;
    display: flex;
    gap: 16px;
    padding: 8px 12px;
    background: rgba(15, 23, 42, 0.95);
    border-radius: 6px;
    font-size: 10px;
    color: #64748b;
    pointer-events: none;
  }

  .shortcuts span {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 18px;
    padding: 0 5px;
    background: #334155;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    color: #e2e8f0;
    font-family: inherit;
  }
</style>
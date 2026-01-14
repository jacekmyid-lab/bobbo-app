<!--
  SketchToolInstructions.svelte
  Shows instructions for the active sketch tool
-->
<script lang="ts">
  import type { PolylineTool } from './sketchTools';

  // Props using $props()
  let { toolType, tool = null } = $props<{
    toolType: string;
    tool: any;
  }>();

  // Get instructions based on tool type
  function getInstructions(): { key: string; action: string }[] {
    switch (toolType) {
      case 'sketch-line':
        return [
          { key: 'Click', action: tool?.getStartPoint() ? 'Set end point' : 'Set start point' },
          { key: 'ESC', action: 'Cancel' }
        ];
      
      case 'sketch-polyline':
        const points = tool?.getPointCount?.() || 0;
        const canClose = tool?.canClose?.() || false;
        
        return [
          { key: 'Click', action: points === 0 ? 'Start polyline' : (canClose ? 'Close shape ●' : 'Add point') },
          { key: 'Right-click', action: 'Finish open' },
          { key: 'Backspace', action: 'Undo point' },
          { key: 'Enter', action: 'Close shape' },
          { key: 'ESC', action: 'Cancel' }
        ];
      
      case 'sketch-circle':
        return [
          { key: 'Click', action: tool?.getCenter() ? 'Set radius' : 'Set center' },
          { key: 'ESC', action: 'Cancel' }
        ];
      
      case 'sketch-rectangle':
        return [
          { key: 'Click', action: tool?.getCorner() ? 'Set size' : 'Set corner' },
          { key: 'ESC', action: 'Cancel' }
        ];
      
      case 'sketch-arc':
        return [
          { key: 'Click', action: 'Define arc' },
          { key: 'ESC', action: 'Cancel' }
        ];
      
      default:
        return [];
    }
  }

  let instructions = $derived(getInstructions());
  
  // Tool display names
  const toolNames: Record<string, string> = {
    'sketch-line': 'Line',
    'sketch-polyline': 'Polyline',
    'sketch-circle': 'Circle',
    'sketch-rectangle': 'Rectangle',
    'sketch-arc': 'Arc'
  };

  let toolName = $derived(toolNames[toolType] || 'Sketch Tool');
  let pointCount = $derived(tool?.getPointCount?.() || 0);
  let canClose = $derived(tool?.canClose?.() || false);
</script>

<div class="sketch-instructions">
  <div class="instruction-header">
    <span class="tool-name">{toolName}</span>
    {#if toolType === 'sketch-polyline' && pointCount > 0}
      <span class="point-count">
        {pointCount} point{pointCount !== 1 ? 's' : ''}
        {#if canClose}
          <span class="closeable">● Can close</span>
        {/if}
      </span>
    {/if}
  </div>
  
  <div class="instruction-list">
    {#each instructions as { key, action }}
      <div class="instruction-row" class:highlight={action.includes('●')}>
        <span class="key">{key}</span>
        <span class="action">{action}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .sketch-instructions {
    position: absolute;
    top: 80px;
    left: 12px;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid #06b6d4;
    border-radius: 6px;
    padding: 12px;
    pointer-events: none;
    z-index: 20;
    min-width: 220px;
  }

  .instruction-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(6, 182, 212, 0.3);
  }

  .tool-name {
    font-size: 12px;
    font-weight: 700;
    color: #06b6d4;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .point-count {
    font-size: 10px;
    color: #94a3b8;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .closeable {
    color: #22c55e;
    font-weight: 600;
  }

  .instruction-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .instruction-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #94a3b8;
  }

  .instruction-row.highlight {
    color: #06b6d4;
    font-weight: 600;
  }

  .key {
    display: inline-block;
    padding: 2px 6px;
    background: #334155;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    color: #e2e8f0;
    min-width: 80px;
    text-align: center;
  }

  .action {
    flex: 1;
  }
</style>
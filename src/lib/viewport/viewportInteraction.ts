/**
 * viewportInteraction.ts (NODE-BASED FIXES)
 * ==========================================
 * Handles interaction with both 3D Solids and Sketch Entities.
 */

import * as THREE from 'three';
import { get } from 'svelte/store';
import {
  selectionStore,
  hoverStore,
  selectionModeStore,
  activeModelStore,
  sketchEditStore,
  pivotUpdateStore,
  toolStore
} from '$lib/stores/cadStore';
import { Solid, CADFace, CADEdge, CADVertex } from '$lib/geometry/Solid';

export function useViewportInteraction(
  getContainer: () => HTMLDivElement | undefined,
  getCamera: () => THREE.Camera | null,
  getScene: () => THREE.Scene | null,
  getSolids: () => Map<string, Solid>,
  getSketcher: () => any, // Sketcher reference
  onSketchUpdate: () => void // Force refresh function
) {
  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2();

  // --- Helper: Get Currently Active Model ---
  function getActiveModel(): Solid | null {
    const activeId = get(activeModelStore);
    const solids = getSolids();
    return activeId ? solids.get(activeId) || null : null;
  }

  // --- Helper: Find 3D Element (Face/Edge/Vertex) ---
  function findElementAtMouse(): CADFace | CADEdge | CADVertex | Solid | null {
    const scene = getScene();
    const camera = getCamera();
    if (!scene || !camera) return null;

    raycaster.setFromCamera(mouseNDC, camera);
    const mode = get(selectionModeStore);
    const solids = getSolids();

    // 1. Model Mode: Intersect any Solid
    if (mode === 'model') {
      const allFaces: THREE.Object3D[] = [];
      for (const solid of solids.values()) {
        allFaces.push(...solid.faces);
      }
      const intersects = raycaster.intersectObjects(allFaces, false);
      if (intersects.length > 0) {
        const face = intersects[0].object as CADFace;
        return face.parentSolid;
      }
      return null;
    }

    // 2. Topology Modes: Intersect ONLY Active Model
    const activeModel = getActiveModel();
    if (!activeModel) return null;

    if (mode === 'face') {
      const intersects = raycaster.intersectObjects(activeModel.faces, false);
      if (intersects.length > 0) return intersects[0].object as CADFace;
    }

    if (mode === 'edge') {
      raycaster.params.Line = { threshold: 1.0 };
      const intersects = raycaster.intersectObjects(activeModel.edges, false);
      if (intersects.length > 0) return intersects[0].object as CADEdge;
    }

    if (mode === 'vertex') {
      const threshold = 20; // Pixel threshold
      const container = getContainer();
      if (!container) return null;
      
      let closest: CADVertex | null = null;
      let closestDist = Infinity;

      for (const vertex of activeModel.vertices) {
        if (!vertex.visible) continue;
        const screenPos = vertex.position3D.clone().project(camera);
        const rect = container.getBoundingClientRect();
        const dx = (screenPos.x - mouseNDC.x) * rect.width / 2;
        const dy = (screenPos.y - mouseNDC.y) * rect.height / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < threshold && dist < closestDist) {
          closestDist = dist;
          closest = vertex;
        }
      }
      return closest;
    }

    return null;
  }

  // --- Event: Mouse Move (Hover) ---
  function handleMouseMove(event: MouseEvent): void {
    const container = getContainer();
    const camera = getCamera();
    if (!container || !camera) return;

    const rect = container.getBoundingClientRect();
    mouseNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // TODO: Sketch hover logic is handled by tools themselves or we can add it here
    
    // 3D Model Hover
    const element = findElementAtMouse();
    if (element instanceof CADFace) {
      hoverStore.set({ type: 'face', modelId: element.parentSolid?.nodeId || '', elementIndex: element.faceIndex, elementName: element.faceName });
    } else if (element instanceof CADEdge) {
      hoverStore.set({ type: 'edge', modelId: element.parentSolid?.nodeId || '', elementIndex: element.edgeIndex, elementName: element.edgeName });
    } else if (element instanceof CADVertex) {
      hoverStore.set({ type: 'vertex', modelId: element.parentSolid?.nodeId || '', elementIndex: element.vertexIndex, elementName: element.vertexName });
    } else if (element instanceof Solid) {
      hoverStore.set({ type: 'model', modelId: element.nodeId, elementIndex: -1, elementName: element.name });
    } else {
      hoverStore.set(null);
    }
  }

  // --- Event: Click (Select / Apply Tool) ---
  function handleClick(event: MouseEvent): void {
    const container = getContainer();
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    mouseNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;


    // === SKETCH INTERACTION (CONSTRAINT APPLICATION) ===
    if (get(sketchEditStore).isEditing) {
      const activeTool = get(toolStore).activeTool;
      const sketcher = getSketcher();

      // Only handle CLICK interaction for Constraints here.
      // Drawing tools handle their own clicks via sketchTools.ts
      if (sketcher && (activeTool === 'vertical-constraint' || activeTool === 'horizontal-constraint')) {
        const scene = getScene();
        const camera = getCamera();
        
        if (scene && camera) {
          raycaster.setFromCamera(mouseNDC, camera);
          
          // Raycast specifically for Sketch Entities
          const intersects = raycaster.intersectObjects(scene.children, true);
          const hit = intersects.find(i => i.object.userData?.isSketchEntity); // Use our new flag

          if (hit) {
            const { entityId, type } = hit.object.userData;
            
            // Constraints apply to LINES only for now
            if (type === 'line' || type === 'polyline') {
                console.log(`[Interaction] Applying ${activeTool} to ${entityId}`);
                
                let result;
                if (activeTool === 'vertical-constraint') {
                  result = sketcher.addVerticalConstraint(entityId);
                } else {
                  result = sketcher.addHorizontalConstraint(entityId);
                }

                if (result && result.success) {
                  onSketchUpdate(); // Refresh Viewport
                } else {
                  console.warn(`[Interaction] Failed: ${result?.error}`);
                }
                return; // Stop propagation
            }
          }
        }
      }
    }

    // === 3D MODEL SELECTION ===
    const addToSelection = event.shiftKey;
    const element = findElementAtMouse();
    const mode = get(selectionModeStore);
    const activeId = get(activeModelStore);
    const currentSelection = get(selectionStore);
    
    // Model Selection
    if (mode === 'model') {
      if (element instanceof Solid) {
        selectionStore.set([{ type: 'model', modelId: element.nodeId, elementIndex: -1, elementName: element.name }]);
      } else {
        selectionStore.clear();
      }
      return;
    }

    // Topology Selection (requires active model)
    if (!activeId) return;

    const baseSelection = addToSelection ? [...currentSelection] : [{ type: 'model' as const, modelId: activeId, elementIndex: -1, elementName: '' }];
    
    if (element instanceof CADFace) {
      selectionStore.set([...baseSelection, { type: 'face', modelId: activeId, elementIndex: element.faceIndex, elementName: element.faceName }]);
    } else if (element instanceof CADEdge) {
      selectionStore.set([...baseSelection, { type: 'edge', modelId: activeId, elementIndex: element.edgeIndex, elementName: element.edgeName }]);
    } else if (element instanceof CADVertex) {
      selectionStore.set([...baseSelection, { type: 'vertex', modelId: activeId, elementIndex: element.vertexIndex, elementName: element.vertexName, position: { x: element.position3D.x, y: element.position3D.y, z: element.position3D.z } }]);
    } else if (!addToSelection) {
      // Clear sub-selection
      selectionStore.set([{ type: 'model', modelId: activeId, elementIndex: -1, elementName: '' }]);
    }
  }

  // --- Event: Double Click (Activate) ---
  function handleDoubleClick(event: MouseEvent): void {
    const element = findElementAtMouse();
    
    if (element instanceof Solid) {
      activeModelStore.set(element.nodeId);
      selectionModeStore.set('model');
      selectionStore.set([{ type: 'model', modelId: element.nodeId, elementIndex: -1, elementName: element.name }]);
    } else if (element instanceof CADFace || element instanceof CADEdge || element instanceof CADVertex) {
      const parentId = element.parentSolid?.nodeId;
      if (parentId) {
        activeModelStore.set(parentId);
        selectionModeStore.set('model');
        selectionStore.set([{ type: 'model', modelId: parentId, elementIndex: -1, elementName: element.parentSolid?.name || '' }]);
      }
    } else {
      activeModelStore.set(null);
      selectionModeStore.set('model');
      selectionStore.clear();
    }
  }

  // --- Event: Key Down ---
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    const activeId = get(activeModelStore);
    
    switch (key) {
      case 'm': selectionModeStore.set('model'); break;
      case 'f': if(activeId) selectionModeStore.set('face'); break;
      case 'e': if(activeId) selectionModeStore.set('edge'); break;
      case 'v': if(activeId) selectionModeStore.set('vertex'); break;
      case 'p': 
        // Pivot Logic (simplified for brevity)
        const activeModel = getActiveModel();
        if (activeModel) { activeModel.setPivotToCenter(); pivotUpdateStore.update(n => n + 1); }
        break;
      case 'escape':
        if (get(sketchEditStore).isEditing) {
          sketchEditStore.exit();
        } else if (activeId) {
          activeModelStore.set(null);
          selectionModeStore.set('model');
          selectionStore.clear();
        }
        break;
    }
  }

  function handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  return {
    handleMouseMove,
    handleClick,
    handleDoubleClick,
    handleKeyDown,
    handleContextMenu
  };
}
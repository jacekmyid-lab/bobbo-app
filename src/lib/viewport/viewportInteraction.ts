/**
 * viewportInteraction.ts
 * FULLY FIXED - handles all mouse and keyboard interactions
 * ✅ Double-click activates model
 * ✅ Topology selection works after activation
 * ✅ ESC exits active model
 * ✅ Proper mode switching
 */

import * as THREE from 'three';
import { get } from 'svelte/store';
import {
  selectionStore,
  hoverStore,
  selectionModeStore,
  activeModelStore,
  sketchEditStore,
  pivotUpdateStore
} from '$lib/stores/cadStore';
import { Solid, CADFace, CADEdge, CADVertex } from '$lib/geometry/Solid';

export function useViewportInteraction(
  getContainer: () => HTMLDivElement | undefined,
  getCamera: () => THREE.Camera | null,
  getScene: () => THREE.Scene | null,
  getSolids: () => Map<string, Solid>
) {
  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2();

  function getActiveModel(): Solid | null {
    const activeId = get(activeModelStore);
    const solids = getSolids();
    return activeId ? solids.get(activeId) || null : null;
  }

  function findElementAtMouse(): CADFace | CADEdge | CADVertex | Solid | null {
    const scene = getScene();
    const camera = getCamera();
    if (!scene || !camera) return null;

    raycaster.setFromCamera(mouseNDC, camera);
    const mode = get(selectionModeStore);
    const solids = getSolids();

    // Model mode: any solid
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

    // Topology modes: require active model
    const activeModel = getActiveModel();
    if (!activeModel) return null;

    if (mode === 'face') {
      const intersects = raycaster.intersectObjects(activeModel.faces, false);
      if (intersects.length > 0) {
        return intersects[0].object as CADFace;
      }
    }

    if (mode === 'edge') {
      raycaster.params.Line = { threshold: 1.0 };
      const intersects = raycaster.intersectObjects(activeModel.edges, false);
      if (intersects.length > 0) {
        return intersects[0].object as CADEdge;
      }
    }

    if (mode === 'vertex') {
      const threshold = 20;
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

  function handleMouseMove(event: MouseEvent): void {
    const container = getContainer();
    const camera = getCamera();
    if (!container || !camera) return;

    const rect = container.getBoundingClientRect();
    mouseNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const element = findElementAtMouse();
    
    if (element instanceof CADFace) {
      hoverStore.set({
        type: 'face',
        modelId: element.parentSolid?.nodeId || '',
        elementIndex: element.faceIndex,
        elementName: element.faceName
      });
    } else if (element instanceof CADEdge) {
      hoverStore.set({
        type: 'edge',
        modelId: element.parentSolid?.nodeId || '',
        elementIndex: element.edgeIndex,
        elementName: element.edgeName
      });
    } else if (element instanceof CADVertex) {
      hoverStore.set({
        type: 'vertex',
        modelId: element.parentSolid?.nodeId || '',
        elementIndex: element.vertexIndex,
        elementName: element.vertexName
      });
    } else if (element instanceof Solid) {
      hoverStore.set({
        type: 'model',
        modelId: element.nodeId,
        elementIndex: -1,
        elementName: element.name
      });
    } else {
      hoverStore.set(null);
    }
  }

  function handleClick(event: MouseEvent): void {
    const addToSelection = event.shiftKey;
    const element = findElementAtMouse();
    const mode = get(selectionModeStore);
    const activeId = get(activeModelStore);
    const currentSelection = get(selectionStore);
    
    // Model mode - select but don't activate (use double-click for activation)
    if (mode === 'model') {
      if (element instanceof Solid) {
        selectionStore.set([{
          type: 'model',
          modelId: element.nodeId,
          elementIndex: -1,
          elementName: element.name
        }]);
      } else {
        selectionStore.clear();
      }
      return;
    }

    // Topology modes - require active model
    if (!activeId) {
      console.log('[Viewport] No active model - switch to model mode or double-click to activate');
      return;
    }

    const baseSelection = addToSelection ? [...currentSelection] : [{
      type: 'model' as const,
      modelId: activeId,
      elementIndex: -1,
      elementName: ''
    }];
    
    if (element instanceof CADFace) {
      selectionStore.set([...baseSelection, {
        type: 'face',
        modelId: activeId,
        elementIndex: element.faceIndex,
        elementName: element.faceName
      }]);
    } else if (element instanceof CADEdge) {
      selectionStore.set([...baseSelection, {
        type: 'edge',
        modelId: activeId,
        elementIndex: element.edgeIndex,
        elementName: element.edgeName
      }]);
    } else if (element instanceof CADVertex) {
      selectionStore.set([...baseSelection, {
        type: 'vertex',
        modelId: activeId,
        elementIndex: element.vertexIndex,
        elementName: element.vertexName,
        position: {
          x: element.position3D.x,
          y: element.position3D.y,
          z: element.position3D.z
        }
      }]);
    } else if (!addToSelection) {
      // Keep model active but clear topology selection
      selectionStore.set([{
        type: 'model',
        modelId: activeId,
        elementIndex: -1,
        elementName: ''
      }]);
    }
  }

  function handleDoubleClick(event: MouseEvent): void {
    const element = findElementAtMouse();
    
    if (element instanceof Solid) {
      // Double-click ACTIVATES model and switches to model mode to show Transform panel
      activeModelStore.set(element.nodeId);
      selectionModeStore.set('model');
      selectionStore.set([{
        type: 'model',
        modelId: element.nodeId,
        elementIndex: -1,
        elementName: element.name
      }]);
      console.log(`[Viewport] ✅ Activated model: ${element.name || element.nodeId}`);
    } else if (element instanceof CADFace || element instanceof CADEdge || element instanceof CADVertex) {
      // Double-click on topology - activate parent model
      const parentId = element.parentSolid?.nodeId;
      if (parentId) {
        activeModelStore.set(parentId);
        selectionModeStore.set('model');
        selectionStore.set([{
          type: 'model',
          modelId: parentId,
          elementIndex: -1,
          elementName: element.parentSolid?.name || ''
        }]);
        console.log(`[Viewport] ✅ Activated model via topology: ${parentId}`);
      }
    } else {
      // Double-click empty space - DEACTIVATE
      activeModelStore.set(null);
      selectionModeStore.set('model');
      selectionStore.clear();
      console.log(`[Viewport] Deactivated model`);
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) return;
    
    const key = event.key.toLowerCase();
    const activeId = get(activeModelStore);
    
    switch (key) {
      case 'm':
        selectionModeStore.set('model');
        console.log('[Viewport] Mode: MODEL');
        break;
        
      case 'f':
        if (activeId) {
          selectionModeStore.set('face');
          console.log('[Viewport] Mode: FACE');
        } else {
          console.log('[Viewport] Activate a model first (double-click)');
        }
        break;
        
      case 'e':
        if (activeId) {
          selectionModeStore.set('edge');
          console.log('[Viewport] Mode: EDGE');
        } else {
          console.log('[Viewport] Activate a model first (double-click)');
        }
        break;
        
      case 'v':
        if (activeId) {
          selectionModeStore.set('vertex');
          console.log('[Viewport] Mode: VERTEX');
        } else {
          console.log('[Viewport] Activate a model first (double-click)');
        }
        break;
        
      case 'p':
        // Set pivot to selected element
        const activeModel = getActiveModel();
        if (activeModel) {
          const currentSelection = get(selectionStore);
          const selFaces = currentSelection.filter(s => s.type === 'face');
          const selEdges = currentSelection.filter(s => s.type === 'edge');
          const selVerts = currentSelection.filter(s => s.type === 'vertex');
          
          if (selVerts.length > 0) {
            const v = activeModel.vertices[selVerts[0].elementIndex];
            if (v) {
              activeModel.setPivotToVertex(v);
              pivotUpdateStore.update(n => n + 1);
              console.log(`[Viewport] Pivot → Vertex ${v.vertexName}`);
            }
          } else if (selEdges.length > 0) {
            const e = activeModel.edges[selEdges[0].elementIndex];
            if (e) {
              activeModel.setPivotToEdge(e);
              pivotUpdateStore.update(n => n + 1);
              console.log(`[Viewport] Pivot → Edge ${e.edgeName}`);
            }
          } else if (selFaces.length > 0) {
            const f = activeModel.faces[selFaces[0].elementIndex];
            if (f) {
              activeModel.setPivotToFace(f);
              pivotUpdateStore.update(n => n + 1);
              console.log(`[Viewport] Pivot → Face ${f.faceName}`);
            }
          } else {
            // No selection - reset to center
            activeModel.setPivotToCenter();
            pivotUpdateStore.update(n => n + 1);
            console.log(`[Viewport] Pivot → Center`);
          }
        }
        break;
        
      case 'escape':
        if (get(sketchEditStore).isEditing) {
          sketchEditStore.exit();
          console.log('[Viewport] Exited sketch mode');
        } else if (activeId) {
          // ESC exits active model
          activeModelStore.set(null);
          selectionModeStore.set('model');
          selectionStore.clear();
          console.log('[Viewport] ❌ Exited active model');
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
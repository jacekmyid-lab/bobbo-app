/**
 * viewportInteraction.ts
 * Handles all mouse and keyboard interactions in the viewport
 */

import * as THREE from 'three';
import { get } from 'svelte/store';
import {
  selectionStore,
  hoverStore,
  selectionModeStore,
  activeModelStore,
  sketchEditStore
} from '$lib/stores/cadStore';
import type { Solid, CADFace, CADEdge, CADVertex } from '$lib/geometry/Solid';

export function useViewportInteraction(
  getContainer: () => HTMLDivElement | undefined,
  getCamera: () => THREE.Camera | null,
  getScene: () => THREE.Scene | null,
  solids: Map<string, Solid>
) {
  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2();

  /**
   * Get active model
   */
  function getActiveModel(): Solid | null {
    const activeId = get(activeModelStore);
    return activeId ? solids.get(activeId) || null : null;
  }

  /**
   * Find element under mouse
   */
  function findElementAtMouse(): CADFace | CADEdge | CADVertex | Solid | null {
    const scene = getScene();
    const camera = getCamera();
    if (!scene || !camera) return null;

    raycaster.setFromCamera(mouseNDC, camera);
    const mode = get(selectionModeStore);

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

  /**
   * Handle mouse move
   */
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

  /**
   * Handle click - selection
   */
  function handleClick(event: MouseEvent): void {
    const addToSelection = event.shiftKey;
    const element = findElementAtMouse();
    const mode = get(selectionModeStore);
    const activeId = get(activeModelStore);
    const selection = get(selectionStore);
    
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

    if (!activeId) return;

    const baseSelection = addToSelection ? [...selection] : [{
      type: 'model',
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
      selectionStore.set([{
        type: 'model',
        modelId: activeId,
        elementIndex: -1,
        elementName: ''
      }]);
    }
  }

  /**
   * Handle double-click - activate model
   */
  function handleDoubleClick(event: MouseEvent): void {
    const element = findElementAtMouse();
    
    if (element instanceof Solid) {
      activeModelStore.set(element.nodeId);
      selectionStore.set([{
        type: 'model',
        modelId: element.nodeId,
        elementIndex: -1,
        elementName: element.name
      }]);
    } else if (element instanceof CADFace || element instanceof CADEdge || element instanceof CADVertex) {
      const parentId = element.parentSolid?.nodeId;
      if (parentId) {
        activeModelStore.set(parentId);
      }
    } else {
      activeModelStore.set(null);
      selectionModeStore.set('model');
      selectionStore.clear();
    }
  }

  /**
   * Handle keyboard
   */
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) return;
    
    switch (event.key.toLowerCase()) {
      case 'm':
        selectionModeStore.set('model');
        break;
      case 'f':
        selectionModeStore.set('face');
        break;
      case 'e':
        selectionModeStore.set('edge');
        break;
      case 'v':
        selectionModeStore.set('vertex');
        break;
      case 'escape':
        if (get(sketchEditStore).isEditing) {
          sketchEditStore.exit();
        } else {
          activeModelStore.set(null);
          selectionStore.clear();
        }
        break;
    }
  }

  /**
   * Handle context menu
   */
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
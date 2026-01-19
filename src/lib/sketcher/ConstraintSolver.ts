/**
 * ============================================================================
 * CONSTRAINT SOLVER (NODE-BASED)
 * ============================================================================
 * * This module solves geometric constraints by modifying Node coordinates directly.
 * * KEY DIFFERENCE FROM OLD VERSION:
 * We do not move "lines". We move "nodes".
 * Because multiple lines share the same Node ID, moving one node
 * automatically updates all connected geometry.
 * * @module sketcher/ConstraintSolver
 */

import type {
  SketchNode,
  SketchEntity,
  Constraint,
  VerticalConstraint,
  HorizontalConstraint,
  SolveResult
} from '../core/types';

export class ConstraintSolver {
  // Solver operates on Nodes (coordinates) and Entities (structure)
  private nodes: Map<string, SketchNode>;
  private entities: Map<string, SketchEntity>;
  private constraints: Map<string, Constraint>;

  constructor(
    nodes: Map<string, SketchNode>,
    entities: Map<string, SketchEntity>,
    constraints: Map<string, Constraint>
  ) {
    this.nodes = nodes;
    this.entities = entities;
    this.constraints = constraints;
  }

  /**
   * Main solve loop.
   * Uses "Relaxation" method: iteratively nudges nodes to satisfy rules.
   */
  solve(): SolveResult {
    let iterations = 0;
    const maxIterations = 10; // Usually converges very fast for simple constraints
    const modifiedEntities: string[] = [];

    // Run the solver multiple times to resolve conflicting pulls
    for (let i = 0; i < maxIterations; i++) {
      let totalError = 0;

      for (const constraint of this.constraints.values()) {
        if (!constraint.enabled) continue;

        switch (constraint.type) {
          case 'vertical':
            totalError += this.solveVertical(constraint as VerticalConstraint);
            break;
          case 'horizontal':
            totalError += this.solveHorizontal(constraint as HorizontalConstraint);
            break;
        }
      }

      iterations++;
      // If everything is aligned perfectly, stop early
      if (totalError < 0.0001) break;
    }

    return {
      success: true,
      iterations,
      modifiedEntities // In node system we usually just redraw everything
    };
  }

  /**
   * VERTICAL: Force two nodes to share the same X coordinate.
   */
  private solveVertical(constraint: VerticalConstraint): number {
    const entityId = constraint.entityIds[0];
    const entity = this.entities.get(entityId);

    // Safety checks
    if (!entity || entity.type !== 'line') return 0;

    // LOOKUP NODES via ID (This is the key change!)
    const n1 = this.nodes.get(entity.startNodeId);
    const n2 = this.nodes.get(entity.endNodeId);

    if (!n1 || !n2) return 0;

    // Calculate error (X difference)
    const diff = n1.x - n2.x;
    if (Math.abs(diff) < 0.0001) return 0;

    // Move both nodes to the average X
    const avgX = (n1.x + n2.x) / 2;
    
    // DIRECT MUTATION OF NODES
    n1.x = avgX;
    n2.x = avgX;

    return Math.abs(diff);
  }

  /**
   * HORIZONTAL: Force two nodes to share the same Y coordinate.
   */
  private solveHorizontal(constraint: HorizontalConstraint): number {
    const entityId = constraint.entityIds[0];
    const entity = this.entities.get(entityId);

    if (!entity || entity.type !== 'line') return 0;

    // LOOKUP NODES
    const n1 = this.nodes.get(entity.startNodeId);
    const n2 = this.nodes.get(entity.endNodeId);

    if (!n1 || !n2) return 0;

    // Calculate error (Y difference)
    const diff = n1.y - n2.y;
    if (Math.abs(diff) < 0.0001) return 0;

    // Move both nodes to the average Y
    const avgY = (n1.y + n2.y) / 2;
    
    n1.y = avgY;
    n2.y = avgY;

    return Math.abs(diff);
  }
}

/**
 * Helper factory
 * Note: Now accepts 'nodes' as the first argument
 */
export function solveConstraints(
  nodes: Map<string, SketchNode>,
  entities: Map<string, SketchEntity>,
  constraints: Map<string, Constraint>
): { result: SolveResult; entities: Map<string, SketchEntity>; nodes: Map<string, SketchNode> } {
  
  const solver = new ConstraintSolver(nodes, entities, constraints);
  const result = solver.solve();
  
  // Return references so Sketcher can update its state
  return { result, entities, nodes };
}
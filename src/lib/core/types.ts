/**
 * ============================================================================
 * CAD CORE TYPES - FUNDAMENTAL TYPE DEFINITIONS
 * ============================================================================
 * * This module defines all core types used throughout the CAD application.
 * It serves as the single source of truth for type definitions and ensures
 * consistency across all modules.
 * * Key Design Principles:
 * 1. All geometry is based on Manifold-3D for CSG operations
 * 2. Types are designed for extensibility
 * 3. Clear separation between data and presentation
 * 4. Sketching uses Node-Based Topology
 * * @module core/types
 */

import type { Manifold, Mesh, CrossSection } from 'manifold-3d';
import type { BufferGeometry, Matrix4, Vector3 } from 'three';

// ============================================================================
// BASIC GEOMETRY TYPES
// ============================================================================

/**
 * 3D Point representation
 * Used for vertices, positions, and coordinate definitions
 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * 2D Point representation
 * Used in sketcher and cross-section operations
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Bounding Box for 3D objects
 * Useful for culling, selection, and viewport calculations
 */
export interface BoundingBox3D {
  min: Point3D;
  max: Point3D;
}

/**
 * Plane definition for sketch surfaces and cutting operations
 * Defined by origin point and normal vector
 */
export interface Plane {
  /** Unique identifier for the plane */
  id: string;
  /** Human-readable name */
  name: string;
  /** Origin point of the plane */
  origin: Point3D;
  /** Normal vector (should be normalized) */
  normal: Point3D;
  /** X-axis direction in the plane coordinate system */
  xAxis: Point3D;
  /** Y-axis direction in the plane coordinate system */
  yAxis: Point3D;
  /** Whether this is a reference plane (XY, XZ, YZ) or custom */
  isReference: boolean;
  /** Source of the plane (face, 3-point, offset, etc.) */
  source: PlaneSource;
}

/**
 * Describes how a plane was created
 */
export type PlaneSource = 
  | { type: 'reference'; axis: 'XY' | 'XZ' | 'YZ' }
  | { type: 'face'; faceId: string; modelId: string }
  | { type: 'threePoint'; points: [Point3D, Point3D, Point3D] }
  | { type: 'offset'; basePlaneId: string; distance: number }
  | { type: 'tangent'; modelId: string; point: Point3D };

// ============================================================================
// SELECTION TYPES
// ============================================================================

/**
 * Selection modes for the viewport
 * Determines what type of elements can be selected
 */
export type SelectionMode = 'model' | 'face' | 'edge' | 'vertex';

/**
 * Represents a selected element in the scene
 */
export interface Selection {
  /** Type of selected element */
  type: SelectionMode | 'sketch-entity'; // Added sketch-entity support
  /** ID of the parent model (or sketch entity ID) */
  modelId: string;
  /** Index of the element within the model (for face/edge/vertex) */
  elementIndex?: number;
  /** World position of the selection point */
  point?: Point3D;
  /** Optional name */
  elementName?: string;
  /** Optional position for vertices */
  position?: Point3D;
}

/**
 * Hover state for highlighting elements
 */
export interface HoverState {
  type: SelectionMode | 'sketch-entity';
  modelId: string;
  elementIndex?: number;
  elementName?: string;
}

// ============================================================================
// CAD MODEL TYPES
// ============================================================================

/**
 * Base interface for all CAD model nodes
 * All operations and primitives extend this interface
 */
export interface CADNodeBase {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Node type for discrimination */
  type: CADNodeType;
  /** Visibility state */
  visible: boolean;
  /** Lock state (prevents editing) */
  locked: boolean;
  /** Parent node ID (null for root) */
  parentId: string | null;
  /** Child node IDs */
  childIds: string[];
  /** Transformation matrix */
  transform: number[];
  /** Creation timestamp */
  createdAt: number;
  /** Last modification timestamp */
  modifiedAt: number;
  /** Custom metadata */
  metadata: Record<string, unknown>;
}

/**
 * All possible CAD node types
 */
export type CADNodeType = 
  // Primitives
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  // Operations
  | 'union'
  | 'difference'
  | 'intersection'
  // Features
  | 'extrude'
  | 'revolve'
  | 'sweep'
  | 'loft'
  // Other
  | 'sketch'
  | 'group'
  | 'import';

// ============================================================================
// PRIMITIVE DEFINITIONS
// ============================================================================

/**
 * Box primitive parameters
 */
export interface BoxParams {
  width: number;
  height: number;
  depth: number;
  /** Center the box on origin */
  center: boolean;
}

/**
 * Sphere primitive parameters
 */
export interface SphereParams {
  radius: number;
  /** Number of circular segments */
  circularSegments: number;
}

/**
 * Cylinder primitive parameters
 */
export interface CylinderParams {
  radius: number;
  height: number;
  circularSegments: number;
  /** Center on Z axis */
  center: boolean;
}

/**
 * Cone primitive parameters
 */
export interface ConeParams {
  bottomRadius: number;
  topRadius: number;
  height: number;
  circularSegments: number;
  center: boolean;
}

/**
 * Torus primitive parameters
 */
export interface TorusParams {
  majorRadius: number;
  minorRadius: number;
  majorSegments: number;
  minorSegments: number;
}

/**
 * Union of all primitive parameter types
 */
export type PrimitiveParams = 
  | { type: 'box'; params: BoxParams }
  | { type: 'sphere'; params: SphereParams }
  | { type: 'cylinder'; params: CylinderParams }
  | { type: 'cone'; params: ConeParams }
  | { type: 'torus'; params: TorusParams };

/**
 * CAD Primitive Node - a basic 3D shape
 */
export interface CADPrimitive extends CADNodeBase {
  type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus';
  /** Parametric definition */
  params: PrimitiveParams;
}

// ============================================================================
// BOOLEAN OPERATION TYPES
// ============================================================================

/**
 * Boolean operation types supported by Manifold
 */
export type BooleanOperation = 'union' | 'difference' | 'intersection';

/**
 * CAD Boolean Node - combines multiple bodies
 */
export interface CADBoolean extends CADNodeBase {
  type: 'union' | 'difference' | 'intersection';
  /** IDs of operand nodes */
  operandIds: string[];
}

// ============================================================================
// SKETCH TYPES (TOPOLOGY & GEOMETRY)
// ============================================================================

/**
 * Sketch entity types - all elements that can exist in a sketch
 */
export type SketchEntityType = 
  | 'line'
  | 'polyline'
  | 'rectangle'
  | 'circle'
  | 'arc'
  | 'spline'
  | 'point';

/**
 * Fundamental atomic unit of geometry (Topology Node)
 * Allows connecting multiple entities to the same point.
 */
export interface SketchNode {
  id: string;
  x: number;
  y: number;
  fixed?: boolean;
}

/**
 * Base interface for sketch entities
 */
export interface SketchEntityBase {
  /** Unique identifier within sketch */
  id: string;
  /** Entity type */
  type: SketchEntityType;
  /** Whether this is a construction geometry */
  construction: boolean;
  /** Connected entity IDs (logical connections beyond nodes) */
  connections: string[];
}

/**
 * Line segment in sketch
 * NOW USES NODE IDs
 */
export interface SketchLine extends SketchEntityBase {
  type: 'line';
  startNodeId: string; // Reference to SketchNode
  endNodeId: string;   // Reference to SketchNode
}

/**
 * Polyline (connected line segments)
 * NOW USES NODE IDs
 */
export interface SketchPolyline extends SketchEntityBase {
  type: 'polyline';
  nodeIds: string[]; // Array of references to SketchNodes
  closed: boolean;
}

/**
 * Rectangle in sketch
 * NOW USES NODE IDs
 */
export interface SketchRectangle extends SketchEntityBase {
  type: 'rectangle';
  cornerNodeId: string; // Reference to Top-Left SketchNode
  width: number;
  height: number;
}

/**
 * Circle in sketch
 * NOW USES NODE IDs
 */
export interface SketchCircle extends SketchEntityBase {
  type: 'circle';
  centerNodeId: string; // Reference to Center SketchNode
  radius: number;
}

/**
 * Arc in sketch
 * NOW USES NODE IDs
 */
export interface SketchArc extends SketchEntityBase {
  type: 'arc';
  centerNodeId: string; // Reference to Center SketchNode
  radius: number;
  startAngle: number;
  endAngle: number;
}

/**
 * Spline curve in sketch
 * NOW USES NODE IDs
 */
export interface SketchSpline extends SketchEntityBase {
  type: 'spline';
  controlPointNodeIds: string[]; // References to SketchNodes
  degree: number;
}

/**
 * Point in sketch (for constraints)
 * NOW USES NODE IDs
 */
export interface SketchPoint extends SketchEntityBase {
  type: 'point';
  nodeId: string; // Reference to SketchNode
}

/**
 * Union of all sketch entity types
 */
export type SketchEntity = 
  | SketchLine 
  | SketchPolyline 
  | SketchRectangle 
  | SketchCircle 
  | SketchArc 
  | SketchSpline 
  | SketchPoint;

// ============================================================================
// CONSTRAINT TYPES (for sketch dimensioning)
// ============================================================================

/**
 * Constraint types for sketch dimensioning
 */
export type ConstraintType = 
  | 'horizontal'
  | 'vertical'
  | 'distance'
  | 'angle'
  | 'radius'
  | 'coincident'
  | 'parallel'
  | 'perpendicular'
  | 'tangent'
  | 'equal'
  | 'midpoint'
  | 'fixed';

/**
 * Base constraint interface
 */
export interface ConstraintBase {
  id: string;
  type: ConstraintType;
  entityIds: string[];
  enabled?: boolean; 
}

/**
 * Vertical constraint - forces line to be vertical (parallel to Y axis)
 */
export interface VerticalConstraint extends ConstraintBase {
  type: 'vertical';
  entityIds: [string]; // Single line entity
  enabled: boolean;
}

/**
 * Horizontal constraint - forces line to be horizontal (parallel to X axis)
 */
export interface HorizontalConstraint extends ConstraintBase {
  type: 'horizontal';
  entityIds: [string]; // Single line entity
  enabled: boolean;
}

/**
 * Distance constraint (dimension)
 */
export interface DistanceConstraint extends ConstraintBase {
  type: 'distance';
  value: number;
  /** Display position for the dimension */
  displayOffset?: Point2D;
}

/**
 * Angle constraint
 */
export interface AngleConstraint extends ConstraintBase {
  type: 'angle';
  value: number;
  displayOffset?: Point2D;
}

/**
 * Radius constraint
 */
export interface RadiusConstraint extends ConstraintBase {
  type: 'radius';
  value: number;
}

/**
 * Union of all constraint types
 */
export type Constraint = 
  | VerticalConstraint   
  | HorizontalConstraint 
  | ConstraintBase 
  | DistanceConstraint 
  | AngleConstraint 
  | RadiusConstraint;


/**
 * Constraint solving result
 */
export interface SolveResult {
  success: boolean;
  iterations: number;
  error?: string;
  /** Entities that were modified */
  modifiedEntities: string[];
}

// ============================================================================
// SKETCH NODE
// ============================================================================

/**
 * Complete sketch definition
 */
export interface CADSketch extends CADNodeBase {
  type: 'sketch';
  /** Plane this sketch is on */
  planeId: string;
  /** All nodes (points) in the sketch - TOPOLOGY */
  nodes: SketchNode[];
  /** All entities in the sketch - GEOMETRY */
  entities: SketchEntity[];
  /** All constraints */
  constraints: Constraint[];
  /** Whether the sketch is fully constrained */
  fullyConstrained: boolean;
  /** Computed closed profiles (for extrusion, etc.) */
  profiles: Point2D[][];
}

// ============================================================================
// FEATURE TYPES (Extrude, Revolve, etc.)
// ============================================================================

/**
 * Extrusion direction types
 */
export type ExtrudeDirection = 'normal' | 'both' | 'symmetric';

/**
 * Extrude operation parameters
 */
export interface ExtrudeParams {
  /** Source sketch ID */
  sketchId: string;
  /** Extrusion distance */
  distance: number;
  /** Direction mode */
  direction: ExtrudeDirection;
  /** Draft angle in degrees */
  draftAngle: number;
  /** Boolean operation with parent body */
  booleanOp: BooleanOperation | 'new';
  /** Target body ID for boolean (null = new body) */
  targetBodyId: string | null;
}

/**
 * CAD Extrude Node
 */
export interface CADExtrude extends CADNodeBase {
  type: 'extrude';
  params: ExtrudeParams;
}

/**
 * Revolve operation parameters
 */
export interface RevolveParams {
  /** Source sketch ID */
  sketchId: string;
  /** Revolution axis (line in sketch) */
  axisEntityId: string;
  /** Angle in degrees */
  angle: number;
  /** Boolean operation with parent body */
  booleanOp: BooleanOperation | 'new';
  /** Target body ID for boolean */
  targetBodyId: string | null;
}

/**
 * CAD Revolve Node
 */
export interface CADRevolve extends CADNodeBase {
  type: 'revolve';
  params: RevolveParams;
}

// ============================================================================
// GROUP AND IMPORT NODES
// ============================================================================

/**
 * Group node for organizing the tree
 */
export interface CADGroup extends CADNodeBase {
  type: 'group';
}

/**
 * Imported geometry node
 */
export interface CADImport extends CADNodeBase {
  type: 'import';
  /** Original file name */
  fileName: string;
  /** File format */
  format: 'stl' | 'obj' | 'step' | 'glb';
  /** Raw mesh data if needed */
  meshData?: ArrayBuffer;
}

// ============================================================================
// UNION OF ALL CAD NODE TYPES
// ============================================================================

/**
 * Complete union of all CAD node types
 */
export type CADNode = 
  | CADPrimitive 
  | CADBoolean 
  | CADSketch 
  | CADExtrude 
  | CADRevolve 
  | CADGroup 
  | CADImport;

// ============================================================================
// SCENE AND MODEL CACHE TYPES
// ============================================================================

/**
 * Cached computed geometry for a node
 * This is computed from the parametric definition and cached for performance
 */
export interface ComputedGeometry {
  /** The Manifold solid (for CSG operations) */
  manifold: Manifold | null;
  /** Three.js BufferGeometry for rendering */
  threeGeometry: BufferGeometry | null;
  /** Mesh data for BVH acceleration */
  meshData: {
    vertices: Float32Array;
    indices: Uint32Array;
    normals: Float32Array;
  } | null;
  /** Topological data extracted from Manifold */
  topology: {
    vertices: Point3D[];
    edges: Array<{ start: number; end: number }>;
    faces: Array<{ vertexIndices: number[]; normal: Point3D }>;
  } | null;
  /** Bounding box */
  bounds: BoundingBox3D | null;
  /** Whether this needs recomputation */
  dirty: boolean;
  /** Error message if computation failed */
  error: string | null;
}

/**
 * Complete CAD document
 */
export interface CADDocument {
  /** Document version */
  version: string;
  /** Document name */
  name: string;
  /** All nodes indexed by ID */
  nodes: Map<string, CADNode>;
  /** Root node IDs */
  rootIds: string[];
  /** All planes indexed by ID */
  planes: Map<string, Plane>;
  /** Currently active plane ID */
  activePlaneId: string | null;
  /** Document-level units */
  units: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  /** Undo history */
  history: CADHistoryEntry[];
  /** Current history position */
  historyPosition: number;
}

/**
 * History entry for undo/redo
 */
export interface CADHistoryEntry {
  /** Description of the action */
  description: string;
  /** Timestamp */
  timestamp: number;
  /** Nodes before change */
  before: Map<string, CADNode>;
  /** Nodes after change */
  after: Map<string, CADNode>;
}

// ============================================================================
// TOOL TYPES
// ============================================================================

/**
 * Available CAD tools
 */
export type ToolType = 
  // Selection tools
  | 'select'
  // Primitive creation
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  // Operations
  | 'union'
  | 'difference'
  | 'intersection'
  // Transform tools
  | 'move'
  | 'rotate'
  | 'scale'
  // Sketch tools
  | 'sketch-line'
  | 'sketch-polyline'
  | 'sketch-rectangle'
  | 'sketch-circle'
  | 'sketch-arc'
  | 'sketch-spline'
  | 'sketch-trim'
  | 'sketch-extend'
  | 'sketch-offset'
  // Constraint tools
  | 'vertical-constraint'
  | 'horizontal-constraint'
  
  // Feature tools
  | 'extrude'
  | 'revolve'
  // Plane tools
  | 'plane-3point'
  | 'plane-offset'
  | 'plane-face'
  // Dimension tools
  | 'dimension-distance'
  | 'dimension-angle'
  | 'dimension-radius';

/**
 * Tool state during interaction
 */
export interface ToolState {
  /** Currently active tool */
  activeTool: ToolType;
  /** Tool-specific state data */
  data: Record<string, unknown>;
  /** Whether tool is in active interaction */
  isActive: boolean;
  /** Step within multi-step tool */
  step: number;
}

// ============================================================================
// VIEWPORT TYPES
// ============================================================================

/**
 * Camera preset views
 */
export type ViewPreset = 
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'isometric'
  | 'custom';

/**
 * Viewport configuration
 */
export interface ViewportConfig {
  /** Camera projection mode */
  projection: 'perspective' | 'orthographic';
  /** Show grid */
  showGrid: boolean;
  /** Show axes */
  showAxes: boolean;
  /** Show origin */
  showOrigin: boolean;
  /** Background color */
  backgroundColor: string;
  /** Grid size */
  gridSize: number;
  /** Grid divisions */
  gridDivisions: number;
  /** Edge display mode */
  edgeDisplay: 'none' | 'all' | 'sharp';
  /** Render mode */
  renderMode: 'shaded' | 'wireframe' | 'shaded-wireframe';
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * CAD operation events
 */
export type CADEvent = 
  | { type: 'node-created'; nodeId: string }
  | { type: 'node-updated'; nodeId: string }
  | { type: 'node-deleted'; nodeId: string }
  | { type: 'selection-changed'; selection: Selection[] }
  | { type: 'tool-changed'; tool: ToolType }
  | { type: 'plane-created'; planeId: string }
  | { type: 'sketch-entered'; sketchId: string }
  | { type: 'sketch-exited'; sketchId: string }
  | { type: 'geometry-computed'; nodeId: string }
  | { type: 'error'; message: string };

/**
 * Event handler type
 */
export type CADEventHandler = (event: CADEvent) => void;

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Deep partial type for configuration objects
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Result type for operations that can fail
 */
export type Result<T, E = string> = 
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Async result type
 */
export type AsyncResult<T, E = string> = Promise<Result<T, E>>;
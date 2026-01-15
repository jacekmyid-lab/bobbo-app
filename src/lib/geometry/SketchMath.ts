import type { Point2D } from '$lib/core/types';

export class SketchMath {
  /**
   * Oblicza punkt przecięcia dwóch odcinków (p1-p2 oraz p3-p4).
   * Zwraca null, jeśli są równoległe.
   * t, u: parametry na odcinkach (0-1 oznacza wewnątrz odcinka).
   */
  static intersectLineLine(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): { point: Point2D, t: number, u: number } | null {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;

    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-10) return null; // Równoległe

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

    return {
      point: {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1)
      },
      t,
      u
    };
  }

  /**
   * Rzutuje punkt p na linię wyznaczoną przez start-end.
   * Zwraca parametr t (gdzie t=0 to start, t=1 to end) oraz dystans.
   */
  static projectPointOnLine(p: Point2D, start: Point2D, end: Point2D): { t: number, dist: number, point: Point2D } {
    const l2 = (start.x - end.x)**2 + (start.y - end.y)**2;
    if (l2 === 0) return { t: 0, dist: this.distance(p, start), point: start };

    const t = ((p.x - start.x) * (end.x - start.x) + (p.y - start.y) * (end.y - start.y)) / l2;
    
    const proj = {
      x: start.x + t * (end.x - start.x),
      y: start.y + t * (end.y - start.y)
    };

    return { t, dist: this.distance(p, proj), point: proj };
  }

  static distance(p1: Point2D, p2: Point2D): number {
    return Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
  }

  static normalize(v: Point2D): Point2D {
    const len = Math.sqrt(v.x*v.x + v.y*v.y);
    if (len === 0) return {x: 0, y: 0};
    return {x: v.x / len, y: v.y / len};
  }

  /**
   * Zwraca normalną 2D (wektor prostopadły) do odcinka.
   */
  static getNormal2D(p1: Point2D, p2: Point2D): Point2D {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return this.normalize({ x: -dy, y: dx });
  }
}
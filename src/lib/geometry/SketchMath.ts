// src/lib/geometry/SketchMath.ts

import type { Point2D } from '../core/types';

const EPSILON = 1e-4;

// --- PODSTAWOWE WEKTORY ---
export const vecAdd = (a: Point2D, b: Point2D): Point2D => ({ x: a.x + b.x, y: a.y + b.y });
export const vecSub = (a: Point2D, b: Point2D): Point2D => ({ x: a.x - b.x, y: a.y - b.y });
export const vecMul = (a: Point2D, s: number): Point2D => ({ x: a.x * s, y: a.y * s });
export const vecLen = (a: Point2D): number => Math.sqrt(a.x * a.x + a.y * a.y);
export const vecNorm = (a: Point2D): Point2D => {
  const len = vecLen(a);
  return len > 0 ? vecMul(a, 1 / len) : { x: 0, y: 0 };
};
export const vecDist = (a: Point2D, b: Point2D): number => vecLen(vecSub(a, b));
export const vecDot = (a: Point2D, b: Point2D): number => a.x * b.x + a.y * b.y;

export const getNormal2D = (p1: Point2D, p2: Point2D): Point2D => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < EPSILON) return { x: 0, y: 1 };
  return { x: -dy / len, y: dx / len };
};

export function projectPointOnLine(p: Point2D, a: Point2D, b: Point2D) {
  const ab = vecSub(b, a);
  const ap = vecSub(p, a);
  const lenSq = ab.x * ab.x + ab.y * ab.y;
  let t = 0;
  if (lenSq > EPSILON) t = vecDot(ap, ab) / lenSq;
  const tClamped = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + ab.x * tClamped, y: a.y + ab.y * tClamped };
  return { point: closest, t, tClamped, dist: vecDist(p, closest) };
}

export function intersectLineLine(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): { x: number, y: number, t: number, u: number } | null {
  const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (Math.abs(denom) < EPSILON) return null;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1), t: ua, u: ub };
}

export function intersectLineCircle(p1: Point2D, p2: Point2D, center: Point2D, radius: number): number[] { 
  const d = vecSub(p2, p1);
  const f = vecSub(p1, center);
  const a = vecDot(d, d);
  const b = 2 * vecDot(f, d);
  const c = vecDot(f, f) - radius * radius;
  let discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);
  const result: number[] = [];
  // Zwracamy wszystkie t (nawet te poza odcinkiem 0..1, bo EXTEND ich potrzebuje)
  result.push(t1);
  result.push(t2);
  return result;
}

// --- TRIM ---
export function calculateTrim(
  targetSegment: { p1: Point2D; p2: Point2D },
  clickPoint: Point2D,
  otherSegments: { p1: Point2D; p2: Point2D }[],
  otherCircles: { center: Point2D, radius: number }[] = []
): { p1: Point2D; p2: Point2D }[] | null {
  
  const p1 = targetSegment.p1;
  const p2 = targetSegment.p2;
  const cutsT: number[] = [0, 1];

  // Linie
  for (const seg of otherSegments) {
    const res = intersectLineLine(p1, p2, seg.p1, seg.p2);
    if (res && res.t > EPSILON && res.t < 1 - EPSILON) {
        if (res.u >= -EPSILON && res.u <= 1 + EPSILON) cutsT.push(res.t);
    }
  }

  // Okręgi
  for (const circle of otherCircles) {
    const ts = intersectLineCircle(p1, p2, circle.center, circle.radius);
    for (const t of ts) {
        if (t > EPSILON && t < 1 - EPSILON) cutsT.push(t);
    }
  }

  cutsT.sort((a, b) => a - b);
  const uniqueT = cutsT.filter((t, i) => i === 0 || t > cutsT[i - 1] + EPSILON);

  const fragments: { p1: Point2D; p2: Point2D }[] = [];
  for (let i = 0; i < uniqueT.length - 1; i++) {
    const tStart = uniqueT[i];
    const tEnd = uniqueT[i+1];
    fragments.push({
        p1: { x: p1.x + tStart * (p2.x - p1.x), y: p1.y + tStart * (p2.y - p1.y) },
        p2: { x: p1.x + tEnd * (p2.x - p1.x), y: p1.y + tEnd * (p2.y - p1.y) }
    });
  }

  let closestIdx = -1;
  let minDistance = Infinity;
  fragments.forEach((frag, idx) => {
    const proj = projectPointOnLine(clickPoint, frag.p1, frag.p2);
    if (proj.dist < minDistance) {
        minDistance = proj.dist;
        closestIdx = idx;
    }
  });

  if (closestIdx !== -1) {
    fragments.splice(closestIdx, 1);
    return fragments;
  }
  
  if (uniqueT.length === 2) return []; 
  return null; 
}

// --- EXTEND (Zaktualizowany o Okręgi) ---
export function calculateExtend(
  targetSegment: { p1: Point2D; p2: Point2D },
  clickPoint: Point2D,
  otherSegments: { p1: Point2D; p2: Point2D }[],
  otherCircles: { center: Point2D, radius: number }[] = [] // Nowy argument
): { p1: Point2D; p2: Point2D } | null {

    const p1 = targetSegment.p1;
    const p2 = targetSegment.p2;
    const d1 = vecDist(clickPoint, p1);
    const d2 = vecDist(clickPoint, p2);
    const extendP2 = d2 < d1;

    const startPt = extendP2 ? p1 : p2;
    const endPt = extendP2 ? p2 : p1;
    const dir = vecNorm(vecSub(endPt, startPt));
    const farPt = vecAdd(endPt, vecMul(dir, 10000)); // Raycast w nieskończoność

    let bestInt: Point2D | null = null;
    let minDist = Infinity;

    // 1. Sprawdź przecięcia z liniami
    for (const seg of otherSegments) {
        const res = intersectLineLine(endPt, farPt, seg.p1, seg.p2);
        if (res && res.t > EPSILON && res.u >= -EPSILON && res.u <= 1 + EPSILON) {
            const dist = vecDist(endPt, {x: res.x, y: res.y});
            if (dist < minDist) { minDist = dist; bestInt = { x: res.x, y: res.y }; }
        }
    }

    // 2. Sprawdź przecięcia z okręgami
    for (const circle of otherCircles) {
        // Traktujemy linię endPt -> farPt jako prostą do testu
        const ts = intersectLineCircle(endPt, farPt, circle.center, circle.radius);
        for (const t of ts) {
            // t > 0 oznacza, że przecięcie jest "przed nami"
            if (t > EPSILON) {
                // Oblicz punkt przecięcia
                const intX = endPt.x + t * (farPt.x - endPt.x);
                const intY = endPt.y + t * (farPt.y - endPt.y);
                const dist = Math.sqrt((intX - endPt.x)**2 + (intY - endPt.y)**2);
                
                if (dist < minDist) {
                    minDist = dist;
                    bestInt = { x: intX, y: intY };
                }
            }
        }
    }

    if (bestInt) return extendP2 ? { p1: p1, p2: bestInt } : { p1: bestInt, p2: p2 };
    return null;
}

// --- OFFSET (Bez zmian) ---
export function calculateOffsetChain(points: Point2D[], distance: number): Point2D[] {
    if (points.length < 2) return points;
    const newPoints: Point2D[] = [];
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        const normal = getNormal2D(p1, p2);
        const p1_off = { x: p1.x + normal.x * distance, y: p1.y + normal.y * distance };
        const p2_off = { x: p2.x + normal.x * distance, y: p2.y + normal.y * distance };
        segments.push({ p1: p1_off, p2: p2_off });
    }
    newPoints.push(segments[0].p1);
    for (let i = 0; i < segments.length - 1; i++) {
        const s1 = segments[i];
        const s2 = segments[i+1];
        const intersection = intersectLineLine(s1.p1, s1.p2, s2.p1, s2.p2);
        if (intersection) newPoints.push({ x: intersection.x, y: intersection.y });
        else newPoints.push(s1.p2);
    }
    newPoints.push(segments[segments.length - 1].p2);
    return newPoints;
}

export const SketchMath = {
    distance: vecDist,
    vecAdd, vecSub, vecMul, vecLen, vecNorm, vecDist, vecDot,
    getNormal2D,
    intersectLineLine,
    intersectLineCircle,
    projectPointOnLine,
    calculateTrim,
    calculateExtend,
    calculateOffsetChain,
    EPSILON
};
// src/lib/geometry/SketchMath.ts

import type { Point2D } from '../core/types';

// Stała dla tolerancji błędów zmiennoprzecinkowych
const EPSILON = 1e-9;

/**
 * ============================================================================
 * PODSTAWOWE OPERACJE WEKTOROWE
 * ============================================================================
 */
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

/**
 * Rzutuje punkt P na odcinek AB.
 * Zwraca punkt rzutowania, parametr t (0-1) i dystans.
 */
export function projectPointOnLine(p: Point2D, a: Point2D, b: Point2D) {
  const ab = vecSub(b, a);
  const ap = vecSub(p, a);
  const lenSq = ab.x * ab.x + ab.y * ab.y;
  
  let t = 0;
  if (lenSq > EPSILON) {
    t = vecDot(ap, ab) / lenSq;
  }
  
  // Ograniczenie do odcinka (clamp 0..1)
  const tClamped = Math.max(0, Math.min(1, t));
  
  const closest = {
    x: a.x + ab.x * tClamped,
    y: a.y + ab.y * tClamped
  };

  return {
    point: closest,
    t: t, // surowe t (może być <0 lub >1 jeśli rzut jest poza odcinkiem)
    tClamped: tClamped,
    dist: vecDist(p, closest)
  };
}

/**
 * Znajduje przecięcie dwóch odcinków (p1-p2) i (p3-p4).
 */
export function getLineIntersection(
  p1: Point2D, p2: Point2D, 
  p3: Point2D, p4: Point2D, 
  extend: boolean = false
): Point2D | null {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  
  if (Math.abs(d) < EPSILON) return null; // Linie równoległe

  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;

  if (extend) {
    return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y)
    };
  } else {
    // Dla zwykłego przecięcia: t i u muszą być w [0, 1]
    if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
      return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y)
      };
    }
  }
  return null;
}

/**
 * ============================================================================
 * LOGIKA NARZĘDZI (TRIM, EXTEND, OFFSET)
 * ============================================================================
 */

/**
 * NOWY ALGORYTM TRIM:
 * 1. Znajdź wszystkie punkty przecięcia na linii.
 * 2. Podziel linię na segmenty (kawałki).
 * 3. Znajdź kawałek, który jest NAJBLIŻEJ kliknięcia myszką.
 * 4. Usuń ten kawałek i zwróć resztę.
 */
export function calculateTrim(
  targetSegment: { p1: Point2D; p2: Point2D },
  clickPoint: Point2D,
  otherSegments: { p1: Point2D; p2: Point2D }[]
): { p1: Point2D; p2: Point2D }[] | null {
  
  const p1 = targetSegment.p1;
  const p2 = targetSegment.p2;
  const vLine = vecSub(p2, p1);
  const lenSq = vecDot(vLine, vLine);

  if (lenSq < EPSILON) return null; // Punkt, nie linia

  // 1. Zbieramy punkty podziału (jako wartości t od 0 do 1)
  const cutPointsT: number[] = [0, 1];

  otherSegments.forEach(seg => {
    const pt = getLineIntersection(p1, p2, seg.p1, seg.p2, false);
    if (pt) {
      // Oblicz t dla punktu przecięcia (rzutowanie na linię bazową)
      const vPt = vecSub(pt, p1);
      const t = vecDot(vPt, vLine) / lenSq;
      // Dodajemy tylko jeśli jest wewnątrz (z małym marginesem, żeby nie dublować końców)
      if (t > EPSILON && t < 1 - EPSILON) {
        cutPointsT.push(t);
      }
    }
  });

  // Sortujemy i usuwamy duplikaty
  cutPointsT.sort((a, b) => a - b);
  const uniqueT = cutPointsT.filter((t, i) => i === 0 || t > cutPointsT[i - 1] + EPSILON);

  // 2. Tworzymy listę potencjalnych segmentów
  const fragments: { p1: Point2D; p2: Point2D }[] = [];
  
  for (let i = 0; i < uniqueT.length - 1; i++) {
    const tStart = uniqueT[i];
    const tEnd = uniqueT[i+1];

    const fragP1 = {
      x: p1.x + tStart * (p2.x - p1.x),
      y: p1.y + tStart * (p2.y - p1.y)
    };
    const fragP2 = {
      x: p1.x + tEnd * (p2.x - p1.x),
      y: p1.y + tEnd * (p2.y - p1.y)
    };

    fragments.push({ p1: fragP1, p2: fragP2 });
  }

  // 3. Znajdujemy segment najbliższy kliknięciu
  let closestIdx = -1;
  let minDistance = Infinity;

  fragments.forEach((frag, index) => {
    // Oblicz dystans kliknięcia do tego konkretnego fragmentu
    const proj = projectPointOnLine(clickPoint, frag.p1, frag.p2);
    
    // Ważne: sprawdzamy dystans tylko jeśli rzut trafia w ten fragment
    // (projectPointOnLine robi clamp, więc dist zawsze jest poprawny geometrycznie)
    if (proj.dist < minDistance) {
      minDistance = proj.dist;
      closestIdx = index;
    }
  });

  // Jeśli znaleziono segment do usunięcia
  if (closestIdx !== -1) {
    // Usuwamy go z listy
    fragments.splice(closestIdx, 1);
    return fragments; // Zwracamy pozostałe
  }

  // Jeśli z jakiegoś powodu nic nie znaleziono (np. kliknięcie bardzo daleko),
  // dla bezpieczeństwa nie tnij nic (lub usuń wszystko jeśli taka wola).
  // Tutaj zakładamy, że jak kliknął w linię, to chce coś uciąć.
  // Jeśli fragments ma 1 element (brak przecięć) i user kliknął w linię -> usuń całość.
  return []; 
}

export function calculateExtend(
  targetSegment: { p1: Point2D; p2: Point2D },
  clickPoint: Point2D,
  otherSegments: { p1: Point2D; p2: Point2D }[]
): { p1: Point2D; p2: Point2D } | null {
  
  const p1 = targetSegment.p1;
  const p2 = targetSegment.p2;
  const dist1 = vecDist(clickPoint, p1);
  const dist2 = vecDist(clickPoint, p2);
  const extendingP2 = dist2 < dist1;

  const startPt = extendingP2 ? p1 : p2; // Stały punkt
  const movePt = extendingP2 ? p2 : p1;  // Punkt do przesunięcia
  const direction = vecNorm(vecSub(movePt, startPt)); 

  const farPoint = vecAdd(movePt, vecMul(direction, 100000)); 

  let closestInt: Point2D | null = null;
  let minDistance = Infinity;

  for (const seg of otherSegments) {
    const pt = getLineIntersection(movePt, farPoint, seg.p1, seg.p2, false);
    if (pt) {
      const d = vecDist(movePt, pt);
      if (d > EPSILON && d < minDistance) {
        minDistance = d;
        closestInt = pt;
      }
    }
  }

  if (closestInt) {
    return extendingP2 
      ? { p1: p1, p2: closestInt }
      : { p1: closestInt, p2: p2 };
  }
  return null;
}

export function calculateOffsetChain(
  points: Point2D[],
  distance: number
): Point2D[] {
  if (points.length < 2) return points;

  const newPoints: Point2D[] = [];
  const segments = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i+1];
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    
    const nx = -dy / len;
    const ny = dx / len;

    const p1_off = { x: p1.x + nx * distance, y: p1.y + ny * distance };
    const p2_off = { x: p2.x + nx * distance, y: p2.y + ny * distance };
    
    segments.push({ p1: p1_off, p2: p2_off });
  }

  newPoints.push(segments[0].p1);

  for (let i = 0; i < segments.length - 1; i++) {
    const s1 = segments[i];
    const s2 = segments[i+1];

    const intersection = getLineIntersection(
        s1.p1, s1.p2, 
        s2.p1, s2.p2, 
        true
    );

    if (intersection) {
      newPoints.push(intersection);
    } else {
      newPoints.push(s1.p2); 
    }
  }

  newPoints.push(segments[segments.length - 1].p2);

  return newPoints;
}

/**
 * ============================================================================
 * EXPORT ZBIORCZY (DLA WSTECZNEJ KOMPATYBILNOŚCI)
 * ============================================================================
 */
export const SketchMath = {
    vecAdd,
    vecSub,
    vecMul,
    vecLen,
    vecNorm,
    vecDist,
    vecDot,
    getLineIntersection,
    projectPointOnLine,
    calculateTrim,
    calculateExtend,
    calculateOffsetChain
};
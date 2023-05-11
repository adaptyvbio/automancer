export interface Point {
  x: number;
  y: number;
}

export interface SideFlags {
  bottom: boolean;
  left: boolean;
  right: boolean;
  top: boolean;
}

export interface SideValues {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface Size {
  width: number;
  height: number;
}


export function squareDistance(a: Point, b: Point) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function squareLength(point: Point) {
  return point.x ** 2 + point.y ** 2;
}

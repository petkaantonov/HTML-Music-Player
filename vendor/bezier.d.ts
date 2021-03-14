interface BezierObject {
    duration: (x: number, duration: number) => number;
    motion: (x: number, epsilon: number) => number;
}
export default function unitBezier(p1x: number, p1y: number, p2x: number, p2y: number): BezierObject;
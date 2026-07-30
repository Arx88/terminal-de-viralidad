'use client';

interface SparklineProps {
  points: number[];
  color: string;
  width?: number;
  height?: number;
}

export function Sparkline({ points, color, width = 60, height = 16 }: SparklineProps) {
  if (!points || points.length < 2) {
    return <svg width={width} height={height} aria-hidden />;
  }
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p - min) / range) * (height - 2) - 1;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  const areaColor = color + '20';

  return (
    <svg width={width} height={height} aria-hidden>
      <path d={areaPath} fill={areaColor} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

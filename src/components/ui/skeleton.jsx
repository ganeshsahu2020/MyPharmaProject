export function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse bg-slate-200/80 rounded ${className}`}
      style={{ minHeight: 8 }}
    />
  );
}
export default Skeleton;

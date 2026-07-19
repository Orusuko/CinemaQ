interface SkeletonTablaProps {
  filas?: number;
}

export default function SkeletonTabla({ filas = 4 }: SkeletonTablaProps) {
  return (
    <div style={{ padding: "1rem" }} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="skeleton skeleton-fila" />
      ))}
    </div>
  );
}

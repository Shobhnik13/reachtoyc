export function Spinner({size = 14}: {size?: number}) {
  return <span className="spin" style={{width: size, height: size}} aria-hidden />;
}

export function Loading({label = 'Loading'}: {label?: string}) {
  return (
    <div className="loading" role="status">
      <Spinner size={18} />
      <span>{label}…</span>
    </div>
  );
}

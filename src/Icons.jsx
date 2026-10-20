export function Plane({ size = 22, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}><path d="M11 2h2l1 7 7 4v2l-7-2 .5 6 2.5 2v1l-5-1-5 1v-1l2.5-2 .5-6-7 2v-2l7-4z"/></svg>;
}
export function Signal({ size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M8 8a6 6 0 0 0 0 8M16 8a6 6 0 0 1 0 8M12 12v9"/><circle cx="12" cy="11" r="2"/></svg>;
}

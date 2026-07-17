/** URL pública de uma foto no bucket `salas-fotos` (bucket público §3.2). */
export function urlFotoSala(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/salas-fotos/${path}`;
}

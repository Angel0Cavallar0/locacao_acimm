import { Construction } from "lucide-react";

/**
 * Stub padronizado para rotas do painel ainda sem feature implementada.
 * Nunca deixar uma rota interna retornar 404 (Spec 03 §4.1).
 */
export function PaginaEmConstrucao({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-ink-muted">
        <Construction className="size-6" />
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">{titulo}</h2>
      <p className="max-w-sm text-sm text-ink-muted">
        {descricao ?? "Esta área será disponibilizada em breve."}
      </p>
    </div>
  );
}

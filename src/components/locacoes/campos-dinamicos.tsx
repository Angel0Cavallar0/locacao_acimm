"use client";

import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CampoDef, RespostaValor } from "@/lib/formulario/campos-core";

/**
 * Renderer dos campos dinâmicos do formulário (`campos_formulario`).
 * Fonte ÚNICA compartilhada pelo atendimento assistido (Spec 07), pela
 * solicitação do associado (Spec 11) e pelo PREVIEW do editor (Spec 22) —
 * proibido duplicar (qualquer divergência preview↔portal seria bug).
 *
 * As respostas são indexadas pelo `id` do campo (Spec 22 §3) — nunca pelo
 * rótulo — para que renomear um campo não toque nos dados já gravados.
 */

export type CampoDinamico = CampoDef;

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const textareaClasses =
  "min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function comoTexto(v: RespostaValor | undefined): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function comoLista(v: RespostaValor | undefined): string[] {
  return Array.isArray(v) ? v : [];
}

export function CamposDinamicos({
  campos,
  valores,
  onChange,
}: {
  campos: CampoDinamico[];
  valores: Record<string, RespostaValor>;
  onChange: (id: string, valor: RespostaValor) => void;
}) {
  if (campos.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <p className="text-xs font-medium text-ink-muted">
        Informações adicionais
      </p>
      {campos.map((c) => {
        const id = `campo-${c.id}`;
        return (
          <div key={c.id} className="flex flex-col gap-1.5">
            {c.tipo === "booleano" ? (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={valores[c.id] === true}
                  onChange={(e) => onChange(c.id, e.target.checked)}
                />
                <span className="text-sm text-ink">
                  {c.rotulo}
                  {c.obrigatorio ? " *" : ""}
                </span>
              </label>
            ) : (
              <>
                <Label htmlFor={id}>
                  {c.rotulo}
                  {c.obrigatorio ? " *" : ""}
                </Label>
                {c.tipo === "texto_longo" ? (
                  <textarea
                    id={id}
                    rows={2}
                    value={comoTexto(valores[c.id])}
                    onChange={(e) => onChange(c.id, e.target.value)}
                    className={textareaClasses}
                  />
                ) : c.tipo === "selecao" ? (
                  <select
                    id={id}
                    className={inputClasses}
                    value={comoTexto(valores[c.id])}
                    onChange={(e) => onChange(c.id, e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {c.opcoes.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : c.tipo === "multiselecao" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {c.opcoes.map((o) => {
                      const sel = comoLista(valores[c.id]);
                      const marcado = sel.includes(o);
                      return (
                        <button
                          key={o}
                          type="button"
                          onClick={() =>
                            onChange(
                              c.id,
                              marcado
                                ? sel.filter((x) => x !== o)
                                : [...sel, o],
                            )
                          }
                          className={
                            marcado
                              ? "rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
                              : "rounded-full border px-3 py-1 text-xs text-ink-muted hover:text-ink"
                          }
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                ) : c.tipo === "data" ? (
                  <DatePicker
                    id={id}
                    value={comoTexto(valores[c.id])}
                    onChange={(v) => onChange(c.id, v)}
                  />
                ) : (
                  <Input
                    id={id}
                    type={c.tipo === "numero" ? "number" : "text"}
                    value={comoTexto(valores[c.id])}
                    onChange={(e) => onChange(c.id, e.target.value)}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

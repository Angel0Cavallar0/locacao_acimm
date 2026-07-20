"use client";

import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Renderer dos campos dinâmicos do formulário (`campos_formulario`).
 * Fonte única compartilhada pelo atendimento assistido (Spec 07) e pela
 * solicitação do associado (Spec 11) — proibido duplicar. As respostas são
 * indexadas pelo RÓTULO do campo (o que segue para `respostas_formulario`).
 */

export interface CampoDinamico {
  id: string;
  rotulo: string;
  tipo: string;
  opcoes: string[];
  obrigatorio: boolean;
}

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const textareaClasses =
  "min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CamposDinamicos({
  campos,
  valores,
  onChange,
}: {
  campos: CampoDinamico[];
  valores: Record<string, string>;
  onChange: (rotulo: string, valor: string) => void;
}) {
  if (campos.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <p className="text-xs font-medium text-ink-muted">
        Informações adicionais
      </p>
      {campos.map((c) => (
        <div key={c.id} className="flex flex-col gap-1.5">
          <Label htmlFor={`campo-${c.id}`}>
            {c.rotulo}
            {c.obrigatorio ? " *" : ""}
          </Label>
          {c.tipo === "texto_longo" ? (
            <textarea
              id={`campo-${c.id}`}
              rows={2}
              value={valores[c.rotulo] ?? ""}
              onChange={(e) => onChange(c.rotulo, e.target.value)}
              className={textareaClasses}
            />
          ) : c.tipo === "selecao" ? (
            <select
              id={`campo-${c.id}`}
              className={inputClasses}
              value={valores[c.rotulo] ?? ""}
              onChange={(e) => onChange(c.rotulo, e.target.value)}
            >
              <option value="">Selecione…</option>
              {c.opcoes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : c.tipo === "data" ? (
            <DatePicker
              id={`campo-${c.id}`}
              value={valores[c.rotulo] ?? ""}
              onChange={(v) => onChange(c.rotulo, v)}
            />
          ) : (
            <Input
              id={`campo-${c.id}`}
              type={c.tipo === "numero" ? "number" : "text"}
              value={valores[c.rotulo] ?? ""}
              onChange={(e) => onChange(c.rotulo, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

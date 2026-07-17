"use client"

import { ptBR } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { useState } from "react"

import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/** value/onChange em 'YYYY-MM-DD' (data de parede, sem fuso). */

function paraData(iso?: string): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d) // meia-noite local — seguro para exibir
}

function paraISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dia}`
}

function formatarBR(iso?: string): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Selecionar data",
  id,
  disabled,
  diasOcupados,
  aoMudarMes,
  className,
}: {
  value?: string
  onChange: (valor: string) => void
  placeholder?: string
  id?: string
  disabled?: boolean
  /** Datas 'YYYY-MM-DD' a marcar como ocupadas no calendário. */
  diasOcupados?: Set<string>
  aoMudarMes?: (ano: number, mes: number) => void
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const selecionada = paraData(value)

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-ink-muted" />
        <span className={value ? "text-ink" : "text-ink-muted"}>
          {value ? formatarBR(value) : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selecionada}
          defaultMonth={selecionada}
          onSelect={(d) => {
            if (d) {
              onChange(paraISO(d))
              setAberto(false)
            }
          }}
          onMonthChange={(m) => aoMudarMes?.(m.getFullYear(), m.getMonth() + 1)}
          modifiers={
            diasOcupados
              ? { ocupado: (day: Date) => diasOcupados.has(paraISO(day)) }
              : undefined
          }
          modifiersClassNames={{
            ocupado:
              "relative after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-amber-500",
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

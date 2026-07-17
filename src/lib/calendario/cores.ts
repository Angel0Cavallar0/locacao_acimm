/**
 * Cor determinística por sala (Spec 05 §2). Sem lane por sala (plugin premium),
 * a diferenciação é por cor derivada do id — estável entre renders e sessões,
 * usada tanto nos eventos quanto na legenda.
 */

export interface CorSala {
  fundo: string;
  texto: string;
  borda: string;
}

/** Hash estável (djb2-ish) do id → hue 0..359. */
function hueDoId(salaId: string): number {
  let h = 0;
  for (let i = 0; i < salaId.length; i++) {
    h = (h * 31 + salaId.charCodeAt(i)) >>> 0;
  }
  // Passo áureo para espalhar hues de ids parecidos (uuids sequenciais).
  return Math.round(((h % 360) * 137.508) % 360);
}

export function corDaSala(salaId: string): CorSala {
  const hue = hueDoId(salaId);
  return {
    fundo: `hsl(${hue} 60% 45%)`,
    texto: "#ffffff",
    borda: `hsl(${hue} 60% 34%)`,
  };
}

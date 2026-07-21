/**
 * Interpolador puro dos templates de mensagem (Spec 25 §C). Sem I/O — usado no
 * envio (processar) e no preview do editor (client-safe). Substitui variáveis
 * `{{chave}}` (com fallback opcional `{{chave|texto padrão}}`) e resolve blocos
 * condicionais `{{#chave}}...{{/chave}}` (renderizados só quando a chave tem
 * valor não-vazio — reproduz o "link só quando existe" dos templates originais).
 */

export type PayloadRender = Record<string, unknown>;

/** Valor textual seguro de uma chave do payload (string/number → string). */
export function valorTexto(payload: PayloadRender, chave: string): string {
  const v = payload[chave];
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** Renderiza `fonte` interpolando o `payload`. Nunca lança. */
export function renderizarTexto(fonte: string, payload: PayloadRender): string {
  if (!fonte) return "";

  // 1) Blocos condicionais {{#chave}}...{{/chave}} (não aninhados).
  const comBlocos = fonte.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_todo, chave: string, interno: string) =>
      valorTexto(payload, chave).trim().length > 0 ? interno : "",
  );

  // 2) Variáveis {{chave}} e {{chave|fallback}}.
  return comBlocos.replace(
    /\{\{(\w+)(?:\|([^}]*))?\}\}/g,
    (_todo, chave: string, fallback: string | undefined) => {
      const v = valorTexto(payload, chave);
      return v.length > 0 ? v : (fallback ?? "");
    },
  );
}

/** Máscaras visuais no padrão brasileiro (aplicadas enquanto o usuário digita). */

function so(v: string): string {
  return v.replace(/\D/g, "");
}

function mascararCPF(d: string): string {
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function mascararCNPJ(d: string): string {
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** CPF (≤11 dígitos) ou CNPJ (12–14) com separadores, progressivo. */
export function mascararDocumento(valor: string): string {
  const d = so(valor).slice(0, 14);
  return d.length <= 11 ? mascararCPF(d) : mascararCNPJ(d);
}

/** Telefone BR: (00) 0000-0000 (fixo) ou (00) 00000-0000 (celular), progressivo. */
export function mascararTelefone(valor: string): string {
  const d = so(valor).slice(0, 11);
  if (d.length === 0) return "";
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (d.length <= 2) return `(${ddd}`;
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = d.length > 10 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

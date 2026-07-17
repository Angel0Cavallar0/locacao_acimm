/** Validação de CPF/CNPJ por dígitos verificadores (Spec 07 §3.1). */

export function apenasDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

export function validarCPF(cpf: string): boolean {
  const d = apenasDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(d[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(d[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(d[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(d[10]);
}

export function validarCNPJ(cnpj: string): boolean {
  const d = apenasDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;

  const digito = (len: number): number => {
    let soma = 0;
    let peso = len - 7;
    for (let i = len; i >= 1; i--) {
      soma += Number(d[len - i]) * peso;
      peso = peso - 1 < 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };

  if (digito(12) !== Number(d[12])) return false;
  return digito(13) === Number(d[13]);
}

/** CPF (11) ou CNPJ (14) válido. */
export function documentoValido(doc: string): boolean {
  const d = apenasDigitos(doc);
  if (d.length === 11) return validarCPF(d);
  if (d.length === 14) return validarCNPJ(d);
  return false;
}

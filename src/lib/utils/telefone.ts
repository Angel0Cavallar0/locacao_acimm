/**
 * Normalização de telefone BR para o WhatsApp (Spec 15 §3). PURA/testável.
 *
 * Aceita o que estiver cadastrado (com/sem máscara, com/sem 55) e devolve o
 * número no formato que a Evolution API espera: `55` + DDD (2) + `9` + 8 dígitos.
 * Número que não seja um celular BR válido → erro claro (falha imediata, sem
 * gastar retries).
 */

export type TelefoneNormalizado =
  | { numero: string }
  | { erro: string };

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
  21, 22, 24, 27, 28, // RJ/ES
  31, 32, 33, 34, 35, 37, 38, // MG
  41, 42, 43, 44, 45, 46, 47, 48, 49, // PR/SC
  51, 53, 54, 55, // RS
  61, 62, 63, 64, 65, 66, 67, 68, 69, // Centro-Oeste/Norte
  71, 73, 74, 75, 77, 79, // BA/SE
  81, 82, 83, 84, 85, 86, 87, 88, 89, // Nordeste
  91, 92, 93, 94, 95, 96, 97, 98, 99, // Norte
]);

function soDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Normaliza para `55DDD9XXXXXXXX` (13 dígitos). Rejeita fixo e DDD inválido.
 * Aceita entrada com ou sem o `55` e com ou sem o `9` (adiciona quando faltar).
 */
export function normalizarTelefoneBR(bruto: string): TelefoneNormalizado {
  let d = soDigitos(bruto);
  if (d.length === 0) return { erro: "Telefone não informado." };

  // Remove o prefixo internacional 55 quando presente (para tratar DDD + número).
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);

  // Agora d deve ser DDD (2) + número (8 fixo ou 9 celular).
  if (d.length !== 10 && d.length !== 11) {
    return { erro: "Telefone inválido." };
  }

  const ddd = Number(d.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return { erro: "DDD inválido." };

  let numero = d.slice(2);
  // Sem o 9 (8 dígitos): assume celular e adiciona o 9. Com 9 dígitos: exige o 9.
  if (numero.length === 8) {
    numero = `9${numero}`;
  }
  if (numero.length !== 9 || numero[0] !== "9") {
    return { erro: "Telefone inválido (informe um celular com DDD)." };
  }

  return { numero: `55${d.slice(0, 2)}${numero}` };
}

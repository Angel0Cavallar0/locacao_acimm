import "server-only";
import { getEnvGoogle } from "@/lib/env";
import { cifrarCom, decifrarCom } from "./crypto-core";

/**
 * Wrapper server-only da cifra AES-256-GCM (Spec 18 §5): injeta a
 * `TOKEN_ENCRYPTION_KEY` do ambiente. O núcleo puro/testável fica em
 * `crypto-core.ts`. Sem a env, `getEnvGoogle()` lança — coerente com a feature
 * atrás de flag (a seção de integrações mostra "aguardando configuração").
 */

export function cifrar(texto: string): string {
  return cifrarCom(getEnvGoogle().tokenEncryptionKey, texto);
}

export function decifrar(blob: string): string {
  return decifrarCom(getEnvGoogle().tokenEncryptionKey, blob);
}

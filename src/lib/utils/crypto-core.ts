import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Cifra simétrica AES-256-GCM (Spec 18 §5). Usada para guardar o refresh token
 * do Google no banco de forma ilegível sem a chave (`TOKEN_ENCRYPTION_KEY`).
 *
 * Núcleo PURO (sem env/server-only) para ser testável no `node --test`. O
 * wrapper que injeta a chave do ambiente fica em `crypto.ts` (server-only).
 *
 * Formato do blob: `iv.tag.ciphertext`, três campos base64url. IV de 12 bytes
 * (recomendado para GCM), tag de autenticação de 16 bytes — IV novo por chamada,
 * então cifrar o mesmo texto duas vezes produz blobs diferentes.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

/** Deriva uma chave de 32 bytes a partir de qualquer string (sha256). */
function derivarChave(keyMaterial: string): Buffer {
  return createHash("sha256").update(keyMaterial, "utf8").digest();
}

export function cifrarCom(keyMaterial: string, texto: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, derivarChave(keyMaterial), iv);
  const ct = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

/** Decifra; lança se a chave estiver errada ou o blob tiver sido adulterado. */
export function decifrarCom(keyMaterial: string, blob: string): string {
  const partes = blob.split(".");
  if (partes.length !== 3) {
    throw new Error("Blob cifrado inválido.");
  }
  const [ivB64, tagB64, ctB64] = partes;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");

  const decipher = createDecipheriv(ALGO, derivarChave(keyMaterial), iv);
  decipher.setAuthTag(tag);
  // `final()` lança quando a tag GCM não confere (chave errada ou adulteração).
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}

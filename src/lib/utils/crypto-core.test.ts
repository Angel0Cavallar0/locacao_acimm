import assert from "node:assert/strict";
import { test } from "node:test";
import { cifrarCom, decifrarCom } from "./crypto-core.ts";

const CHAVE = "chave-de-teste-super-secreta-0123456789";
const SEGREDO = "1//0abcRefreshTokenDoGoogle_exemplo-xyz";

test("ida e volta recupera o texto original", () => {
  const blob = cifrarCom(CHAVE, SEGREDO);
  assert.equal(decifrarCom(CHAVE, blob), SEGREDO);
});

test("blob não contém o texto em claro", () => {
  const blob = cifrarCom(CHAVE, SEGREDO);
  assert.ok(!blob.includes(SEGREDO));
});

test("IV novo por chamada → blobs diferentes para o mesmo texto", () => {
  const a = cifrarCom(CHAVE, SEGREDO);
  const b = cifrarCom(CHAVE, SEGREDO);
  assert.notEqual(a, b);
  // ...mas ambos decifram para o mesmo valor.
  assert.equal(decifrarCom(CHAVE, a), decifrarCom(CHAVE, b));
});

test("chave errada não decifra (lança)", () => {
  const blob = cifrarCom(CHAVE, SEGREDO);
  assert.throws(() => decifrarCom("chave-errada", blob));
});

test("ciphertext adulterado é rejeitado pela tag GCM", () => {
  const blob = cifrarCom(CHAVE, SEGREDO);
  const [iv, tag, ct] = blob.split(".");
  // Vira um byte do ciphertext.
  const buf = Buffer.from(ct, "base64url");
  buf[0] = buf[0] ^ 0xff;
  const adulterado = [iv, tag, buf.toString("base64url")].join(".");
  assert.throws(() => decifrarCom(CHAVE, adulterado));
});

test("blob malformado lança erro claro", () => {
  assert.throws(() => decifrarCom(CHAVE, "sem-pontos"));
  assert.throws(() => decifrarCom(CHAVE, "a.b"));
});

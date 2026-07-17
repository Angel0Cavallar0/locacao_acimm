import assert from "node:assert/strict";
import { test } from "node:test";
import { corDaSala } from "./cores.ts";

test("corDaSala é determinística para o mesmo id", () => {
  const a = corDaSala("11111111-1111-1111-1111-111111111111");
  const b = corDaSala("11111111-1111-1111-1111-111111111111");
  assert.deepEqual(a, b);
});

test("corDaSala produz hsl válido e texto legível", () => {
  const c = corDaSala("qualquer-id");
  assert.match(c.fundo, /^hsl\(\d{1,3} 60% 45%\)$/);
  assert.match(c.borda, /^hsl\(\d{1,3} 60% 34%\)$/);
  assert.equal(c.texto, "#ffffff");
});

test("ids diferentes tendem a hues diferentes", () => {
  const hue = (s: string) => corDaSala(s).fundo;
  assert.notEqual(hue("sala-a"), hue("sala-b"));
});

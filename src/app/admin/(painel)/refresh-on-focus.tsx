"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Dashboard operacional (Spec 23 §6): revalida ao voltar o foco à janela, para
 * refletir a baixa/aprovação que acabou de acontecer em outra aba/tela.
 */
export function RefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    const aoFocar = () => router.refresh();
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [router]);
  return null;
}

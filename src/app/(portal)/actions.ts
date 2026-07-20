"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Encerra a sessão do associado e volta ao login do portal. */
export async function signOutAssociado() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

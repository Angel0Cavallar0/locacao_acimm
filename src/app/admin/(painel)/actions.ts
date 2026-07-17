"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Logout global — revoga o refresh token e volta ao login (Spec 03 §6). */
export async function signOutColaborador() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

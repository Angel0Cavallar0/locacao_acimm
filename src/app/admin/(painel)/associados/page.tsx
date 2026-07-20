import type { Metadata } from "next";
import { requireColaborador } from "@/lib/auth/guards";
import { AssociadosClient } from "./associados-client";

export const metadata: Metadata = { title: "Associados" };

export default async function AssociadosPage() {
  await requireColaborador();
  return <AssociadosClient />;
}

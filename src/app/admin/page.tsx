import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminWorkspace from "./workspace";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return <AdminWorkspace />;
}
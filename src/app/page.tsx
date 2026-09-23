import Dashboard from "@/components/Dashboard";
import { loadComplaints } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initial = await loadComplaints();
  return <Dashboard initial={initial} />;
}

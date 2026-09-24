import { loadComplaints } from "@/lib/queries";
import { CivicProvider } from "@/components/CivicProvider";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initial = await loadComplaints();
  return (
    <CivicProvider initial={initial}>
      <AppShell>{children}</AppShell>
    </CivicProvider>
  );
}

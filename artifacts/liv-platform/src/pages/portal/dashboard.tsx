import { Link } from 'wouter';
import { useGetDashboard } from '@workspace/api-client-react';
import { Download, Upload } from 'lucide-react';
import { Shell } from '@/lib/auth';
import { Card, Empty, ErrorBox, fmtDate, fmtDateTime, J, linkBtn, PageHead, Skel, SkelRows, StatusBadge, Td, Th, useSeo } from '@/lib/ui';

export default function Dashboard() {
  useSeo('Dashboard');
  const q = useGetDashboard();
  const d = q.data as J;
  const t = d?.totals || {};
  const tiles: [string, string, string][] = [['Issued', 'issued', 'text-primary'], ['Active', 'active', 'text-valid'], ['Revoked', 'revoked', 'text-invalid'], ['Expiring soon', 'expiring', 'text-expired']];
  return (
    <Shell area="portal" roles={['platform_admin', 'super_admin']}>
      <PageHead title="Dashboard" sub={d?.platform?.company_name} action={<Link href="/portal/issue" className={linkBtn()} data-testid="link-issue"><Upload className="size-4" />Issue certificates</Link>} />
      {q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {tiles.map(([l, k, c]) => (
              <Card key={k} className="p-5">{q.isLoading ? <Skel className="h-12" /> : <><p className={`font-display text-4xl ${c}`} data-testid={`total-${k}`}>{Number(t[k] ?? 0).toLocaleString('en-US')}</p><p className="text-sm text-muted-foreground mt-1">{l}</p></>}</Card>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <div className="p-4 border-b border-border flex justify-between"><h2 className="font-display text-lg text-primary">Recent certificates</h2><Link href="/portal/records" className="text-sm underline">All records</Link></div>
              {q.isLoading ? <SkelRows n={4} /> : (d?.recent_certificates || []).length === 0 ? <Empty title="No certificates yet" text="Issue your first batch from a CSV file." action={<Link href="/portal/issue" className={linkBtn('primary', 'sm')}>Start issuing</Link>} /> : (
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Holder</Th><Th>Course</Th><Th>Status</Th></tr></thead><tbody className="divide-y divide-border">
                  {(d.recent_certificates as J[]).map((c) => <tr key={c.cert_number}><Td>{c.first_name} {c.last_name}<span className="block font-mono text-xs text-muted-foreground">{c.cert_number}</span></Td><Td>{c.course_name}</Td><Td><StatusBadge status={c.status} /></Td></tr>)}
                </tbody></table></div>
              )}
            </Card>
            <Card>
              <div className="p-4 border-b border-border"><h2 className="font-display text-lg text-primary">Recent batches</h2></div>
              {q.isLoading ? <SkelRows n={4} /> : (d?.batches || []).length === 0 ? <Empty title="No batches" text="Batches appear here after you issue from CSV." /> : (
                <ul className="divide-y divide-border">{(d.batches as J[]).map((b) => (
                  <li key={b.id} className="p-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div><p className="font-medium">{b.file_name || `Batch ${b.id}`}</p><p className="text-xs text-muted-foreground">{fmtDateTime(b.created_at)} - {b.issued} issued, {b.skipped} skipped</p></div>
                    <div className="flex gap-3"><a className="inline-flex gap-1 items-center underline" href={`/api/portal/batches/${b.id}/results.csv`}><Download className="size-3" />CSV</a><a className="inline-flex gap-1 items-center underline" href={`/api/portal/batches/${b.id}/pdfs.zip`}><Download className="size-3" />ZIP</a></div>
                  </li>))}</ul>
              )}
            </Card>
          </div>
          {d?.platform && <p className="text-xs text-muted-foreground">Accreditation status: <StatusBadge status={d.platform.accreditation_status} /> since {fmtDate(d.platform.created_at)}</p>}
        </div>
      )}
    </Shell>
  );
}

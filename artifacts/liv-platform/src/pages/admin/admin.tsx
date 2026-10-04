import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListPlatformsQueryKey, useChangePlatformStatus, useGetVerificationAnalytics, useListAuditLogs, useListContactMessages, useListPlatforms } from '@workspace/api-client-react';
import { Shell } from '@/lib/auth';
import { RecordsView } from '../portal/records';
import { Btn, Card, Empty, errMsg, ErrorBox, fmtDate, fmtDateTime, J, Modal, PageHead, Pager, SkelRows, StatusBadge, Td, Th, useSeo } from '@/lib/ui';
import { useToast } from '@/hooks/use-toast';

const A = ({ children }: { children: React.ReactNode }) => <Shell area="admin" roles={['super_admin']}>{children}</Shell>;

export function Platforms() {
  useSeo('Platforms');
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useListPlatforms();
  const m = useChangePlatformStatus();
  const [target, setTarget] = useState<J>(null);
  const list = (q.data as J[]) || [];
  const next = target && (target.accreditation_status === 'active' ? 'suspended' : 'active');
  return (
    <A>
      <PageHead title="Platforms" sub="Review applications and manage provider accreditation." />
      <Card>
        {q.isLoading ? <SkelRows /> : q.isError ? <div className="p-4"><ErrorBox error={q.error} retry={() => q.refetch()} /></div> : list.length === 0 ? <Empty title="No platforms yet" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Company</Th><Th>Contact</Th><Th>Applied</Th><Th>Certificates</Th><Th>Status</Th><Th /></tr></thead><tbody className="divide-y divide-border">
            {list.map((p) => <tr key={p.id} data-testid={`row-platform-${p.id}`}><Td><span className="font-medium">{p.company_name}</span><span className="block text-xs text-muted-foreground">{p.website}</span></Td><Td>{p.email}<span className="block text-xs text-muted-foreground">{p.phone}</span></Td><Td>{fmtDate(p.created_at)}</Td><Td>{p.certificate_count}</Td><Td><StatusBadge status={p.accreditation_status} /></Td>
              <Td><Btn size="sm" variant={p.accreditation_status === 'active' ? 'outline' : 'primary'} onClick={() => setTarget(p)} data-testid={`button-status-${p.id}`}>{p.accreditation_status === 'active' ? 'Suspend' : p.accreditation_status === 'suspended' ? 'Reactivate' : 'Approve'}</Btn></Td></tr>)}
          </tbody></table></div>
        )}
      </Card>
      <Modal open={!!target} onClose={() => setTarget(null)} title={next === 'active' ? 'Approve platform' : 'Suspend platform'}>
        <p className="text-sm">{next === 'active' ? 'Approve' : 'Suspend'} <strong>{target?.company_name}</strong>? {next === 'suspended' && 'The provider will be unable to issue certificates.'}</p>
        {m.isError && <p className="text-sm text-invalid mt-2">{errMsg(m.error)}</p>}
        <div className="mt-4 flex gap-2"><Btn variant={next === 'active' ? 'primary' : 'danger'} disabled={m.isPending} data-testid="button-confirm-status" onClick={() => m.mutate({ id: target.id, data: { status: next } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListPlatformsQueryKey() }); qc.invalidateQueries({ queryKey: ['/api/public/stats'] }); toast({ title: `Platform ${next === 'active' ? 'approved' : 'suspended'}` }); setTarget(null); } })}>Confirm</Btn><Btn variant="ghost" onClick={() => setTarget(null)}>Cancel</Btn></div>
      </Modal>
    </A>
  );
}

export function AdminCertificates() {
  useSeo('All certificates');
  return <A><PageHead title="Certificates" sub="Every certificate across all providers." /><RecordsView admin /></A>;
}

export function Audit() {
  useSeo('Audit log');
  const [page, setPage] = useState(1);
  const q = useListAuditLogs({ page });
  const d = q.data as J;
  const items: J[] = d?.items || [];
  return (
    <A>
      <PageHead title="Audit log" sub="Administrative and issuance actions, newest first." />
      <Card>
        {q.isLoading ? <SkelRows /> : q.isError ? <div className="p-4"><ErrorBox error={q.error} retry={() => q.refetch()} /></div> : items.length === 0 ? <Empty title="No audit entries" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Metadata</Th></tr></thead><tbody className="divide-y divide-border">
            {items.map((a) => <tr key={a.id}><Td className="whitespace-nowrap">{fmtDateTime(a.created_at)}</Td><Td>{a.actor_email || 'system'}</Td><Td className="font-mono text-xs">{a.action}</Td><Td>{a.target}</Td><Td className="font-mono text-xs max-w-xs truncate" ><span title={JSON.stringify(a.metadata)}>{a.metadata ? JSON.stringify(a.metadata) : ''}</span></Td></tr>)}
          </tbody></table></div>
        )}
        {d && <Pager page={d.page || page} total={d.total || 0} size={25} onPage={setPage} />}
      </Card>
    </A>
  );
}

export function Messages() {
  useSeo('Messages');
  const q = useListContactMessages();
  const list = (q.data as J[]) || [];
  return (
    <A>
      <PageHead title="Contact messages" />
      {q.isLoading ? <SkelRows /> : q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : list.length === 0 ? <Card><Empty title="No messages" text="Messages from the contact form appear here." /></Card> : (
        <ul className="space-y-3">{list.map((m, i) => (
          <Card key={i} className="p-5"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{m.subject || 'No subject'}</p><p className="text-xs text-muted-foreground">{fmtDateTime(m.created_at)}</p></div><p className="text-sm text-muted-foreground">{m.name} - <a className="underline" href={`mailto:${m.email}`}>{m.email}</a></p><p className="mt-3 text-sm whitespace-pre-wrap">{m.message}</p></Card>
        ))}</ul>
      )}
    </A>
  );
}

export function Analytics() {
  useSeo('Verification analytics');
  const q = useGetVerificationAnalytics();
  const d = q.data as J;
  const days: J[] = d?.days || [];
  const max = Math.max(1, ...days.map((x) => Number(x.count)));
  return (
    <A>
      <PageHead title="Verification analytics" sub="Public verification lookups per day." />
      {q.isLoading ? <SkelRows /> : q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : (<>
        <div className="grid grid-cols-2 gap-4 max-w-md mb-6"><Card className="p-5"><p className="font-display text-4xl text-primary" data-testid="analytics-total">{d?.total ?? 0}</p><p className="text-sm text-muted-foreground">Total lookups</p></Card><Card className="p-5"><p className="font-display text-4xl text-primary">{d?.today ?? 0}</p><p className="text-sm text-muted-foreground">Today</p></Card></div>
        <Card>{days.length === 0 ? <Empty title="No lookups recorded" /> : (
          <table className="w-full text-sm"><caption className="sr-only">Daily verification counts</caption><thead><tr><Th>Date</Th><Th>Lookups</Th><Th /></tr></thead><tbody className="divide-y divide-border">
            {days.map((x) => <tr key={x.date}><Td className="whitespace-nowrap">{fmtDate(x.date)}</Td><Td>{x.count}</Td><Td className="w-full"><div className="h-2 rounded bg-primary" style={{ width: `${(Number(x.count) / max) * 100}%` }} aria-hidden /></Td></tr>)}
          </tbody></table>)}</Card>
      </>)}
    </A>
  );
}

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetCertificateQueryKey, getGetDashboardQueryKey, useGetCertificate, useListCertificates, useRevokeCertificate } from '@workspace/api-client-react';
import { Download, ExternalLink, Search } from 'lucide-react';
import { Shell } from '@/lib/auth';
import { Btn, Card, Empty, errMsg, ErrorBox, Field, fmtDate, J, Modal, PageHead, Pager, Select, SkelRows, StatusBadge, Td, TextArea, TextInput, Th, useSeo } from '@/lib/ui';
import { useToast } from '@/hooks/use-toast';

export function RecordsView({ admin }: { admin?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const params = { page, ...(term ? { search: term } : {}), ...(status ? { status } : {}), ...(platformId && Number(platformId) ? { platform_id: Number(platformId) } : {}) };
  const q = useListCertificates(params);
  const d = q.data as J;
  const items: J[] = d?.items || [];
  const detail = useGetCertificate(sel || '', { query: { enabled: !!sel, queryKey: getGetCertificateQueryKey(sel || '') } });
  const c = detail.data as J;
  const revoke = useRevokeCertificate();
  const close = () => { setSel(null); setRevoking(false); setReason(''); setConfirm(false); revoke.reset(); };
  const doRevoke = () => revoke.mutate({ certNumber: sel!, data: { reason: reason.trim() } }, {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/portal/certificates'] });
      qc.invalidateQueries({ queryKey: getGetCertificateQueryKey(sel!) });
      qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      toast({ title: 'Certificate revoked' }); close();
    },
  });
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); setTerm(search.trim()); setPage(1); }} className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-56"><Search className="size-4 absolute left-3 top-3 text-muted-foreground" /><TextInput className="pl-9" placeholder="Search name, email or number" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search" /></div>
        {admin && <TextInput className="w-32" type="number" placeholder="Platform ID" value={platformId} onChange={(e) => { setPlatformId(e.target.value); setPage(1); }} />}
        <Select className="w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} data-testid="select-status"><option value="">All statuses</option><option value="VALID">Valid</option><option value="EXPIRED">Expired</option><option value="REVOKED">Revoked</option></Select>
        <Btn type="submit" variant="outline">Search</Btn>
      </form>
      <Card>
        {q.isLoading ? <SkelRows /> : q.isError ? <div className="p-4"><ErrorBox error={q.error} retry={() => q.refetch()} /></div> : items.length === 0 ? <Empty title="No certificates found" text={term || status ? 'Try clearing filters.' : 'Issued certificates will appear here.'} /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Number</Th><Th>Holder</Th><Th>Course</Th>{admin && <Th>Provider</Th>}<Th>Issued</Th><Th>Expires</Th><Th>Status</Th></tr></thead>
            <tbody className="divide-y divide-border">{items.map((r) => (
              <tr key={r.cert_number} onClick={() => setSel(r.cert_number)} className="cursor-pointer hover:bg-muted/50" data-testid={`row-cert-${r.cert_number}`}>
                <Td className="font-mono text-xs"><button className="underline" onClick={() => setSel(r.cert_number)}>{r.cert_number}</button></Td><Td>{r.first_name} {r.last_name}</Td><Td>{r.course_name}</Td>{admin && <Td>{r.company_name}</Td>}<Td>{fmtDate(r.issue_date)}</Td><Td>{r.expiry_date ? fmtDate(r.expiry_date) : '—'}</Td><Td><StatusBadge status={r.status} /></Td>
              </tr>))}</tbody></table></div>
        )}
        {d && <Pager page={d.page || page} total={d.total || 0} size={d.page_size || 10} onPage={setPage} />}
      </Card>
      <Modal open={!!sel} onClose={close} title={revoking ? 'Revoke certificate' : 'Certificate details'} wide>
        {detail.isLoading ? <SkelRows n={4} /> : detail.isError ? <ErrorBox error={detail.error} retry={() => detail.refetch()} /> : c && (revoking ? (
          <div className="space-y-4">
            <p className="text-sm">You are about to revoke <span className="font-mono">{c.cert_number}</span> issued to {c.first_name} {c.last_name}. Public verification will show it as invalid.</p>
            <Field label="Reason (required, min 3 characters)"><TextArea value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-reason" /></Field>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="check-confirm" />I understand this action is recorded in the audit log.</label>
            {revoke.isError && <p className="text-sm text-invalid" role="alert">{errMsg(revoke.error)}</p>}
            <div className="flex gap-2"><Btn variant="danger" disabled={reason.trim().length < 3 || !confirm || revoke.isPending} onClick={doRevoke} data-testid="button-confirm-revoke">{revoke.isPending ? 'Revoking...' : 'Revoke certificate'}</Btn><Btn variant="ghost" onClick={() => setRevoking(false)}>Back</Btn></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><p className="font-display text-xl text-primary">{c.course_name}</p><StatusBadge status={c.status} /></div>
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              {[['Number', c.cert_number], ['Holder', `${c.first_name} ${c.last_name}`], ['Email', c.email], ['Grade', c.grade || '—'], ['Completed', fmtDate(c.completion_date)], ['Issued', fmtDate(c.issue_date)], ['Expires', c.expiry_date ? fmtDate(c.expiry_date) : 'No expiry'], ['Provider', c.company_name]].map(([k, v]) => <div key={k}><dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
            </dl>
            {c.status === 'REVOKED' && <p className="text-sm text-invalid">Revoked {fmtDate(c.revoked_at)}: {c.revocation_reason}</p>}
            <div className="flex flex-wrap gap-2">
              <a className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm" href={`/api/certificates/${c.cert_number}/pdf`}><Download className="size-4" />PDF</a>
              {c.verify_url && <a className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-input text-sm" href={c.verify_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Public page</a>}
              {c.status !== 'REVOKED' && <Btn variant="danger" onClick={() => setRevoking(true)} data-testid="button-revoke">Revoke</Btn>}
            </div>
          </div>
        ))}
      </Modal>
    </>
  );
}

export default function Records() {
  useSeo('Records');
  return (
    <Shell area="portal" roles={['platform_admin', 'super_admin']}>
      <PageHead title="Certificate records" sub="Search, inspect and revoke certificates issued by your organization." />
      <RecordsView />
    </Shell>
  );
}

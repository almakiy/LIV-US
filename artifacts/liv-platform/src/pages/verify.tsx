import { useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { getVerifyCertificateQueryKey, useVerifyCertificate } from '@workspace/api-client-react';
import { AlertTriangle, CheckCircle2, Clock, Copy, Download, Linkedin, Search, ShieldAlert, XCircle } from 'lucide-react';
import { PublicLayout } from '@/lib/auth';
import { Btn, Card, cx, ErrorBox, fmtDate, J, linkBtn, logoSrc, Skel, TextInput, useSeo } from '@/lib/ui';
import { useToast } from '@/hooks/use-toast';

export function VerifyLookup() {
  useSeo('Verify a certificate', 'Look up a certificate by its certificate number.');
  const [id, setId] = useState('');
  const [, nav] = useLocation();
  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="font-display text-4xl font-semibold text-primary">Verify a certificate</h1>
        <p className="mt-3 text-muted-foreground">Enter the certificate number exactly as printed. For privacy, certificates cannot be searched by a person's name.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (id.trim()) nav(`/verify/${encodeURIComponent(id.trim())}`); }} className="mt-8 flex flex-col sm:flex-row gap-3">
          <TextInput value={id} onChange={(e) => setId(e.target.value)} placeholder="Certificate number" className="font-mono h-12" aria-label="Certificate number" data-testid="input-cert-number" />
          <Btn type="submit" size="lg" data-testid="button-verify"><Search className="size-4" />Verify</Btn>
        </form>
        <Card className="mt-10 p-5 text-sm text-muted-foreground">Scanning the QR code on a certificate opens the official verification page directly and confirms the document has not been altered.</Card>
      </div>
    </PublicLayout>
  );
}

const look: Record<string, { icon: any; cls: string; title: string; text: string }> = {
  VALID: { icon: CheckCircle2, cls: 'bg-valid text-white', title: 'VALID', text: 'This certificate is authentic and currently valid.' },
  EXPIRED: { icon: Clock, cls: 'bg-expired text-white', title: 'EXPIRED', text: 'This certificate is authentic but its validity period has ended.' },
  REVOKED: { icon: XCircle, cls: 'bg-invalid text-white', title: 'INVALID - REVOKED', text: 'This certificate has been revoked by the issuer and is no longer valid.' },
  NOT_FOUND: { icon: AlertTriangle, cls: 'bg-invalid text-white', title: 'INVALID - NOT FOUND', text: 'No certificate matches this number. Check for typing errors.' },
  TAMPERED: { icon: ShieldAlert, cls: 'bg-invalid text-white', title: 'INVALID - TAMPERED', text: 'The verification link does not match this certificate. Do not rely on this document.' },
};

export function VerifyPortal() {
  const { certNumber = '' } = useParams<{ certNumber: string }>();
  const cert = decodeURIComponent(certNumber);
  useSeo(`Certificate ${cert}`, 'Official certificate verification result.');
  const t = new URLSearchParams(window.location.search).get('t') || undefined;
  const [last, setLast] = useState('');
  const [lastSent, setLastSent] = useState('');
  const { toast } = useToast();
  const params = { ...(t ? { t } : {}), ...(lastSent ? { last_name: lastSent } : {}) };
  const q = useVerifyCertificate(cert, params, { query: { queryKey: getVerifyCertificateQueryKey(cert, params), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 30_000 } });
  const d = q.data as J;
  const c = d?.certificate as J;
  const L = look[d?.status] || look.NOT_FOUND;
  const pdf = c?.pdf_url || `/api/certificates/${encodeURIComponent(cert)}/pdf${t ? `?t=${encodeURIComponent(t)}` : ''}`;
  const url = c?.verify_url || window.location.href;
  const exp = c?.expiry_date ? new Date(c.expiry_date) : null;
  const li = c ? `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(c.course_name)}&organizationName=${encodeURIComponent(c.company_name || 'LIV LLC')}&issueYear=${String(c.issue_date).slice(0, 4)}&issueMonth=${Number(String(c.issue_date).slice(5, 7))}${exp ? `&expirationYear=${exp.getFullYear()}&expirationMonth=${exp.getMonth() + 1}` : ''}&certUrl=${encodeURIComponent(url)}&certId=${encodeURIComponent(c.cert_number)}` : '';
  const rows: [string, string][] = c ? [['Holder', `${c.first_name} ${c.last_name}`], ['Course', c.course_name], ['Grade', c.grade || '—'], ['Completed', fmtDate(c.completion_date)], ['Issued', fmtDate(c.issue_date)], ['Expires', c.expiry_date ? fmtDate(c.expiry_date) : 'No expiry'], ['Issued by', c.company_name], ['Certificate number', c.cert_number]] : [];
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Official verification portal</p>
        {q.isLoading && <div className="space-y-3"><Skel className="h-28" /><Skel className="h-64" /></div>}
        {q.isError && <ErrorBox error={q.error} retry={() => q.refetch()} />}
        {d && (
          <div className="liv-rise" data-testid="result-verify">
            <div className={cx('rounded-t-lg p-6 flex items-center gap-4', L.cls)} role="status">
              <L.icon className="size-10 shrink-0" />
              <div><p className="font-display text-3xl font-semibold" data-testid="status-verify">{L.title}</p><p className="text-white/85 text-sm">{L.text}</p></div>
            </div>
            <Card className="rounded-t-none border-t-0">
              {c ? (
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-6">
                    {c.logo_url && <img src={logoSrc(c.logo_url)} alt={`${c.company_name} logo`} className="h-12 w-auto max-w-32 object-contain" />}
                    <div><p className="font-display text-2xl text-primary">{c.course_name}</p><p className="text-sm text-muted-foreground">{c.company_name}{c.accreditation_status ? ` - provider ${c.accreditation_status}` : ''}</p></div>
                  </div>
                  <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
                    {rows.map(([k, v]) => <div key={k} className="border-b border-border pb-2"><dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt><dd className={cx('mt-0.5', k === 'Certificate number' && 'font-mono')}>{v}</dd></div>)}
                  </dl>
                  {c.status === 'REVOKED' && <p className="mt-4 text-sm text-invalid">Revoked {fmtDate(c.revoked_at)}{c.revocation_reason ? `: ${c.revocation_reason}` : ''}</p>}
                  <div className="mt-6 flex flex-wrap gap-2">
                    <a href={pdf} className={linkBtn('primary')} data-testid="link-pdf"><Download className="size-4" />Download PDF</a>
                    {d.status !== 'REVOKED' && <a href={li} target="_blank" rel="noreferrer" className={linkBtn('outline')} data-testid="link-linkedin"><Linkedin className="size-4" />Add to LinkedIn</a>}
                    <Btn variant="outline" data-testid="button-copy" onClick={() => navigator.clipboard.writeText(url).then(() => toast({ title: 'Verification link copied' }), () => toast({ title: 'Copy failed', variant: 'destructive' }))}><Copy className="size-4" />Copy link</Btn>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-sm text-muted-foreground">No certificate details are available for this lookup. Number checked: <span className="font-mono">{cert}</span></div>
              )}
            </Card>
            <form onSubmit={(e) => { e.preventDefault(); setLastSent(last.trim()); }} className="mt-6 flex flex-col sm:flex-row gap-2 items-end">
              <label className="flex-1 w-full text-sm space-y-1"><span className="font-medium">Optional: confirm holder's last name</span><TextInput value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" /></label>
              <Btn type="submit" variant="outline">Confirm</Btn>
            </form>
          </div>
        )}
        <p className="mt-8 text-xs text-muted-foreground">This lookup is logged. <Link href="/verify" className="underline">Verify another certificate</Link></p>
      </div>
    </PublicLayout>
  );
}

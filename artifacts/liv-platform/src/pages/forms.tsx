import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, useApplyForAccreditation, useLogin, useSendContact } from '@workspace/api-client-react';
import { CheckCircle2 } from 'lucide-react';
import { homeFor, PublicLayout } from '@/lib/auth';
import { Btn, Card, errMsg, Field, J, Logo, Skel, TextArea, TextInput, useSeo } from '@/lib/ui';

export function Contact() {
  useSeo('Contact', 'Contact LIV LLC.');
  const m = useSendContact();
  const [f, setF] = useState({ name: '', email: '', subject: '', message: '' });
  const [done, setDone] = useState(false);
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate({ data: { ...f, subject: f.subject || undefined } }, { onSuccess: () => { setDone(true); setF({ name: '', email: '', subject: '', message: '' }); } }); };
  const set = (k: string) => (e: J) => setF({ ...f, [k]: e.target.value });
  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl px-5 py-16 grid md:grid-cols-[1fr_1.2fr] gap-12">
        <div><h1 className="font-display text-4xl text-primary font-semibold">Contact us</h1><p className="mt-3 text-muted-foreground">Questions about accreditation, a certificate, or privacy? Send a message and our team will reply by email.</p></div>
        <Card className="p-6">
          {done ? (
            <div className="text-center py-8 space-y-2" data-testid="contact-success"><CheckCircle2 className="size-10 text-valid mx-auto" /><p className="font-display text-xl text-primary">Message sent</p><p className="text-sm text-muted-foreground">Thank you. We will be in touch.</p><Btn variant="outline" onClick={() => setDone(false)}>Send another</Btn></div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Name"><TextInput required value={f.name} onChange={set('name')} data-testid="input-name" /></Field>
              <Field label="Email"><TextInput required type="email" value={f.email} onChange={set('email')} data-testid="input-email" /></Field>
              <Field label="Subject (optional)"><TextInput value={f.subject} onChange={set('subject')} data-testid="input-subject" /></Field>
              <Field label="Message"><TextArea required minLength={5} value={f.message} onChange={set('message')} data-testid="input-message" /></Field>
              {m.isError && <p className="text-sm text-invalid" role="alert">{errMsg(m.error)}</p>}
              <Btn type="submit" disabled={m.isPending} data-testid="button-send">{m.isPending ? 'Sending...' : 'Send message'}</Btn>
            </form>
          )}
        </Card>
      </div>
    </PublicLayout>
  );
}

export function Apply() {
  useSeo('Apply for accreditation', 'Apply for LIV LLC training provider accreditation.');
  const qc = useQueryClient();
  const m = useApplyForAccreditation();
  const [f, setF] = useState({ company_name: '', admin_name: '', email: '', password: '', phone: '', website: '', country: 'United States' });
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string) => (e: J) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (f.password.length < 12) return setErr('Password must be at least 12 characters.');
    setErr('');
    m.mutate({ data: { ...f, phone: f.phone || undefined, website: f.website || undefined, country: f.country || undefined } }, { onSuccess: (res: J) => { qc.clear(); qc.setQueryData(getGetMeQueryKey(), res); setF({ ...f, password: '' }); setDone(true); } });
  };
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="font-display text-4xl text-primary font-semibold">Apply for accreditation</h1>
        <p className="mt-3 text-muted-foreground">Create your provider account. Applications are reviewed by LIV LLC before issuing is enabled.</p>
        <Card className="p-6 mt-8">
          {done ? (
            <div className="text-center py-8 space-y-3" data-testid="apply-success"><CheckCircle2 className="size-10 text-valid mx-auto" /><p className="font-display text-xl text-primary">Application received</p><p className="text-sm text-muted-foreground">Your account is pending review. Check your dashboard for its status.</p><Link href="/portal/dashboard" className="underline text-primary">Go to dashboard</Link></div>
          ) : (
            <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
              <Field label="Company name"><TextInput required value={f.company_name} onChange={set('company_name')} data-testid="input-company" /></Field>
              <Field label="Administrator name"><TextInput required value={f.admin_name} onChange={set('admin_name')} data-testid="input-admin" /></Field>
              <Field label="Work email"><TextInput required type="email" value={f.email} onChange={set('email')} data-testid="input-email" /></Field>
              <Field label="Password" hint="Minimum 12 characters" error={err}><TextInput required type="password" minLength={12} autoComplete="new-password" value={f.password} onChange={set('password')} data-testid="input-password" /></Field>
              <Field label="Phone"><TextInput type="tel" value={f.phone} onChange={set('phone')} /></Field>
              <Field label="Website"><TextInput type="url" placeholder="https://" value={f.website} onChange={set('website')} /></Field>
              <Field label="Country"><TextInput value={f.country} onChange={set('country')} /></Field>
              <div className="sm:col-span-2 space-y-3">
                {m.isError && <p className="text-sm text-invalid" role="alert">{errMsg(m.error)}</p>}
                <Btn type="submit" size="lg" disabled={m.isPending} data-testid="button-apply">{m.isPending ? 'Submitting...' : 'Submit application'}</Btn>
              </div>
            </form>
          )}
        </Card>
      </div>
    </PublicLayout>
  );
}

export function Login() {
  useSeo('Sign in', 'Sign in to the LIV provider portal.');
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const m = useLogin();
  const demo = useQuery({ queryKey: ['public-demo'], retry: false, refetchOnWindowFocus: false, queryFn: async () => { const r = await fetch('/api/public/demo', { credentials: 'include' }); if (!r.ok) throw new Error('unavailable'); return (await r.json()) as J; } });
  const go = (em: string, pw: string) =>
    m.mutate({ data: { email: em, password: pw } }, { onSuccess: (res: J) => { qc.clear(); qc.setQueryData(getGetMeQueryKey(), res); nav(homeFor(res?.user?.role)); } });
  const accounts: J[] = demo.data?.accounts || [];
  const sample = demo.data?.certificate || demo.data?.sample_certificate;
  return (
    <div className="min-h-[100dvh] grid md:grid-cols-[1fr_1.1fr]">
      <div className="bg-primary text-primary-foreground p-8 md:p-14 flex flex-col justify-between relative overflow-hidden">
        <div className="liv-grid absolute inset-0" aria-hidden />
        <Link href="/" className="relative"><Logo light /></Link>
        <div className="relative my-10"><h1 className="font-display text-4xl font-semibold">Provider and administrator sign in</h1><p className="mt-3 text-primary-foreground/70 max-w-sm">Manage templates, issue certificates in bulk and review your records.</p></div>
        <p className="relative text-xs text-primary-foreground/50">LIV LLC, United States</p>
      </div>
      <div className="p-6 md:p-14 flex flex-col justify-center gap-8 max-w-xl w-full">
        <form onSubmit={(e) => { e.preventDefault(); go(email, password); }} className="space-y-4">
          <h2 className="font-display text-2xl text-primary">Sign in</h2>
          <Field label="Email"><TextInput type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" /></Field>
          <Field label="Password"><TextInput type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-password" /></Field>
          {m.isError && <p className="text-sm text-invalid" role="alert">{(m.error as J)?.status === 401 ? 'Incorrect email or password.' : errMsg(m.error)}</p>}
          <Btn type="submit" className="w-full" disabled={m.isPending} data-testid="button-login">{m.isPending ? 'Signing in...' : 'Sign in'}</Btn>
          <p className="text-sm text-muted-foreground">No account? <Link href="/apply" className="underline text-primary">Apply for accreditation</Link></p>
        </form>
        {demo.isLoading && <Skel className="h-24" />}
        {accounts.length > 0 && (
          <Card className="p-4 bg-muted/50 border-dashed" >
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Demo accounts (development only)</p>
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li key={a.email} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0"><span className="block truncate font-mono text-xs">{a.email}</span><span className="text-xs text-muted-foreground">{a.role}</span></span>
                  <span className="flex gap-1 shrink-0">
                    <Btn size="sm" variant="outline" type="button" onClick={() => { setEmail(a.email); setPassword(a.password); }}>Fill</Btn>
                    <Btn size="sm" type="button" disabled={m.isPending} onClick={() => go(a.email, a.password)} data-testid={`button-demo-${a.role}`}>Sign in</Btn>
                  </span>
                </li>
              ))}
            </ul>
            {sample?.cert_number && <p className="text-xs mt-3 text-muted-foreground">Sample certificate: <Link className="underline font-mono" href={`/verify/${sample.cert_number}${sample.verify_url?.includes('?t=') ? '?t=' + sample.verify_url.split('?t=')[1] : ''}`}>{sample.cert_number}</Link></p>}
          </Card>
        )}
      </div>
    </div>
  );
}

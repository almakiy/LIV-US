import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useGetPublicStats } from '@workspace/api-client-react';
import { ArrowRight, FileCheck2, Lock, Search, ShieldCheck, Upload, BadgeCheck } from 'lucide-react';
import { PublicLayout } from '@/lib/auth';
import { Btn, J, linkBtn, TextInput, useSeo } from '@/lib/ui';

export default function Home() {
  useSeo('Training accreditation and certificate verification', 'LIV LLC accredits training providers in the United States and offers privacy-conscious certificate verification.');
  const [id, setId] = useState('');
  const [, nav] = useLocation();
  const stats = useGetPublicStats({ query: { queryKey: ['public-stats'], retry: false } }).data as J;
  const n = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('en-US') : '—');
  return (
    <PublicLayout>
      <section className="bg-primary text-primary-foreground relative overflow-hidden">
        <div className="liv-grid absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 py-20 md:py-28 grid md:grid-cols-[1.3fr_1fr] gap-12 items-center">
          <div className="liv-rise">
            <p className="text-xs uppercase tracking-[0.2em] text-sidebar-primary mb-5">Independent US training accreditation</p>
            <h1 className="font-display text-4xl md:text-6xl font-semibold leading-[1.05]">Credentials employers can check in seconds.</h1>
            <p className="mt-6 text-lg text-primary-foreground/75 max-w-xl">LIV LLC accredits training providers and enables secure digital certificates that anyone can verify, without publishing trainee email addresses.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/apply" className={linkBtn('light', 'lg')} data-testid="button-hero-apply">Apply for accreditation <ArrowRight className="size-4" /></Link>
              <Link href="/login" className="inline-flex items-center h-12 px-6 rounded-md border border-white/30 text-white hover:bg-white/10">Provider sign in</Link>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (id.trim()) nav(`/verify/${encodeURIComponent(id.trim())}`); }} className="liv-rise bg-card text-foreground rounded-lg p-6 space-y-4" style={{ animationDelay: '.15s' }}>
            <div className="flex items-center gap-2 text-primary"><Search className="size-5" /><h2 className="font-display text-xl font-semibold">Verify a certificate</h2></div>
            <p className="text-sm text-muted-foreground">Enter the certificate number printed on the document. Lookups by name are not offered.</p>
            <TextInput value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. LIV-2026-7KQ4M9XZ" className="font-mono" data-testid="input-cert-number" aria-label="Certificate number" />
            <Btn type="submit" className="w-full" data-testid="button-verify">Check status</Btn>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 -mt-px">
        <dl className="grid grid-cols-1 sm:grid-cols-3 border-x border-b border-border bg-card divide-y sm:divide-y-0 sm:divide-x divide-border">
          {[['Accredited providers', stats?.active_platforms], ['Certificates issued', stats?.certificates_issued], ['Verification lookups', stats?.verification_lookups]].map(([l, v]) => (
            <div key={l as string} className="p-6"><dd className="font-display text-4xl text-primary" data-testid={`stat-${(l as string).split(' ')[0].toLowerCase()}`}>{n(v)}</dd><dt className="text-sm text-muted-foreground mt-1">{l as string}</dt></div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-6xl px-5 mt-24 grid md:grid-cols-[1fr_1.6fr] gap-12">
        <div><h2 className="font-display text-3xl text-primary font-semibold">Built on verifiability and restraint.</h2><p className="text-muted-foreground mt-3">Trust is the product. Every design choice limits what is exposed and maximizes what can be confirmed.</p></div>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-8">
          {[[Lock, 'Privacy by default', 'Public verification shows course, dates and issuer. Trainee email is never published.'],
            [ShieldCheck, 'Tamper detection', 'Each certificate link carries a signed token. Altered links return a tampered result, not a guess.'],
            [BadgeCheck, 'Reviewed providers', 'Providers are reviewed before they can issue, and can be suspended at any time.'],
            [FileCheck2, 'Revocation you can see', 'Revoked and expired credentials are labelled clearly with the reason where permitted.']].map(([I, t, d]: J) => (
            <div key={t} className="border-t-2 border-primary pt-4"><I className="size-5 text-primary mb-3" /><h3 className="font-semibold">{t}</h3><p className="text-sm text-muted-foreground mt-1">{d}</p></div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 mt-24">
        <h2 className="font-display text-3xl text-primary font-semibold mb-10">How it works</h2>
        <ol className="grid md:grid-cols-4 gap-6">
          {[['Apply', 'Submit your organization details and an administrator account.'], ['Review', 'LIV LLC reviews the application and activates the provider portal.'], ['Issue', 'Upload a CSV of completions. Certificates and a ZIP of PDFs are generated.'], ['Verify', 'Anyone scans the QR link or enters the number to see live status.']].map(([t, d], i) => (
            <li key={t} className="relative rounded-lg border border-card-border bg-card p-5">
              <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
              <h3 className="font-display text-xl text-primary mt-2">{t}</h3><p className="text-sm text-muted-foreground mt-1">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-5 mt-24">
        <div className="rounded-lg bg-secondary p-8 md:p-12 flex flex-wrap items-center justify-between gap-6">
          <div><h2 className="font-display text-2xl text-primary font-semibold">Run a training business?</h2><p className="text-muted-foreground mt-1">Issue branded, verifiable certificates in bulk.</p></div>
          <div className="flex gap-3"><Link href="/apply" className={linkBtn('primary', 'lg')}><Upload className="size-4" />Apply now</Link><Link href="/accreditation" className={linkBtn('outline', 'lg')}>Learn about accreditation</Link></div>
        </div>
      </section>
    </PublicLayout>
  );
}

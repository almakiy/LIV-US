import { Link } from 'wouter';
import { PublicLayout } from '@/lib/auth';
import { Card, linkBtn, useSeo } from '@/lib/ui';

const Hero = ({ kicker, title, text }: { kicker: string; title: string; text: string }) => (
  <section className="bg-primary text-primary-foreground relative overflow-hidden">
    <div className="liv-grid absolute inset-0" aria-hidden />
    <div className="relative mx-auto max-w-6xl px-5 py-16 md:py-20 liv-rise">
      <p className="text-xs uppercase tracking-[0.2em] text-sidebar-primary mb-4">{kicker}</p>
      <h1 className="font-display text-4xl md:text-5xl font-semibold max-w-3xl">{title}</h1>
      <p className="mt-4 text-primary-foreground/75 max-w-2xl text-lg">{text}</p>
    </div>
  </section>
);

export function Accreditation() {
  useSeo('Accreditation', 'How LIV LLC reviews training providers and aligns curricula.');
  return (
    <PublicLayout>
      <Hero kicker="Accreditation" title="What LIV accreditation means" text="LIV LLC reviews a provider's organization, course documentation and certificate practices before activating issuance." />
      <div className="mx-auto max-w-6xl px-5 mt-14 grid md:grid-cols-2 gap-10">
        <div className="space-y-4">
          <h2 className="font-display text-2xl text-primary font-semibold">Curricula alignment review</h2>
          <p className="text-muted-foreground">Providers may document curricula aligned with recognized frameworks such as ISO 45001 for occupational health and safety management. LIV LLC reviews that documentation for clarity, consistency and completeness of learning outcomes.</p>
          <p className="text-muted-foreground">Alignment is a descriptive statement made by the provider and reviewed by LIV LLC. It does not mean a course is approved, certified or recognized by any third-party standards body.</p>
        </div>
        <ol className="space-y-3">
          {['Organization identity and contact review', 'Course documentation and learning outcomes review', 'Certificate content and issuance practice review', 'Ongoing monitoring, with suspension where needed'].map((s, i) => (
            <li key={s} className="flex gap-4 rounded-lg border border-card-border bg-card p-4"><span className="font-mono text-muted-foreground">0{i + 1}</span><span>{s}</span></li>
          ))}
        </ol>
      </div>
      <div className="mx-auto max-w-6xl px-5 mt-12">
        <Card className="border-expired/40 bg-expired/5 p-6" >
          <h2 className="font-display text-xl text-primary font-semibold">Important disclaimer</h2>
          <p className="mt-2 text-sm">LIV LLC is an independent company. LIV LLC and its accredited providers are not endorsed by, affiliated with, or accredited by OSHA, ANSI, ISO, PMI or any government agency. Names of such organizations may be referenced only to describe topics and do not imply approval or endorsement. A LIV certificate is evidence of course completion with an accredited provider, not a regulatory license or professional credential.</p>
        </Card>
        <div className="mt-8"><Link href="/apply" className={linkBtn('primary', 'lg')}>Apply for accreditation</Link></div>
      </div>
    </PublicLayout>
  );
}

export function About() {
  useSeo('About', 'LIV LLC is a US-based accreditation company.');
  const lead = [['Founder and Chief Executive', 'Name to be announced'], ['Head of Accreditation', 'Name to be announced'], ['Director of Trust and Privacy', 'Name to be announced']];
  return (
    <PublicLayout>
      <Hero kicker="About LIV LLC" title="A US company focused on credential trust." text="Our mission is to make training credentials easy to confirm and hard to forge, while keeping trainee data private." />
      <div className="mx-auto max-w-6xl px-5 mt-14 grid md:grid-cols-3 gap-8">
        {[['Mission', 'Give employers and regulators a fast, reliable way to check that a training credential is real.'], ['Approach', 'Review providers, sign every certificate link, log every lookup, and publish only what is necessary.'], ['Location', 'LIV LLC is based in the United States and operates under US law.']].map(([t, d]) => (
          <div key={t} className="border-t-2 border-primary pt-4"><h2 className="font-display text-xl text-primary">{t}</h2><p className="text-muted-foreground mt-2 text-sm">{d}</p></div>
        ))}
      </div>
      <div className="mx-auto max-w-6xl px-5 mt-16">
        <h2 className="font-display text-2xl text-primary font-semibold">Leadership</h2>
        <p className="text-sm text-muted-foreground mt-1">Placeholder entries. Leadership profiles will be published here.</p>
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          {lead.map(([r, n]) => (
            <Card key={r} className="p-5 border-dashed"><div className="size-14 rounded-full bg-muted grid place-items-center text-muted-foreground font-display">?</div><p className="mt-3 font-medium">{n}</p><p className="text-sm text-muted-foreground">{r}</p><p className="text-[11px] uppercase tracking-wider text-expired mt-2">Placeholder</p></Card>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, useGetMe, useLogout } from '@workspace/api-client-react';
import { BarChart3, BookOpen, FileText, History, LayoutDashboard, LogOut, Mail, Menu, Palette, Settings, ShieldCheck, Upload, Users, X } from 'lucide-react';
import { Btn, cx, ErrorBox, J, linkBtn, Logo, Skel } from './ui';
import { useToast } from '@/hooks/use-toast';

export function useAuth() {
  const q = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: 60_000, refetchOnWindowFocus: false } });
  const d = q.data as J;
  return { user: d?.user ?? null, platform: d?.platform ?? null, isLoading: q.isLoading, error: q.error as J, refetch: q.refetch };
}
export const homeFor = (role?: string) => (role === 'super_admin' ? '/admin/platforms' : '/portal/dashboard');

export function useDoLogout() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const m = useLogout();
  return () =>
    m.mutate(undefined, {
      onSuccess: () => {
        qc.clear();
        qc.setQueryData(getGetMeQueryKey(), undefined);
        nav('/login');
      },
      onError: () => toast({ title: 'Sign out failed. Please try again.', variant: 'destructive' }),
    });
}

const portalNav = [
  { href: '/portal/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portal/issue', label: 'Issue certificates', icon: Upload },
  { href: '/portal/templates', label: 'Templates', icon: Palette },
  { href: '/portal/records', label: 'Records', icon: FileText },
  { href: '/portal/settings', label: 'Settings', icon: Settings },
  { href: '/portal/docs', label: 'API docs', icon: BookOpen },
];
const adminNav = [
  { href: '/admin/platforms', label: 'Platforms', icon: Users },
  { href: '/admin/certificates', label: 'Certificates', icon: FileText },
  { href: '/admin/audit', label: 'Audit log', icon: History },
  { href: '/admin/messages', label: 'Messages', icon: Mail },
  { href: '/admin/analytics', label: 'Verification analytics', icon: BarChart3 },
];

export function Shell({ area, roles, children }: { area: 'portal' | 'admin'; roles: string[]; children: ReactNode }) {
  const { user, platform, isLoading, error } = useAuth();
  const [loc, nav] = useLocation();
  const logout = useDoLogout();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc]);
  useEffect(() => {
    if (!isLoading && !user) nav('/login');
  }, [isLoading, user, nav]);
  if (isLoading || !user)
    return (
      <div className="min-h-[100dvh] grid place-items-center p-8">
        {error && error.status !== 401 ? <ErrorBox error={error} /> : <Skel className="h-8 w-48" />}
      </div>
    );
  if (!roles.includes(user.role))
    return (
      <div className="min-h-[100dvh] grid place-items-center p-8 text-center">
        <div className="space-y-4">
          <ShieldCheck className="size-10 mx-auto text-primary" />
          <h1 className="font-display text-2xl text-primary">Access restricted</h1>
          <p className="text-muted-foreground">Your account role does not have access to this area.</p>
          <Link href={homeFor(user.role)} className={linkBtn()}>Go to your dashboard</Link>
        </div>
      </div>
    );
  const items = area === 'admin' ? adminNav : portalNav;
  const nav2 = (
    <nav className="flex-1 px-3 space-y-1">
      {items.map((i) => {
        const on = loc === i.href;
        return (
          <Link key={i.href} href={i.href} data-testid={`nav-${i.href.split('/').pop()}`} className={cx('flex items-center gap-3 rounded-md px-3 py-2 text-sm', on ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60')}>
            <i.icon className="size-4" />{i.label}
          </Link>
        );
      })}
    </nav>
  );
  const side = (
    <div className="flex flex-col h-full py-5 gap-6">
      <Link href="/" className="px-5"><Logo light /></Link>
      <div className="px-5 text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/50">{area === 'admin' ? 'Administration' : platform?.company_name || 'Provider portal'}</div>
      {nav2}
      <div className="px-4 space-y-2 border-t border-sidebar-border pt-4">
        <p className="text-sm text-white truncate">{user.name}</p>
        <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
        {user.role === 'super_admin' && area === 'portal' && <Link href="/admin/platforms" className="block text-xs text-sidebar-primary">Switch to admin</Link>}
        <button onClick={logout} data-testid="button-logout" className="flex items-center gap-2 text-sm text-sidebar-foreground hover:text-white"><LogOut className="size-4" />Sign out</button>
      </div>
    </div>
  );
  return (
    <div className="min-h-[100dvh] md:grid md:grid-cols-[17rem_1fr]">
      <aside className="hidden md:block bg-sidebar sticky top-0 h-[100dvh]">{side}</aside>
      <header className="md:hidden flex items-center justify-between bg-sidebar px-4 h-14 sticky top-0 z-40">
        <Logo light />
        <button aria-label="Menu" className="text-white" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </header>
      {open && <div className="md:hidden fixed inset-0 top-14 z-30 bg-sidebar overflow-auto">{side}</div>}
      <main className="p-5 md:p-10 min-w-0 max-w-[1200px] w-full">
        {area === 'portal' && platform && platform.accreditation_status !== 'active' && (
          <div className="mb-6 rounded-md border border-expired/30 bg-expired/10 text-expired px-4 py-3 text-sm">
            Accreditation status: <strong className="uppercase">{platform.accreditation_status}</strong>. Issuing certificates may be unavailable until your application is approved.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc]);
  const links = [['/verify', 'Verify'], ['/accreditation', 'Accreditation'], ['/about', 'About'], ['/contact', 'Contact']];
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
          <Link href="/" data-testid="link-home"><Logo /></Link>
          <nav className="hidden md:flex items-center gap-7 text-sm">
            {links.map(([h, l]) => <Link key={h} href={h} className={cx('hover:text-primary', loc.startsWith(h) ? 'text-primary font-medium' : 'text-muted-foreground')}>{l}</Link>)}
          </nav>
          <div className="hidden md:flex gap-2">
            {user ? <Link href={homeFor(user.role)} className={linkBtn('primary', 'sm')}>Dashboard</Link> : <>
              <Link href="/login" className={linkBtn('ghost', 'sm')} data-testid="link-login">Sign in</Link>
              <Link href="/apply" className={linkBtn('primary', 'sm')} data-testid="link-apply">Apply</Link></>}
          </div>
          <button className="md:hidden" aria-label="Menu" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        </div>
        {open && (
          <div className="md:hidden border-t border-border px-5 py-4 flex flex-col gap-3 bg-background">
            {links.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}
            <Link href="/login">Sign in</Link>
            <Link href="/apply" className={linkBtn()}>Apply for accreditation</Link>
          </div>
        )}
      </header>
      <div className="flex-1">{children}</div>
      <footer className="bg-primary text-primary-foreground/80 mt-20">
        <div className="mx-auto max-w-6xl px-5 py-12 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="space-y-3"><Logo light /><p className="text-sm max-w-xs text-primary-foreground/60">LIV LLC is a United States-based accreditation authority for training providers.</p></div>
          <div className="text-sm space-y-2"><p className="text-white font-medium">Platform</p>
            {[['/verify', 'Verify a certificate'], ['/apply', 'Apply for accreditation'], ['/login', 'Provider sign in']].map(([h, l]) => <Link key={h} href={h} className="block hover:text-white">{l}</Link>)}</div>
          <div className="text-sm space-y-2"><p className="text-white font-medium">Company</p>
            {[['/accreditation', 'Accreditation'], ['/about', 'About'], ['/contact', 'Contact']].map(([h, l]) => <Link key={h} href={h} className="block hover:text-white">{l}</Link>)}</div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs text-primary-foreground/50 px-5">
          LIV LLC. Not affiliated with or endorsed by OSHA, ANSI, ISO or PMI. Verification lookups are logged.
        </div>
      </footer>
    </div>
  );
}

export { Btn };

import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import Home from '@/pages/home';
import { VerifyLookup, VerifyPortal } from '@/pages/verify';
import { About, Accreditation } from '@/pages/static';
import { Apply, Contact, Login } from '@/pages/forms';
import Dashboard from '@/pages/portal/dashboard';
import Issue from '@/pages/portal/issue';
import Templates from '@/pages/portal/templates';
import Records from '@/pages/portal/records';
import Settings from '@/pages/portal/settings';
import Docs from '@/pages/portal/docs';
import { AdminCertificates, Analytics, Audit, Messages, Platforms } from '@/pages/admin/admin';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/verify" component={VerifyLookup} />
        <Route path="/verify/:certNumber" component={VerifyPortal} />
        <Route path="/accreditation" component={Accreditation} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/apply" component={Apply} />
        <Route path="/login" component={Login} />
        <Route path="/portal/dashboard" component={Dashboard} />
        <Route path="/portal/issue" component={Issue} />
        <Route path="/portal/templates" component={Templates} />
        <Route path="/portal/records" component={Records} />
        <Route path="/portal/settings" component={Settings} />
        <Route path="/portal/docs" component={Docs} />
        <Route path="/admin/platforms" component={Platforms} />
        <Route path="/admin/certificates" component={AdminCertificates} />
        <Route path="/admin/audit" component={Audit} />
        <Route path="/admin/messages" component={Messages} />
        <Route path="/admin/analytics" component={Analytics} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

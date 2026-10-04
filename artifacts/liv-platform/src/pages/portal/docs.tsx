import { Shell } from '@/lib/auth';
import { Card, PageHead, useSeo } from '@/lib/ui';

const Code = ({ children }: { children: string }) => <pre className="rounded-md bg-primary text-primary-foreground/90 p-4 text-xs overflow-x-auto font-mono">{children}</pre>;

export default function Docs() {
  useSeo('API documentation');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <Shell area="portal" roles={['platform_admin', 'super_admin']}>
      <PageHead title="API documentation" sub="Issue and manage certificates from your own systems." />
      <div className="space-y-6 max-w-3xl">
        <Card className="p-5 space-y-3"><h2 className="font-display text-lg text-primary">Authentication</h2><p className="text-sm text-muted-foreground">Generate a key in Settings and send it in the X-API-Key header. Optionally send an Idempotency-Key header to make issuance retry-safe.</p><Code>{`X-API-Key: liv_xxxxxxxx\nIdempotency-Key: 6f1c2d9e-batch-0042`}</Code></Card>
        <Card className="p-5 space-y-3"><h2 className="font-display text-lg text-primary">POST /api/v1/certificates</h2><p className="text-sm text-muted-foreground">Accepts an object with template_id and rows, a single row with template_id, or an array of rows with template_id. Dates are ISO YYYY-MM-DD and cannot be in the future; grade is optional.</p>
          <Code>{`curl -X POST ${origin}/api/v1/certificates \\
  -H "X-API-Key: $LIV_KEY" -H "Content-Type: application/json" \\
  -H "Idempotency-Key: batch-0042" \\
  -d '{
    "template_id": 1,
    "rows": [{
      "first_name": "Maria", "last_name": "Okafor",
      "email": "maria@example.com",
      "course_name": "Site Safety Fundamentals",
      "completion_date": "2025-03-14", "grade": "94"
    }]
  }'`}</Code></Card>
        <Card className="p-5 space-y-3"><h2 className="font-display text-lg text-primary">GET /api/v1/certificates/:number</h2><p className="text-sm text-muted-foreground">Returns certificate detail for your organization.</p><Code>{`curl ${origin}/api/v1/certificates/LIV-2026-7KQ4M9XZ -H "X-API-Key: $LIV_KEY"`}</Code></Card>
        <Card className="p-5 space-y-3"><h2 className="font-display text-lg text-primary">POST /api/v1/certificates/:number/revoke</h2><Code>{`curl -X POST ${origin}/api/v1/certificates/LIV-2026-7KQ4M9XZ/revoke \\
  -H "X-API-Key: $LIV_KEY" -H "Content-Type: application/json" \\
  -d '{"reason": "Issued in error"}'`}</Code></Card>
        <Card className="p-5 space-y-3"><h2 className="font-display text-lg text-primary">GET /api/v1/verify/:number</h2><p className="text-sm text-muted-foreground">Public, no key required. Returns status (VALID, EXPIRED, REVOKED, NOT_FOUND, TAMPERED) and a certificate object without email. Pass the token as ?t=. Lookups are logged; please avoid polling.</p><Code>{`curl "${origin}/api/v1/verify/LIV-2026-7KQ4M9XZ?t=TOKEN"`}</Code></Card>
        <Card className="p-5 space-y-2"><h2 className="font-display text-lg text-primary">Downloads</h2><p className="text-sm text-muted-foreground">PDF: /api/certificates/:number/pdf?t=token. Batch results: /api/portal/batches/:id/results.csv and /pdfs.zip (signed-in portal users).</p></Card>
      </div>
    </Shell>
  );
}

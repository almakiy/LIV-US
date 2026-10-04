import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDashboardQueryKey, getGetMeQueryKey, getGetSettingsQueryKey, useGenerateApiKey, useGetSettings, useRequestLogoUpload, useRevokeApiKey, useUpdateSettings } from '@workspace/api-client-react';
import { Copy, KeyRound } from 'lucide-react';
import { Shell } from '@/lib/auth';
import { Btn, Card, Empty, errMsg, ErrorBox, Field, fmtDateTime, J, logoSrc, Modal, PageHead, Skel, StatusBadge, Td, TextInput, Th, useSeo } from '@/lib/ui';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  useSeo('Settings');
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetSettings();
  const s = q.data as J;
  const update = useUpdateSettings();
  const upload = useRequestLogoUpload();
  const gen = useGenerateApiKey();
  const rev = useRevokeApiKey();
  const [f, setF] = useState({ company_name: '', primary_color: '#14284b', phone: '', website: '' });
  const [loaded, setLoaded] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revId, setRevId] = useState<J>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  useEffect(() => {
    if (s?.platform && !loaded) { setLoaded(true); setF({ company_name: s.platform.company_name || '', primary_color: s.platform.primary_color || '#14284b', phone: s.platform.phone || '', website: s.platform.website || '' }); }
  }, [s, loaded]);
  const inv = () => [getGetSettingsQueryKey(), getGetMeQueryKey(), getGetDashboardQueryKey()].forEach((k) => qc.invalidateQueries({ queryKey: k }));
  const saveProfile = () => update.mutate({ data: f }, { onSuccess: () => { inv(); toast({ title: 'Settings saved' }); } });
  const onLogo = async (file?: File) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const meta = (await upload.mutateAsync({ data: { contentType: file.type, size: file.size } })) as J;
      const put = await fetch(meta.uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error('Upload failed');
      await update.mutateAsync({ data: { logo_url: meta.objectPath } });
      inv(); toast({ title: 'Logo updated' });
    } catch (e) { toast({ title: 'Logo upload failed', description: errMsg(e), variant: 'destructive' }); }
    setLogoBusy(false);
  };
  const keys: J[] = s?.api_keys || [];
  const users: J[] = s?.users || [];
  return (
    <Shell area="portal" roles={['platform_admin', 'super_admin']}>
      <PageHead title="Settings" sub="Company profile, logo, team and API access." />
      {q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : q.isLoading ? <Skel className="h-72" /> : (
        <div className="space-y-8">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5 space-y-4">
              <h2 className="font-display text-lg text-primary">Company</h2>
              <Field label="Company name"><TextInput value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} data-testid="input-company" /></Field>
              <Field label="Brand color"><div className="flex gap-2"><input type="color" aria-label="Brand color" value={f.primary_color} onChange={(e) => setF({ ...f, primary_color: e.target.value })} className="h-10 w-14 rounded border border-input bg-card" /><TextInput value={f.primary_color} onChange={(e) => setF({ ...f, primary_color: e.target.value })} className="font-mono" /></div></Field>
              <Field label="Phone"><TextInput value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label="Website"><TextInput value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></Field>
              {update.isError && <p className="text-sm text-invalid" role="alert">{errMsg(update.error)}</p>}
              <Btn onClick={saveProfile} disabled={update.isPending} data-testid="button-save-settings">{update.isPending ? 'Saving...' : 'Save changes'}</Btn>
            </Card>
            <Card className="p-5 space-y-4">
              <h2 className="font-display text-lg text-primary">Logo</h2>
              <div className="h-32 rounded-md border border-dashed border-input grid place-items-center bg-muted/40">{s?.platform?.logo_url ? <img src={logoSrc(s.platform.logo_url)} alt="Company logo" className="max-h-24 max-w-[70%] object-contain" /> : <span className="text-sm text-muted-foreground">No logo uploaded</span>}</div>
              <label className="block"><span className="sr-only">Upload logo</span><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" disabled={logoBusy} onChange={(e) => onLogo(e.target.files?.[0])} className="text-sm" data-testid="input-logo" /></label>
              {logoBusy && <p className="text-sm text-muted-foreground">Uploading...</p>}
              <p className="text-xs text-muted-foreground">PNG, JPEG, SVG or WebP. Appears on certificates and the verification page.</p>
            </Card>
          </div>
          <Card>
            <div className="p-4 border-b border-border"><h2 className="font-display text-lg text-primary">Users</h2></div>
            {users.length === 0 ? <Empty title="No users" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th></tr></thead><tbody className="divide-y divide-border">{users.map((u) => <tr key={u.id}><Td>{u.name}</Td><Td>{u.email}</Td><Td>{u.role}</Td></tr>)}</tbody></table></div>}
          </Card>
          <Card>
            <div className="p-4 border-b border-border flex flex-wrap gap-3 items-end justify-between">
              <div><h2 className="font-display text-lg text-primary">API keys</h2><p className="text-xs text-muted-foreground">Send as the X-API-Key header. Keys are shown once.</p></div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); gen.mutate({ data: { name: keyName || undefined } }, { onSuccess: (r: J) => { setNewKey(r.key); setKeyName(''); qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() }); } }); }}>
                <TextInput placeholder="Key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} data-testid="input-key-name" /><Btn type="submit" disabled={gen.isPending} data-testid="button-generate-key"><KeyRound className="size-4" />Generate</Btn>
              </form>
            </div>
            {gen.isError && <p className="p-4 text-sm text-invalid">{errMsg(gen.error)}</p>}
            {keys.length === 0 ? <Empty title="No API keys" text="Generate a key to integrate issuance with your own systems." /> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Name</Th><Th>Prefix</Th><Th>Created</Th><Th>Last used</Th><Th>Status</Th><Th /></tr></thead><tbody className="divide-y divide-border">
                {keys.map((k) => <tr key={k.id}><Td>{k.name || 'Unnamed'}</Td><Td className="font-mono text-xs">{k.prefix}...</Td><Td>{fmtDateTime(k.created_at)}</Td><Td>{k.last_used_at ? fmtDateTime(k.last_used_at) : 'Never'}</Td><Td><StatusBadge status={k.revoked_at ? 'REVOKED' : 'ACTIVE'} /></Td><Td>{!k.revoked_at && <Btn size="sm" variant="outline" onClick={() => setRevId(k)} data-testid={`button-revoke-key-${k.id}`}>Revoke</Btn>}</Td></tr>)}
              </tbody></table></div>
            )}
          </Card>
        </div>
      )}
      <Modal open={!!newKey} onClose={() => setNewKey(null)} title="Your new API key">
        <p className="text-sm text-muted-foreground mb-3">Copy it now. For security it will not be shown again.</p>
        <code className="block break-all rounded bg-muted p-3 font-mono text-xs" data-testid="text-new-key">{newKey}</code>
        <div className="mt-4 flex gap-2"><Btn onClick={() => navigator.clipboard.writeText(newKey || '').then(() => toast({ title: 'Key copied' }))}><Copy className="size-4" />Copy</Btn><Btn variant="ghost" onClick={() => setNewKey(null)}>Done</Btn></div>
      </Modal>
      <Modal open={!!revId} onClose={() => setRevId(null)} title="Revoke API key">
        <p className="text-sm">Revoke <strong>{revId?.name || revId?.prefix}</strong>? Integrations using it will stop working immediately.</p>
        {rev.isError && <p className="text-sm text-invalid mt-2">{errMsg(rev.error)}</p>}
        <div className="mt-4 flex gap-2"><Btn variant="danger" disabled={rev.isPending} data-testid="button-confirm-revoke-key" onClick={() => rev.mutate({ id: revId.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() }); toast({ title: 'API key revoked' }); setRevId(null); } })}>Revoke key</Btn><Btn variant="ghost" onClick={() => setRevId(null)}>Cancel</Btn></div>
      </Modal>
    </Shell>
  );
}

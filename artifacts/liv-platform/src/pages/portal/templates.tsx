import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListTemplatesQueryKey, useCreateTemplate, useListTemplates, useUpdateTemplate } from '@workspace/api-client-react';
import { Plus } from 'lucide-react';
import { Shell, useAuth } from '@/lib/auth';
import { Btn, Card, cx, Empty, errMsg, ErrorBox, Field, J, logoSrc, PageHead, Select, SkelRows, TextInput, useSeo } from '@/lib/ui';
import { useToast } from '@/hooks/use-toast';

export function CertPreview({ design, paper, signatory, title, name, color, logo }: { design: string; paper: string; signatory: string; title: string; name: string; color?: string; logo?: string }) {
  const ratio = paper === 'Letter' ? '11 / 8.5' : '297 / 210';
  const c = color || '#14284b';
  const modern = design === 'modern';
  return (
    <div className="w-full bg-white shadow-sm border border-border overflow-hidden relative" style={{ aspectRatio: ratio, containerType: 'inline-size', color: '#1b2438' }} data-testid="preview-certificate">
      {modern ? <div className="absolute inset-y-0 left-0" style={{ width: '9%', background: c }} /> : <div className="absolute inset-[3%] border-2" style={{ borderColor: c, outline: `1px solid ${c}`, outlineOffset: '-6px' }} />}
      <div className="absolute inset-0 flex flex-col justify-between text-center" style={{ padding: modern ? '6% 8% 6% 17%' : '8% 10%', textAlign: modern ? 'left' : 'center', alignItems: modern ? 'flex-start' : 'center' }}>
        <div className="flex items-center gap-[2cqw]" style={{ fontSize: '2.2cqw' }}>
          {logo ? <img src={logo} alt="" style={{ height: '6cqw' }} /> : null}<span style={{ letterSpacing: '.2em', textTransform: 'uppercase', color: c }}>{name}</span>
        </div>
        <div>
          <p style={{ fontSize: modern ? '5.5cqw' : '5cqw', fontFamily: modern ? 'inherit' : "'Source Serif 4',serif", color: c, fontWeight: 600 }}>Certificate of Completion</p>
          <p style={{ fontSize: '2cqw', marginTop: '2cqw', color: '#667' }}>This certifies that</p>
          <p style={{ fontSize: '4cqw', fontFamily: "'Source Serif 4',serif", margin: '1cqw 0', borderBottom: `1px solid ${c}`, display: 'inline-block', padding: '0 3cqw' }}>Jordan A. Reyes</p>
          <p style={{ fontSize: '2cqw', color: '#667' }}>has successfully completed</p>
          <p style={{ fontSize: '3cqw', fontWeight: 600 }}>Sample Course Title</p>
        </div>
        <div className="flex w-full justify-between items-end" style={{ fontSize: '1.8cqw' }}>
          <div><p style={{ fontFamily: "'Source Serif 4',serif", fontStyle: 'italic', fontSize: '2.6cqw', borderBottom: '1px solid #99a', minWidth: '16cqw' }}>{signatory || 'Signatory'}</p><p>{title || 'Title'}</p></div>
          <div className="grid place-items-center border" style={{ width: '8cqw', height: '8cqw', fontSize: '1.2cqw', borderColor: c }}>QR</div>
        </div>
      </div>
    </div>
  );
}

export default function Templates() {
  useSeo('Templates');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { platform } = useAuth();
  const q = useListTemplates();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const list = (q.data as J[]) || [];
  const blank = { id: 0, design: 'classic', signatory_name: '', signatory_title: '', validity_months: '' as string, paper: 'A4' };
  const [f, setF] = useState<J>(blank);
  const [open, setOpen] = useState(false);
  const pending = create.isPending || update.isPending;
  const err = create.error || update.error;
  const pick = (t: J) => { setF({ id: t.id, design: t.design, signatory_name: t.signatory_name, signatory_title: t.signatory_title, validity_months: t.validity_months ? String(t.validity_months) : '', paper: t.settings?.paper_size || 'A4' }); setOpen(true); create.reset(); update.reset(); };
  const save = () => {
    const data = { design: f.design, signatory_name: f.signatory_name, signatory_title: f.signatory_title, validity_months: f.validity_months ? Number(f.validity_months) : null, settings: { paper_size: f.paper } };
    const ok = { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTemplatesQueryKey() }); toast({ title: 'Template saved' }); setOpen(false); } };
    if (f.id) update.mutate({ id: f.id, data }, ok); else create.mutate({ data }, ok);
  };
  return (
    <Shell area="portal" roles={['platform_admin', 'super_admin']}>
      <PageHead title="Certificate templates" sub="Landscape layouts in A4 or US Letter. Colors and logo come from your settings." action={<Btn onClick={() => { setF(blank); setOpen(true); create.reset(); }} data-testid="button-new-template"><Plus className="size-4" />New template</Btn>} />
      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-8">
        <div className="space-y-3">
          {q.isLoading ? <SkelRows n={3} /> : q.isError ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : list.length === 0 ? <Card><Empty title="No templates" text="Create your first template to start issuing." /></Card> :
            list.map((t) => (
              <button key={t.id} onClick={() => pick(t)} data-testid={`template-${t.id}`} className={cx('w-full text-left rounded-lg border p-4 bg-card hover:bg-muted/50', f.id === t.id && open ? 'border-primary' : 'border-card-border')}>
                <p className="font-display text-lg text-primary capitalize">{t.design}</p><p className="text-sm text-muted-foreground">{t.signatory_name}, {t.signatory_title} - {t.settings?.paper_size || 'A4'} - {t.validity_months ? `${t.validity_months} months` : 'no expiry'}</p>
              </button>))}
        </div>
        <div className="space-y-4">
          {open ? (
            <Card className="p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Design"><Select value={f.design} onChange={(e) => setF({ ...f, design: e.target.value })} data-testid="select-design"><option value="classic">Classic</option><option value="modern">Modern</option></Select></Field>
                <Field label="Paper size (landscape)"><Select value={f.paper} onChange={(e) => setF({ ...f, paper: e.target.value })}><option value="A4">A4</option><option value="Letter">US Letter</option></Select></Field>
                <Field label="Signatory name"><TextInput required value={f.signatory_name} onChange={(e) => setF({ ...f, signatory_name: e.target.value })} data-testid="input-signatory" /></Field>
                <Field label="Signatory title"><TextInput required value={f.signatory_title} onChange={(e) => setF({ ...f, signatory_title: e.target.value })} /></Field>
                <Field label="Validity (months)" hint="Leave empty for no expiry"><TextInput type="number" min={1} value={f.validity_months} onChange={(e) => setF({ ...f, validity_months: e.target.value })} /></Field>
              </div>
              {err && <p className="text-sm text-invalid" role="alert">{errMsg(err)}</p>}
              <div className="flex gap-2"><Btn disabled={pending || !f.signatory_name || !f.signatory_title} onClick={save} data-testid="button-save-template">{pending ? 'Saving...' : f.id ? 'Save changes' : 'Create template'}</Btn><Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn></div>
            </Card>
          ) : <p className="text-sm text-muted-foreground">Select a template or create a new one to edit.</p>}
          <CertPreview design={open ? f.design : list[0]?.design || 'classic'} paper={open ? f.paper : list[0]?.settings?.paper_size || 'A4'} signatory={open ? f.signatory_name : list[0]?.signatory_name} title={open ? f.signatory_title : list[0]?.signatory_title} name={platform?.company_name || 'Your Company'} color={platform?.primary_color} logo={logoSrc(platform?.logo_url)} />
          <p className="text-xs text-muted-foreground">Preview is illustrative; the generated PDF follows the same layout.</p>
        </div>
      </div>
    </Shell>
  );
}

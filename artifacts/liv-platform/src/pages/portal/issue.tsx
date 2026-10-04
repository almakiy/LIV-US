import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDashboardQueryKey, getListBatchesQueryKey, getListCertificatesQueryKey, useIssueCertificates, useListBatches, useListTemplates, useValidateIssuance } from '@workspace/api-client-react';
import { CheckCircle2, Download, FileUp, Trash2 } from 'lucide-react';
import { Shell, useAuth } from '@/lib/auth';
import { Btn, Card, cx, Empty, errMsg, ErrorBox, Field, fmtDateTime, J, linkBtn, PageHead, Select, SkelRows, Td, Th, useSeo } from '@/lib/ui';

const FIELDS = ['first_name', 'last_name', 'email', 'course_name', 'completion_date', 'grade'] as const;
type F = (typeof FIELDS)[number];
const SYN: Record<F, string[]> = {
  first_name: ['firstname', 'first', 'givenname', 'fname'],
  last_name: ['lastname', 'last', 'surname', 'familyname', 'lname'],
  email: ['email', 'emailaddress', 'mail'],
  course_name: ['coursename', 'course', 'training', 'program', 'title'],
  completion_date: ['completiondate', 'completed', 'date', 'completedon', 'completion'],
  grade: ['grade', 'score', 'result'],
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (q) throw new Error('The CSV contains an unclosed quoted field.');
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
const toIso = (v: string) => {
  const s = v.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : s;
};
function localErrors(r: Record<F, string>): string[] {
  const e: string[] = [];
  (['first_name', 'last_name', 'course_name'] as F[]).forEach((k) => !r[k].trim() && e.push(`${k.replace('_', ' ')} is required`));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim())) e.push('valid email required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.completion_date) || isNaN(Date.parse(r.completion_date))) e.push('date must be YYYY-MM-DD');
  else if (r.completion_date > new Date().toISOString().slice(0, 10)) e.push('date cannot be in the future');
  return e;
}

export default function Issue() {
  useSeo('Issue certificates');
  const { platform } = useAuth();
  const qc = useQueryClient();
  const tpl = useListTemplates();
  const batches = useListBatches();
  const validate = useValidateIssuance();
  const issue = useIssueCertificates();
  const [step, setStep] = useState(1);
  const [templateId, setTemplateId] = useState('');
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<F, number>>({} as J);
  const [rows, setRows] = useState<Record<F, string>[]>([]);
  const [skip, setSkip] = useState(true);
  const [srv, setSrv] = useState<Record<number, string[]>>({});
  const [result, setResult] = useState<J>(null);
  const [parseErr, setParseErr] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const validationVersion = useRef(0);
  const templates = (tpl.data as J[]) || [];

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setParseErr('CSV files must be under 2 MB.'); return; }
    f.text().then((t) => {
      const p = parseCsv(t);
      if (p.length < 2) return setParseErr('The file needs a header row and at least one data row.');
      if (p.length > 501) return setParseErr('Issue up to 500 trainees per batch.');
      setParseErr(''); setFileName(f.name); setRaw(p);
      const m: J = {};
      FIELDS.forEach((k) => { m[k] = p[0].findIndex((h) => SYN[k].includes(norm(h)) || norm(h) === norm(k)); });
      setMap(m);
    }).catch((e) => setParseErr(e.message || 'Unable to read this file.'));
  };
  const headers = raw[0] || [];
  const requiredMapped = FIELDS.filter((k) => k !== 'grade').every((k) => (map[k] ?? -1) >= 0);
  const build = () => {
    const version = ++validationVersion.current;
    const mappedRows = raw.slice(1).map((r) => {
      const o: J = {};
      FIELDS.forEach((k) => { const v = (map[k] ?? -1) >= 0 ? (r[map[k]] ?? '').trim() : ''; o[k] = k === 'completion_date' ? toIso(v) : v; });
      return o;
    });
    setRows(mappedRows);
    setSrv({}); setStep(4); setConfirmed(false);
    validate.reset();
    validate.mutate({ data: { template_id: Number(templateId), file_name: fileName || undefined, skip_invalid: skip, rows: mappedRows } }, {
      onSuccess: (res: J) => { if (version !== validationVersion.current) return; const errors: Record<number, string[]> = {}; (res.rows || []).forEach((r: J) => { errors[r.row_number - 1] = r.errors || []; }); setSrv(errors); },
    });
  };
  const edit = (i: number, k: F, v: string) => { validationVersion.current++; setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setSrv({}); validate.reset(); setConfirmed(false); };
  const local = useMemo(() => rows.map(localErrors), [rows]);
  const invalidLocal = local.filter((e) => e.length).length;
  const payload = () => ({ template_id: Number(templateId), file_name: fileName || undefined, skip_invalid: skip, rows: rows.map((r) => ({ ...r, grade: r.grade || undefined })) });

  const runValidate = () => {
    const version = ++validationVersion.current;
    validate.mutate({ data: payload() }, { onSuccess: (res: J) => { if (version !== validationVersion.current) return; const m: Record<number, string[]> = {}; (res.rows || []).forEach((r: J) => { m[r.row_number - 1] = r.errors || []; }); setSrv(m); } });
  };
  const runIssue = () => issue.mutate({ data: payload() }, {
    onSuccess: (res: J) => {
      setResult(res); setStep(6);
      [getGetDashboardQueryKey(), getListBatchesQueryKey(), getListCertificatesQueryKey()].forEach((k) => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: ['/api/portal/certificates'] });
    },
  });
  const reset = () => { setStep(1); setRaw([]); setRows([]); setFileName(''); setResult(null); setSrv({}); setConfirmed(false); validate.reset(); issue.reset(); };
  const steps = ['Template', 'Upload', 'Map columns', 'Validation', 'Confirm', 'Result'];
  const srvErr = (i: number) => srv[i] || [];
  const validated = validate.isSuccess && Object.keys(srv).length === rows.length;

  return (
    <Shell area="portal" roles={['platform_admin']}>
      <PageHead title="Issue certificates" sub="Upload a CSV of completions, review each row, then issue in bulk." action={<a href="/api/portal/sample.csv" className={linkBtn('outline')} data-testid="link-sample"><Download className="size-4" />Sample CSV</a>} />
      {platform && platform.accreditation_status !== 'active' && <Card className="p-4 mb-5 text-invalid"><p role="alert">Your accreditation is {platform.accreditation_status}. Issuance is available only to active providers.</p></Card>}
      <ol className="flex gap-2 mb-8 overflow-x-auto" aria-label="Progress">
        {steps.map((s, i) => <li key={s} className={cx('flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border whitespace-nowrap', step === i + 1 ? 'bg-primary text-primary-foreground border-primary' : step > i + 1 ? 'text-valid border-valid/40' : 'text-muted-foreground border-border')}><span className="font-mono">{i + 1}</span>{s}</li>)}
      </ol>

      {step === 1 && (
        <Card className="p-6 max-w-xl space-y-4">
          {tpl.isLoading ? <SkelRows n={2} /> : tpl.isError ? <ErrorBox error={tpl.error} retry={() => tpl.refetch()} /> : templates.length === 0 ? (
            <Empty title="No templates yet" text="Create a certificate template before issuing." action={<Link href="/portal/templates" className={linkBtn()}>Create template</Link>} />
          ) : (<>
            <Field label="Certificate template"><Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} data-testid="select-template"><option value="">Select a template</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.design} - {t.signatory_name} ({t.settings?.paper_size || 'A4'})</option>)}</Select></Field>
            <Btn disabled={!templateId || platform?.accreditation_status !== 'active'} onClick={() => setStep(2)} data-testid="button-next-1">Continue</Btn>
          </>)}
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-6">
          <label className="block border-2 border-dashed border-input rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50">
            <FileUp className="size-8 mx-auto text-primary" />
            <p className="mt-2 font-medium">{fileName || 'Choose a CSV file'}</p>
            <p className="text-sm text-muted-foreground">Columns: first name, last name, email, course name, completion date (YYYY-MM-DD), grade (optional)</p>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} data-testid="input-csv" />
          </label>
          {parseErr && <p className="text-sm text-invalid" role="alert">{parseErr}</p>}
          <div className="flex gap-2"><Btn variant="outline" onClick={() => setStep(1)}>Back</Btn><Btn disabled={raw.length < 2 || !!parseErr} onClick={() => setStep(3)} data-testid="button-next-upload">Map columns</Btn></div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 space-y-6">
          {raw.length > 1 && (<>
            <div><h3 className="font-display text-lg text-primary">Column mapping</h3><p className="text-sm text-muted-foreground">{raw.length - 1} rows found. Headers were matched automatically; adjust if needed.</p></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FIELDS.map((k) => (
                <Field key={k} label={`${k.replace('_', ' ')}${k === 'grade' ? ' (optional)' : ''}`}>
                  <Select value={map[k] ?? -1} onChange={(e) => setMap({ ...map, [k]: Number(e.target.value) })}><option value={-1}>Not mapped</option>{headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</Select>
                </Field>
              ))}
            </div>
          </>)}
          <div className="flex gap-2"><Btn variant="outline" onClick={() => setStep(2)}>Back</Btn><Btn disabled={!requiredMapped || raw.length < 2} onClick={build} data-testid="button-next-2">Preview and validate</Btn></div>
        </Card>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-center gap-4 justify-between">
            <div className="text-sm"><strong>{rows.length}</strong> rows, <strong className={invalidLocal ? 'text-invalid' : 'text-valid'}>{invalidLocal}</strong> with problems. Edit cells directly.</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} data-testid="toggle-skip" />Skip invalid rows</label>
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr><Th>#</Th>{FIELDS.map((k) => <Th key={k}>{k.replace('_', ' ')}</Th>)}<Th>Issues</Th><Th /></tr></thead>
              <tbody className="divide-y divide-border">{rows.map((r, i) => {
                const errs = [...local[i], ...srvErr(i)];
                return (<tr key={i} className={errs.length ? 'bg-invalid/5' : ''}>
                  <Td className="font-mono text-xs">{i + 1}</Td>
                  {FIELDS.map((k) => <Td key={k} className="p-1"><input aria-label={`${k} row ${i + 1}`} value={r[k]} onChange={(e) => edit(i, k, e.target.value)} className="h-9 w-full min-w-28 rounded border border-transparent hover:border-input focus:border-ring bg-transparent px-2" /></Td>)}
                  <Td className="text-xs text-invalid min-w-48">{errs.length ? Array.from(new Set(errs)).join('; ') : <span className="text-valid">OK</span>}</Td>
                  <Td><button aria-label={`Remove row ${i + 1}`} onClick={() => { validationVersion.current++; setRows(rows.filter((_, j) => j !== i)); setSrv({}); validate.reset(); }}><Trash2 className="size-4 text-muted-foreground" /></button></Td>
                </tr>);
              })}</tbody></table>
          </Card>
          {validate.isError && <p className="text-sm text-invalid" role="alert">{errMsg(validate.error)}</p>}
          {validate.isSuccess && <p className="text-sm" data-testid="text-validate">Server check: <strong className="text-valid">{(validate.data as J).valid_count} valid</strong>, <strong className="text-invalid">{(validate.data as J).invalid_count} invalid</strong>.</p>}
          {issue.isError && <ErrorBox error={issue.error} />}
          {issue.isPending && <div className="space-y-2" role="progressbar" aria-label="Issuing certificates"><p className="text-sm">Generating certificates...</p><div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full w-1/3 bg-primary liv-indeterminate" /></div></div>}
          <div className="flex flex-wrap gap-2">
            <Btn variant="outline" onClick={() => setStep(3)} disabled={issue.isPending}>Back</Btn>
            <Btn variant="outline" disabled={!rows.length || validate.isPending || issue.isPending} onClick={runValidate} data-testid="button-validate">{validate.isPending ? 'Checking...' : 'Validate with server'}</Btn>
            <Btn disabled={!validated || validate.isPending || !(validate.data as J)?.valid_count || (!skip && (validate.data as J)?.invalid_count > 0)} onClick={() => { setConfirmed(false); setStep(5); }} data-testid="button-review-issuance">Review issuance</Btn>
          </div>
        </div>
      )}

      {step === 5 && (
        <Card className="p-6 max-w-2xl space-y-5">
          <h2 className="font-display text-2xl text-primary">Confirm certificate issuance</h2>
          <p>{(validate.data as J)?.valid_count} valid certificates will be created using the {templates.find(t => t.id === Number(templateId))?.design} template. {(validate.data as J)?.invalid_count || 0} invalid rows will be skipped.</p>
          <p className="text-sm text-muted-foreground">Each certificate becomes a permanent record with its own PDF and verification link. Corrections require revoking the original certificate and issuing a new one.</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />I confirm that these training completions are accurate and authorize issuance.</label>
          {issue.isError && <ErrorBox error={issue.error} />}
          {issue.isPending && <div role="progressbar" aria-label="Issuing certificates" className="space-y-2"><p className="text-sm">Generating and securely storing PDFs…</p><div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full w-1/3 bg-primary liv-indeterminate" /></div></div>}
          <div className="flex gap-2"><Btn variant="outline" onClick={() => setStep(4)} disabled={issue.isPending}>Back</Btn><Btn disabled={!confirmed || issue.isPending || platform?.accreditation_status !== 'active'} onClick={runIssue} data-testid="button-issue">{issue.isPending ? 'Issuing…' : 'Confirm and issue'}</Btn></div>
        </Card>
      )}

      {step === 6 && result && (
        <Card className="p-8 text-center space-y-4" data-testid="issue-result">
          <CheckCircle2 className="size-12 text-valid mx-auto" />
          <h2 className="font-display text-2xl text-primary">{result.issued} certificate{result.issued === 1 ? '' : 's'} issued</h2>
          <p className="text-muted-foreground">{result.skipped} row{result.skipped === 1 ? '' : 's'} skipped.</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {result.csv_url && <a href={result.csv_url} className={linkBtn('outline')}><Download className="size-4" />Results CSV</a>}
            {result.zip_url && <a href={result.zip_url} className={linkBtn()}><Download className="size-4" />PDFs ZIP</a>}
            <Link href="/portal/records" className={linkBtn('ghost')}>View records</Link>
            <Btn variant="ghost" onClick={reset}>Issue another batch</Btn>
          </div>
        </Card>
      )}

      <h2 className="font-display text-xl text-primary mt-12 mb-3">Previous batches</h2>
      <Card>
        {batches.isLoading ? <SkelRows n={3} /> : batches.isError ? <ErrorBox error={batches.error} retry={() => batches.refetch()} /> : ((batches.data as J[]) || []).length === 0 ? <Empty title="No batches yet" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>File</Th><Th>Date</Th><Th>Rows</Th><Th>Issued</Th><Th>Skipped</Th><Th>Downloads</Th></tr></thead><tbody className="divide-y divide-border">
            {((batches.data as J[]) || []).map((b) => <tr key={b.id}><Td>{b.file_name || `Batch ${b.id}`}</Td><Td>{fmtDateTime(b.created_at)}</Td><Td>{b.total_rows}</Td><Td>{b.issued}</Td><Td>{b.skipped}</Td><Td><a className="underline mr-3" href={b.csv_url || `/api/portal/batches/${b.id}/results.csv`}>CSV</a><a className="underline" href={b.zip_url || `/api/portal/batches/${b.id}/pdfs.zip`}>ZIP</a></Td></tr>)}
          </tbody></table></div>
        )}
      </Card>
    </Shell>
  );
}

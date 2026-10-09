// Expert review pack: one Excel workbook per Knowledge Hub item, so a named subject-matter reviewer (a governance
// expert, a licensed lawyer, an HSE specialist) checks the text statement by statement against its sources and signs a
// declaration. Labels are in English and Arabic because reviewers in the region may work in either. Pure: it builds the
// workbook from an article and its latest automated report; it reads nothing and publishes nothing.
const ExcelJS = require('exceljs');
const { paragraphs, sentencesOf, publisherOf } = require('../../engines/reviewer/checks');
const { defaultSources } = require('../../engines/reviewer');

const VERDICTS = ['Correct / صحيح', 'Needs change / يحتاج تعديل', 'Incorrect / خطأ', 'Cannot verify / لا يمكن التحقق'];
const YESNO = ['Yes / نعم', 'Partly / جزئياً', 'No / لا'];
const DECISIONS = ['Approve / اعتماد', 'Approve with changes / اعتماد مع تعديلات', 'Reject / رفض'];

// Quality criteria. Readers find, understand and use the text (the plain-language outcomes of ISO 24495-1:2023), the
// facts and legal statements are right and current, and the content keeps LIV's editorial rules.
const CHECKLIST = [
  ['Audience and scope', 'The audience and scope in the document control block are stated and right for this text.', 'الجمهور والنطاق محددان ومناسبان للنص.'],
  ['Findable', 'Readers can find what they need: the title, summary, headings and order lead them to it.', 'يجد القارئ ما يحتاجه: العنوان والملخص والعناوين والترتيب تقوده إليه.'],
  ['Understandable', 'Readers understand it at first reading: plain words, short sentences, terms explained.', 'يفهمه القارئ من القراءة الأولى: كلمات واضحة وجمل قصيرة ومصطلحات مشروحة.'],
  ['Usable', 'Readers can act on it: steps, examples, templates or checklists where they help.', 'يستطيع القارئ العمل به: خطوات وأمثلة ونماذج وقوائم تحقق حيث تفيد.'],
  ['Accuracy', 'Every factual statement is correct against its cited source (see the Claims sheet).', 'كل معلومة صحيحة مقارنة بمصدرها (انظر ورقة الادعاءات).'],
  ['Requirements vs. good practice', 'Something is called required or mandatory only where an official legal text says so; good practice is labeled as such.', 'لا يوصف شيء بالإلزامي إلا بنص رسمي؛ والممارسة الجيدة موصوفة بذلك.'],
  ['Standards', 'Standards are named with the correct current edition, summarized in own words, not copied.', 'المعايير مذكورة بإصدارها الحالي الصحيح وملخصة بصياغة خاصة دون نسخ.'],
  ['Currency of law', 'Laws, codes and their amendments are current on the review date (check the official text).', 'الأنظمة والقواعد وتعديلاتها سارية في تاريخ المراجعة (راجع النص الرسمي).'],
  ['No status claims', 'Nothing states or implies accreditation, approval, recognition or endorsement of LIV or its credentials.', 'لا يوجد ما يدّعي أو يوحي باعتماد LIV أو الاعتراف بها أو تأييدها.'],
  ['Research', 'Research is described with its method and limitations, and its license is respected.', 'الأبحاث معروضة بمنهجها وحدودها، وترخيصها محترم.'],
  ['Completeness', 'Nothing important for the stated scope is missing (list it in the comment).', 'لا ينقص شيء مهم ضمن النطاق المحدد (اذكره في الملاحظة).'],
  ['Balance', 'The text is neutral and free of commercial promotion.', 'النص محايد وخالٍ من الترويج التجاري.'],
];

const isTableOrHeading = (p) => /^(#|```|---)/.test(p);
const headingOf = (line) => (/^#{1,6}\s+(.+)$/.exec(line) || [])[1];

/** Pure: every statement a reviewer should check, with the section it sits in and the sources it cites. */
function claimsOf(body) {
  const out = []; let section = '';
  for (const p of paragraphs(body)) {
    const h = headingOf(p.split('\n')[0]); if (h) { section = h; continue; }
    if (isTableOrHeading(p)) continue;
    if (/^\|/.test(p)) {
      for (const row of p.split('\n')) {
        if (/^\|\s*-/.test(row) || /^\|\s*Document control/.test(row)) continue;
        const cites = [...row.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));
        const text = row.replace(/\[\d{1,3}\]/g, '').split('|').map((c) => c.trim()).filter(Boolean).join(' | ');
        if (cites.length) out.push({ section, text, cites, table: true });
      }
      continue;
    }
    for (const line of p.split('\n')) {
      const raw = line.replace(/^>\s?/, '');
      for (const s of raw.split(/(?<=[.!?])(?<!\b(?:No|Nos|Art|Arts|Dr|Mr|Ms|vs|e\.g|i\.e|U\.S)\.)\s+/)) {
        const cites = [...s.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));
        const text = sentencesOf(s)[0] || '';
        if (text) out.push({ section, text: text.replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim(), cites });
      }
    }
  }
  return out;
}

const header = (ws, cols) => {
  ws.columns = cols.map(([h, width]) => ({ header: h, width }));
  const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.alignment = { wrapText: true, vertical: 'middle' };
  r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};
const wrap = (ws) => ws.eachRow((row, i) => { if (i > 1) row.alignment = { wrapText: true, vertical: 'top' }; });
const list = (ws, col, from, to, values) => { for (let i = from; i <= to; i++) ws.getCell(`${col}${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${values.join(',')}"`] }; };

/** Builds the workbook for an article (DB row or library item) and its latest automated report (or null). */
async function buildReviewPack(a, report, { register = defaultSources() } = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'LIV Editorial'; wb.created = new Date();
  const sources = Array.isArray(a.sources) ? a.sources : [];

  const intro = wb.addWorksheet('Instructions');
  header(intro, [['Step', 8], ['English', 70], ['العربية', 70]]);
  [
    ['1', 'Read the whole text once as a reader would (Document sheet gives the link and the control block).', 'اقرأ النص كاملاً مرة كما يقرؤه القارئ (ورقة Document فيها الرابط وبيانات الوثيقة).'],
    ['2', 'On the Claims sheet, check each statement against the cited source and choose a verdict. Name the clause, article or page you checked.', 'في ورقة Claims تحقق من كل عبارة مقابل مصدرها واختر الحكم، واذكر البند أو المادة أو الصفحة التي راجعتها.'],
    ['3', 'Statements without a citation are listed too: confirm them from your expertise or ask for a source.', 'العبارات بلا مرجع مدرجة أيضاً: أكدها من خبرتك أو اطلب لها مصدراً.'],
    ['4', 'On the Sources sheet, open each source and confirm it is the right, current document.', 'في ورقة Sources افتح كل مصدر وتأكد أنه الوثيقة الصحيحة والسارية.'],
    ['5', 'Complete the Quality checklist and the Reviewer declaration, then return the file to LIV.', 'أكمل قائمة الجودة وإقرار المراجع ثم أعد الملف إلى LIV.'],
    ['', 'LIV publishes the item only after the named reviewer approves it. The reviewer\'s name and the review date appear on the published page.', 'لا تنشر LIV المادة إلا بعد اعتماد المراجع المسمّى، ويظهر اسمه وتاريخ المراجعة على الصفحة المنشورة.'],
  ].forEach((r) => intro.addRow(r)); wrap(intro);

  const doc = wb.addWorksheet('Document');
  header(doc, [['Field / الحقل', 32], ['Value / القيمة', 100]]);
  const control = {};
  for (const m of String(a.body_md || '').matchAll(/^\|\s*(Audience|Scope|Edition|Next review)\s*\|\s*(.+?)\s*\|$/gm)) control[m[1]] = m[2];
  [
    ['Title / العنوان', a.title], ['Type / النوع', a.kind], ['Topic / الموضوع', a.category], ['Jurisdiction / الاختصاص', a.jurisdiction || ''],
    ['Audience / الجمهور', control.Audience || ''], ['Scope / النطاق', control.Scope || ''], ['Edition / الإصدار', control.Edition || ''],
    ['Version on the site / رقم النسخة', a.version || 1], ['Next review / المراجعة القادمة', control['Next review'] || (a.next_review_at ? String(a.next_review_at).slice(0, 10) : '')],
    ['Standards referenced / المعايير', (a.standards || []).join(', ')], ['Summary / الملخص', a.summary],
    ['Prepared with AI assistance / بمساعدة الذكاء الاصطناعي', a.ai_assisted === false ? 'No' : 'Yes'],
    ['Automated review / المراجعة الآلية', report ? `${report.result}, score ${report.score}/100, ${(report.flags || []).length} finding(s)` : 'none'],
    ['Page slug / رابط الصفحة', a.slug ? `/knowledge/${a.slug}` : ''],
  ].forEach((r) => doc.addRow(r)); wrap(doc);

  const cl = wb.addWorksheet('Claims');
  header(cl, [['#', 6], ['Section / القسم', 24], ['Statement / العبارة', 70], ['Cites / المرجع', 10], ['Cited source / المصدر', 45], ['Verdict / الحكم', 22], ['Clause, article or page checked / البند أو المادة', 26], ['Correction or note / التصحيح أو الملاحظة', 45]]);
  const claims = claimsOf(a.body_md);
  claims.forEach((c, i) => cl.addRow([i + 1, c.section, c.text, c.cites.length ? c.cites.map((n) => `[${n}]`).join(' ') : 'none / بلا مرجع',
    c.cites.map((n) => (sources[n - 1] ? `[${n}] ${sources[n - 1].title}` : `[${n}] missing`)).join('\n'), '', '', '']));
  list(cl, 'F', 2, claims.length + 1, VERDICTS); wrap(cl);

  const so = wb.addWorksheet('Sources');
  header(so, [['#', 6], ['Title / العنوان', 55], ['Publisher and license / الناشر والترخيص', 32], ['Link / الرابط', 50], ['Accessed / تاريخ الوصول', 14], ['Trust tier / مستوى الثقة', 18], ['Opened and current? / فُتح وساري؟', 18], ['Note / ملاحظة', 40]]);
  sources.forEach((s, i) => {
    const t = publisherOf(s.url, register);
    const row = so.addRow([i + 1, s.title, s.publisher || '', s.url, s.accessed || '', t ? t.tier : 'not in register', '', '']);
    row.getCell(4).value = { text: s.url, hyperlink: s.url };
  });
  list(so, 'G', 2, sources.length + 1, YESNO); wrap(so);

  const ar = wb.addWorksheet('Automated review');
  header(ar, [['Level', 10], ['Check', 14], ['Finding', 80], ['Location', 50]]);
  (report && report.flags ? report.flags : []).forEach((f) => ar.addRow([f.severity, f.check, f.message, f.location || '']));
  if (!report || !(report.flags || []).length) ar.addRow(['', '', report ? 'No findings.' : 'No automated report for this version.', '']);
  wrap(ar);

  const qc = wb.addWorksheet('Quality checklist');
  header(qc, [['Criterion', 26], ['English', 60], ['العربية', 60], ['Result / النتيجة', 16], ['Comment / ملاحظة', 45]]);
  CHECKLIST.forEach((c) => qc.addRow([...c, '', '']));
  list(qc, 'D', 2, CHECKLIST.length + 1, YESNO); wrap(qc);

  const dec = wb.addWorksheet('Reviewer declaration');
  header(dec, [['Field / الحقل', 48], ['Entry / البيان', 80]]);
  [
    'Full name / الاسم الكامل', 'Qualification and specialty / المؤهل والتخصص', 'Organization / الجهة', 'Jurisdictions you are competent in / الاختصاصات القانونية',
    'Conflicts of interest with LIV or this subject (none, or describe) / تعارض المصالح', 'Overall decision / القرار', 'Conditions or required changes / الشروط أو التعديلات المطلوبة',
    'Date / التاريخ', 'Signature / التوقيع',
  ].forEach((f) => dec.addRow([f, '']));
  list(dec, 'B', 7, 7, DECISIONS);
  dec.addRow([]);
  dec.addRow(['I reviewed this text against the cited sources within my competence. I am not responsible for content outside it.', 'راجعت هذا النص مقابل مصادره ضمن نطاق اختصاصي، ولست مسؤولاً عما يقع خارجه.']);
  wrap(dec);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const packName = (a) => `review-pack-${a.slug || 'item'}-v${a.version || 1}.xlsx`;

module.exports = { buildReviewPack, claimsOf, packName, CHECKLIST };

import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { readFileBytes } from "./files";

export async function certificatePdf(cert: Record<string, any>, template: Record<string, any>, platform: Record<string, any>, verifyUrl: string): Promise<Buffer> {
  const paper = template.settings?.paper_size === "Letter" ? "LETTER" : "A4";
  const doc = new PDFDocument({ size: paper, layout: "landscape", margin: 0, info: { Title: `${cert.course_name} — ${cert.first_name} ${cert.last_name}`, Author: "LIV LLC", Subject: cert.cert_number } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => { doc.on("data", (b: Buffer) => chunks.push(b)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const w = doc.page.width, h = doc.page.height;
  const color = /^#[0-9a-f]{6}$/i.test(platform.primary_color) ? platform.primary_color : "#102943";
  const modern = template.design === "modern";
  doc.rect(0, 0, w, h).fill("#ffffff");
  if (modern) { doc.rect(0, 0, 24, h).fill(color); doc.rect(24, 0, w - 24, 10).fill(color); }
  else { doc.rect(22, 22, w - 44, h - 44).lineWidth(2).stroke(color); doc.rect(30, 30, w - 60, h - 60).lineWidth(0.5).stroke("#c5cbd2"); }
  doc.fillColor(color).font("Helvetica-Bold").fontSize(23).text("LIV", 55, 48, { width: 80 });
  doc.font("Helvetica").fontSize(8).text("LLC  |  TRAINING ACCREDITATION", 55, 76, { width: 220 });
  if (platform.logo_url) {
    try { doc.image(await readFileBytes(platform.logo_url), w - 190, 43, { fit: [125, 45], align: "right" }); }
    catch { /* Non-image logos are never fetched externally. The company name remains present. */ }
  }
  doc.font("Helvetica").fontSize(10).fillColor("#6b7785").text("CERTIFICATE OF COMPLETION", 50, 130, { width: w - 100, align: "center", characterSpacing: 3 });
  doc.font(modern ? "Helvetica-Bold" : "Times-Bold").fontSize(36).fillColor(color).text(`${cert.first_name} ${cert.last_name}`, 65, 166, { width: w - 130, align: "center" });
  doc.font("Helvetica").fontSize(12).fillColor("#667085").text("has successfully completed", 50, 228, { width: w - 100, align: "center" });
  doc.font("Helvetica-Bold").fontSize(24).fillColor(color).text(cert.course_name, 70, 258, { width: w - 140, align: "center" });
  doc.font("Helvetica").fontSize(11).fillColor("#667085").text(`Completed ${cert.completion_date}${cert.grade ? `   •   Grade: ${cert.grade}` : ""}`, 50, 317, { width: w - 100, align: "center" });
  doc.fontSize(12).fillColor(color).text(platform.company_name, 50, 345, { width: w - 100, align: "center" });
  doc.moveTo(65, h - 132).lineTo(275, h - 132).lineWidth(0.7).stroke("#ccd3dc");
  doc.font("Helvetica-Bold").fontSize(11).fillColor(color).text(template.signatory_name, 65, h - 120, { width: 225 });
  doc.font("Helvetica").fontSize(9).fillColor("#667085").text(template.signatory_title, 65, h - 102, { width: 225 });
  doc.roundedRect(w / 2 - 92, h - 137, 185, 53, 4).fill("#f0f3f6");
  doc.font("Helvetica-Bold").fontSize(10).fillColor(color).text("LIV LLC ACCREDITED PROVIDER", w / 2 - 90, h - 120, { width: 180, align: "center" });
  doc.font("Helvetica").fontSize(8).text("Secure digital credential", w / 2 - 90, h - 102, { width: 180, align: "center" });
  const qr = await QRCode.toBuffer(verifyUrl, { width: 160, margin: 0, errorCorrectionLevel: "M" });
  doc.image(qr, w - 140, h - 155, { width: 85, height: 85 });
  doc.fontSize(7).fillColor("#667085").text("SCAN TO VERIFY", w - 140, h - 65, { width: 85, align: "center" });
  doc.font("Helvetica").fontSize(8).text(`Certificate ID: ${cert.cert_number}    |    Issued: ${cert.issue_date}${cert.expiry_date ? `    |    Expires: ${cert.expiry_date}` : ""}`, 55, h - 43, { width: w - 110, align: "center" });
  doc.end();
  return output;
}
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Score } from '@/types';

/** Un partido ya resuelto: los nombres llegan hechos desde boot(). */
export interface ReceiptMatch {
  match_id:    string;
  home:        string | null;
  away:        string | null;
  group_label: string | null;
}

export interface ReceiptData {
  porraName:       string;
  tournament:      string;
  participantName: string;
  phaseName:       string;
  submittedAt:     Date;
  matches:         ReceiptMatch[];
  preds:           Record<string, Score>;
}

const NAVY  = [22,  31,  61]  as [number, number, number]; // --card
const MUTED = [139, 151, 196] as [number, number, number]; // --muted

function formatDate(d: Date): string {
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function generateReceipt(data: ReceiptData): void {
  const { porraName, tournament, participantName, phaseName, submittedAt, matches, preds } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Cabecera ───────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(tournament, 105, 14, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 190, 220);
  doc.text(porraName, 105, 22, { align: 'center' });

  doc.setTextColor(255, 180, 40); // accent2
  doc.setFontSize(9);
  doc.text('RESGUARDO DE PREDICCIONES', 105, 30, { align: 'center' });

  // ── Info del participante ──────────────────────────────────────────────
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const info = [
    ['Participante', participantName],
    ['Fase',         phaseName],
    ['Enviada',      formatDate(submittedAt)],
  ];

  let y = 48;
  for (const [label, value] of info) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 55, y);
    y += 7;
  }

  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  doc.line(20, y, 190, y);
  y += 6;

  // ── Tabla(s) de predicciones ───────────────────────────────────────────
  // Si la fase tiene grupos se saca una tabla por grupo; si no —una jornada
  // de liga, una eliminatoria— una sola tabla corrida.
  let totalFilled = 0;

  const fila = (m: ReceiptMatch) => {
    const p = preds[m.match_id];
    const relleno = p?.home != null && p?.away != null;
    if (relleno) totalFilled++;
    return [
      m.match_id,
      m.home ?? '—',
      m.away ?? '—',
      relleno ? `${p.home} – ${p.away}` : '—',
    ];
  };

  const estilo = (primeraColumna: number, ultima: number) => ({
    styles:       { fontSize: 9, cellPadding: 2.5 },
    headStyles:   { fillColor: NAVY, textColor: 255, fontStyle: 'bold' as const },
    columnStyles: {
      0: { cellWidth: primeraColumna },
      3: { cellWidth: ultima, halign: 'center' as const, fontStyle: 'bold' as const },
    },
    alternateRowStyles: { fillColor: [245, 247, 255] as [number, number, number] },
    margin: { left: 20, right: 20 },
  });

  const finalY = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  const grupos = [...new Set(matches.map(m => m.group_label).filter(Boolean))].sort() as string[];

  if (grupos.length) {
    for (const g of grupos) {
      autoTable(doc, {
        startY: y,
        head: [[`Grupo ${g}`, 'Local', 'Visitante', 'Pronóstico']],
        body: matches.filter(m => m.group_label === g).map(fila),
        ...estilo(20, 24),
      });
      y = finalY();
    }
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Partido', 'Local', 'Visitante', 'Pronóstico']],
      body: matches.map(fila),
      ...estilo(24, 28),
    });
    y = finalY();
  }

  // ── Resumen final ──────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED);
  doc.text(`${totalFilled} de ${matches.length} partidos rellenados.`, 20, y + 4);

  // ── Pie de página en todas las páginas ────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(
      `${tournament} · ${porraName} · Página ${i} de ${pages}`,
      105, 290, { align: 'center' }
    );
  }

  // ── Guardar ───────────────────────────────────────────────────────────
  const safeName = participantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const safePhase = phaseName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  doc.save(`resguardo-${safePhase}-${safeName}.pdf`);
}

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { matchesOfPhase, matchesOfGroup, GROUP_LETTERS } from './fixture';
import type { Score } from '@/types';

export interface ReceiptData {
  porraName:       string;
  tournament:      string;
  participantName: string;
  phaseId:         string;
  phaseName:       string;
  submittedAt:     Date;
  preds:           Record<string, Score>;
  bracket:         Record<string, { home: string; away: string }>;
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
  const { porraName, tournament, participantName, phaseId, phaseName, submittedAt, preds, bracket } = data;
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

  // ── Tabla de predicciones ──────────────────────────────────────────────
  let totalFilled = 0;
  let totalMatches = 0;

  if (phaseId === 'GROUPS') {
    // Una tabla por grupo
    for (const g of GROUP_LETTERS) {
      const matches = matchesOfGroup(g);
      const rows = matches.map(m => {
        totalMatches++;
        const p = preds[m.id];
        const filled = p?.home != null && p?.away != null;
        if (filled) totalFilled++;
        return [
          m.id,
          m.home,
          m.away,
          filled ? `${p.home} – ${p.away}` : '—',
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [[`Grupo ${g}`, 'Local', 'Visitante', 'Pronóstico']],
        body: rows,
        styles:       { fontSize: 8.5, cellPadding: 2 },
        headStyles:   { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 14 }, 3: { cellWidth: 24, halign: 'center', fontStyle: 'bold' } },
        alternateRowStyles: { fillColor: [245, 247, 255] },
        margin: { left: 20, right: 20 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    }
  } else {
    const matches = matchesOfPhase(phaseId);
    const rows = matches.map(m => {
      totalMatches++;
      const b   = bracket[m.id];
      const home = b?.home || m.home;
      const away = b?.away || m.away;
      const p   = preds[m.id];
      const filled = p?.home != null && p?.away != null;
      if (filled) totalFilled++;
      return [
        m.id,
        home,
        away,
        filled ? `${p.home} – ${p.away}` : '—',
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['Partido', 'Local', 'Visitante', 'Pronóstico']],
      body: rows,
      styles:       { fontSize: 9, cellPadding: 2.5 },
      headStyles:   { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 20 }, 3: { cellWidth: 28, halign: 'center', fontStyle: 'bold' } },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      margin: { left: 20, right: 20 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ── Resumen final ──────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED);
  doc.text(`${totalFilled} de ${totalMatches} partidos rellenados.`, 20, y + 4);

  // ── Pie de página en todas las páginas ────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(
      `Porra Mundial 2026 · ${porraName} · Página ${i} de ${pages}`,
      105, 290, { align: 'center' }
    );
  }

  // ── Guardar ───────────────────────────────────────────────────────────
  const safeName = participantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const safePhase = phaseName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  doc.save(`resguardo-${safePhase}-${safeName}.pdf`);
}

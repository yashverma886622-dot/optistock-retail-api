import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const TOKEN_KEY = 'optistock_jwt_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path.startsWith('/') ? path : `/${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Unexpected response format' };
  }

  if (!res.ok) {
    throw new ApiError(
      String(data.error || `Request failed with status ${res.status}`),
      res.status,
      data.code ? String(data.code) : undefined,
      data.details
    );
  }

  return data as T;
}

export function formatINR(value: number | null | undefined, maximumFractionDigits = 0): string {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits,
  }).format(num);
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return '0';
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(num);
}

export function formatDateIN(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function exportToCSV(filename: string, columns: string[], rows: Array<Record<string, unknown>>) {
  const escapeCell = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [
    columns.map(escapeCell).join(','),
    ...rows.map((row) => columns.map((col) => escapeCell(row[col])).join(',')),
  ];

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToPDF(
  title: string,
  subtitle: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  filename: string
) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 18);

  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${subtitle} · Generated ${new Date().toLocaleString('en-IN')}`, 14, 25);

  autoTable(doc, {
    startY: 31,
    head: [columns],
    body: rows.map((r) => columns.map((c) => String(r[c] ?? ''))),
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 33, 62], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`${filename}.pdf`);
}

import { useRef, type ReactNode } from 'react';

import { downloadBlob } from '../../utils/downloadBlob';
import { toast } from '../../utils/toast';
import { Button } from '../common/Button';

interface EntityToolbarProps {
  /** Search box, saved-filter chips, etc. — rendered to the left. */
  children?: ReactNode;
  onRefresh?: () => void;
  /** Wire to `api.exportExcel()` — downloads the server-generated .xlsx. */
  onExportExcel?: () => Promise<Blob>;
  exportFilenamePrefix?: string;
  /** Client-side CSV export of the currently-loaded page (server export is Excel-only). */
  onExportCsv?: () => void;
  /** Wire to a Products-style `POST /import` multipart endpoint. Omit to hide the Import button. */
  onImportExcel?: (file: File) => Promise<void>;
}

/**
 * Refresh / Export Excel / Export CSV / Import Excel — the toolbar row every
 * "Standard CRUD Design" admin list page needs per Prompt 5, built once and
 * dropped into `DataTable`'s `toolbar` slot alongside a page's own search bar.
 */
export function EntityToolbar({
  children,
  onRefresh,
  onExportExcel,
  exportFilenamePrefix = 'export',
  onExportCsv,
  onImportExcel,
}: EntityToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExportExcel() {
    if (!onExportExcel) return;
    try {
      const blob = await onExportExcel();
      downloadBlob(blob, `${exportFilenamePrefix}-${Date.now()}.xlsx`);
    } catch {
      toast.error('Export failed');
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImportExcel) return;
    try {
      await onImportExcel(file);
      toast.success('Import completed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {onRefresh && (
        <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      )}
      {onExportCsv && (
        <Button type="button" variant="outline" size="sm" onClick={onExportCsv}>
          Export CSV
        </Button>
      )}
      {onExportExcel && (
        <Button type="button" variant="outline" size="sm" onClick={handleExportExcel}>
          Export Excel
        </Button>
      )}
      {onImportExcel && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Import Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileSelected}
          />
        </>
      )}
    </div>
  );
}

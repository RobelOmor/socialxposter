import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileSpreadsheet, Loader2, Download, CheckCircle2 } from 'lucide-react';

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  accountLimit: number | null;
  currentAccountCount: number;
}

interface ImportResult {
  previousCount: number;
  insertedCount: number;
  duplicateCount: number;
  duplicates: string[];
}

export function BulkImportDialog({ 
  open, 
  onOpenChange, 
  onComplete,
  accountLimit,
  currentAccountCount
}: BulkImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [cookies, setCookies] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const resetState = () => {
    setFile(null);
    setColumns([]);
    setSelectedColumn('');
    setCookies([]);
    setIsProcessing(false);
    setProgress(0);
    setResult(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      '.xlsx',
      '.xls'
    ];
    
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      toast.error('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setFile(selectedFile);
    setSelectedColumn('');
    setCookies([]);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1');
        
        const cols: string[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          cols.push(XLSX.utils.encode_col(c));
        }
        setColumns(cols);
      } catch (error) {
        toast.error('Failed to parse Excel file');
        setFile(null);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleColumnSelect = (column: string) => {
    setSelectedColumn(column);
    setCookies([]);
    setResult(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1');
        
        const colIndex = XLSX.utils.decode_col(column);
        const extractedCookies: string[] = [];
        
        for (let r = range.s.r; r <= range.e.r; r++) {
          const cellAddress = XLSX.utils.encode_cell({ r, c: colIndex });
          const cell = firstSheet[cellAddress];
          if (cell && cell.v) {
            const value = String(cell.v).trim();
            if (value && value.includes('sessionid')) {
              extractedCookies.push(value);
            }
          }
        }
        
        setCookies(extractedCookies);
      } catch (error) {
        toast.error('Failed to read column data');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleStartAdding = async () => {
    if (cookies.length === 0) {
      toast.error('No valid cookies found');
      return;
    }

    // Check account limit
    if (accountLimit !== null) {
      const availableSlots = accountLimit - currentAccountCount;
      if (availableSlots <= 0) {
        toast.error('Account limit reached. Upgrade to add more.');
        return;
      }
      if (cookies.length > availableSlots) {
        toast.error(`Only ${availableSlots} slots available. Reduce cookie count or upgrade.`);
        return;
      }
    }

    setIsProcessing(true);
    setProgress(0);
    
    const previousCount = currentAccountCount;
    const duplicates: string[] = [];
    let insertedCount = 0;
    const chunkSize = 5;
    const totalChunks = Math.ceil(cookies.length / chunkSize);

    for (let i = 0; i < cookies.length; i += chunkSize) {
      const chunk = cookies.slice(i, i + chunkSize);
      
        const results = await Promise.allSettled(
          chunk.map(async (cookie) => {
            try {
              const { data, error } = await supabase.functions.invoke('import-instagram-session', {
                body: { cookies: cookie }
              });
              
              if (error) throw error;
              
              if (data.success) {
                return { success: true, cookie };
              } else if (data.duplicate || data.error?.includes('already connected')) {
                return { success: false, duplicate: true, cookie };
              } else {
                return { success: false, duplicate: false, cookie, error: data.error };
              }
            } catch (err: unknown) {
              const errorMessage = err instanceof Error ? err.message : 'Unknown error';
              if (errorMessage.includes('already') || errorMessage.includes('duplicate')) {
                return { success: false, duplicate: true, cookie };
              }
              return { success: false, duplicate: false, cookie };
            }
          })
        );

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            insertedCount++;
          } else if (result.value.duplicate) {
            duplicates.push(result.value.cookie);
          }
        }
      });

      const currentChunk = Math.floor(i / chunkSize) + 1;
      setProgress(Math.round((currentChunk / totalChunks) * 100));
    }

    setResult({
      previousCount,
      insertedCount,
      duplicateCount: duplicates.length,
      duplicates
    });
    
    setIsProcessing(false);
    
    if (insertedCount > 0) {
      toast.success(`Successfully added ${insertedCount} accounts!`);
      onComplete();
    }
  };

  const downloadDuplicates = () => {
    if (!result?.duplicates.length) return;

    const wb = XLSX.utils.book_new();
    const wsData = result.duplicates.map(cookie => [cookie]);
    const ws = XLSX.utils.aoa_to_sheet([['Duplicate Cookies'], ...wsData]);
    XLSX.utils.book_append_sheet(wb, ws, 'Duplicates');
    XLSX.writeFile(wb, 'duplicate_cookies.xlsx');
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!isProcessing) { resetState(); onOpenChange(value); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Bulk Import Accounts
          </DialogTitle>
          <DialogDescription>
            Import multiple Instagram accounts from Excel file
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Select Excel File (.xlsx, .xls)</Label>
            <div 
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => document.getElementById('excel-upload')?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to select Excel file
                  </p>
                </>
              )}
              <input
                id="excel-upload"
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
                disabled={isProcessing}
              />
            </div>
          </div>

          {/* Column Selection */}
          {columns.length > 0 && (
            <div className="space-y-2">
              <Label>Select Column with Cookies</Label>
              <Select value={selectedColumn} onValueChange={handleColumnSelect} disabled={isProcessing}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column (A, B, C...)" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>
                      Column {col}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Cookie Count */}
          {selectedColumn && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm">
                Found <span className="font-bold text-primary">{cookies.length}</span> valid cookies in Column {selectedColumn}
              </p>
            </div>
          )}

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">Adding accounts...</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{progress}% complete</p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Import Complete!</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p>Previous accounts: <span className="font-bold">{result.previousCount}</span></p>
                <p>Newly added: <span className="font-bold text-green-500">{result.insertedCount}</span></p>
                <p>Duplicates skipped: <span className="font-bold text-yellow-500">{result.duplicateCount}</span></p>
              </div>
              {result.duplicateCount > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2 gap-2"
                  onClick={downloadDuplicates}
                >
                  <Download className="h-4 w-4" />
                  Download Duplicates
                </Button>
              )}
            </div>
          )}

          {/* Action Button */}
          {!isProcessing && !result && selectedColumn && cookies.length > 0 && (
            <Button onClick={handleStartAdding} className="w-full">
              Start Adding
            </Button>
          )}

          {result && (
            <Button 
              onClick={() => { resetState(); onOpenChange(false); }} 
              className="w-full"
            >
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

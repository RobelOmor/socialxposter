import { useState, useEffect, useRef } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  ImagePlus, 
  Copy, 
  Server, 
  FileText,
  Upload,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  Trash2
} from 'lucide-react';

interface PhotoServiceCategory {
  id: string;
  name: string;
  status: string;
  photo_count: number;
  created_at: string;
  updated_at: string;
}

interface UploadReport {
  previousCount: number;
  insertedCount: number;
  currentCount: number;
  duplicateCount: number;
  duplicates: string[];
}

export default function AdminPhotoServer() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [categories, setCategories] = useState<PhotoServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PhotoServiceCategory | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadReport, setUploadReport] = useState<UploadReport | null>(null);

  useEffect(() => {
    if (user) {
      fetchCategories();
    }
  }, [user]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('photo_service_categories')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive"
      });
      return;
    }

    setCreating(true);
    try {
      const { error } = await supabase
        .from('photo_service_categories')
        .insert({ name: newCategoryName.trim() });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Category created successfully"
      });
      setNewCategoryName('');
      setAddCategoryOpen(false);
      fetchCategories();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({
      title: "Copied",
      description: "Service ID copied to clipboard"
    });
  };

  const handleOpenUploadDialog = (category: PhotoServiceCategory) => {
    setSelectedCategory(category);
    setUploadFile(null);
    setPhotoUrls([]);
    setUploadReport(null);
    setUploadProgress(0);
    setUploadDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      toast({
        title: "Error",
        description: "Please select a .txt file",
        variant: "destructive"
      });
      return;
    }

    setUploadFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const urls = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && (line.startsWith('http://') || line.startsWith('https://')));
      setPhotoUrls(urls);
    };
    reader.readAsText(file);
  };

  const handleStartUpload = async () => {
    if (!selectedCategory || photoUrls.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    const previousCount = selectedCategory.photo_count;
    let insertedCount = 0;
    let duplicateCount = 0;
    const chunkSize = 100;
    const totalChunks = Math.ceil(photoUrls.length / chunkSize);

    try {
      // Get existing URLs for this category to detect duplicates
      const { data: existingItems } = await supabase
        .from('photo_service_items')
        .select('photo_url')
        .eq('category_id', selectedCategory.id);
      
      const existingUrls = new Set(existingItems?.map(item => item.photo_url) || []);
      
      // Filter out duplicates
      const newUrls: string[] = [];
      const duplicates: string[] = [];
      
      for (const url of photoUrls) {
        if (existingUrls.has(url)) {
          duplicates.push(url);
        } else {
          newUrls.push(url);
          existingUrls.add(url); // Prevent duplicates within the file itself
        }
      }
      
      duplicateCount = duplicates.length;
      
      // Batch insert new URLs in chunks
      const newTotalChunks = Math.ceil(newUrls.length / chunkSize);
      
      for (let i = 0; i < newTotalChunks; i++) {
        const chunk = newUrls.slice(i * chunkSize, (i + 1) * chunkSize);
        
        // Prepare batch data
        const batchData = chunk.map(url => ({
          category_id: selectedCategory.id,
          photo_url: url
        }));
        
        // Batch insert all at once
        const { error, data } = await supabase
          .from('photo_service_items')
          .insert(batchData)
          .select();

        if (!error && data) {
          insertedCount += data.length;
        }

        setUploadProgress(Math.round(((i + 1) / newTotalChunks) * 100));
      }

      // Get updated count
      const { data: updatedCategory } = await supabase
        .from('photo_service_categories')
        .select('photo_count')
        .eq('id', selectedCategory.id)
        .maybeSingle();

      setUploadReport({
        previousCount,
        insertedCount,
        currentCount: updatedCategory?.photo_count || previousCount + insertedCount,
        duplicateCount,
        duplicates
      });

      fetchCategories();
      
      toast({
        title: "Upload Complete",
        description: `Inserted ${insertedCount} photos, ${duplicateCount} duplicates skipped`
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadDuplicates = () => {
    if (!uploadReport?.duplicates.length) return;
    
    const blob = new Blob([uploadReport.duplicates.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `duplicates_${selectedCategory?.name}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category and all its photos?')) return;

    try {
      const { error } = await supabase
        .from('photo_service_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Category deleted successfully"
      });
      fetchCategories();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  if (authLoading || loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Server className="h-8 w-8 text-primary" />
              Photo Server
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage photo service categories and upload photos
            </p>
          </div>
          
          <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Photo Service Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Photo Service Category</DialogTitle>
                <DialogDescription>
                  Create a new category to organize your photo services
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="categoryName">Category Name</Label>
                  <Input
                    id="categoryName"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Enter category name"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddCategoryOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateCategory} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Category'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Categories Table */}
        <Card>
          <CardHeader>
            <CardTitle>Service Categories</CardTitle>
            <CardDescription>
              Click on service ID to copy. Status shows "Available" for categories with photos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Service Name</TableHead>
                  <TableHead>Service ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Photo Count</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No categories found. Create one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  categories.map((category, index) => (
                    <TableRow key={category.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleCopyId(category.id)}
                          className="flex items-center gap-2 text-xs font-mono bg-secondary px-2 py-1 rounded hover:bg-secondary/80 transition-colors"
                        >
                          {category.id.slice(0, 8)}...
                          <Copy className="h-3 w-3" />
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={category.status === 'available' ? 'default' : 'secondary'}
                          className={category.status === 'available' ? 'bg-green-500/20 text-green-400' : ''}
                        >
                          {category.status === 'available' ? 'Available' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>{category.photo_count}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(category.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenUploadDialog(category)}
                            className="gap-1"
                          >
                            <ImagePlus className="h-4 w-4" />
                            Add Photos
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCategory(category.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Photos to: {selectedCategory?.name}
              </DialogTitle>
              <DialogDescription>
                Select a .txt file with photo URLs (one URL per line)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* File Input */}
              <div className="space-y-2">
                <Label>Select Notepad File (.txt)</Label>
                <div className="flex gap-2">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt"
                    onChange={handleFileSelect}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Row Count */}
              {uploadFile && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>File: {uploadFile.name}</span>
                  <Badge variant="outline">{photoUrls.length} URLs found</Badge>
                </div>
              )}

              {/* Progress Bar */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {/* Upload Report */}
              {uploadReport && (
                <Card className="bg-secondary/50">
                  <CardContent className="pt-4 space-y-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Upload Report
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Previous Count:</div>
                      <div className="font-medium">{uploadReport.previousCount}</div>
                      <div>Inserted:</div>
                      <div className="font-medium text-green-500">{uploadReport.insertedCount}</div>
                      <div>Current Count:</div>
                      <div className="font-medium">{uploadReport.currentCount}</div>
                      <div>Duplicates:</div>
                      <div className="font-medium text-yellow-500">{uploadReport.duplicateCount}</div>
                    </div>
                    
                    {uploadReport.duplicateCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadDuplicates}
                        className="w-full gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download Duplicates ({uploadReport.duplicateCount})
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                Close
              </Button>
              <Button 
                onClick={handleStartUpload} 
                disabled={uploading || photoUrls.length === 0}
                className="gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Start Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
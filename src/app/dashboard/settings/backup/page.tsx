
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Download, Upload, FileJson, Loader2, AlertTriangle } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { collection, getDocs, doc, writeBatch, deleteDoc } from 'firebase/firestore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { SeedDatabaseButton } from './_components/seed-database-button';

const collectionsToBackup = [
  'users',
  'products',
  'productCategories',
  'orders',
  'posts',
  'company',
  'supportSettings',
  'faqs',
  'helpGuides',
  'helpDownloads',
  'supportCallbacks',
  'coa_groups',
  'coa_ledgers',
  'journalVouchers',
  'coupons',
  'offers',
  'parties',
  'onboarding',
  'offboarding',
  'reimbursementRequests',
  'gateLog',
  'vacancies',
  'applicants',
  'leads',
  'quotations',
  'purchaseRequests',
  'grns',
  'workOrders',
  'productionTaskTemplates',
  'productionAssignments',
  'serviceRequests',
  'registeredProducts',
  'boms',
  'pickupPoints',
  'locations',
  'counters'
];

export default function BackupPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDownloadBackup = async () => {
    setIsDownloading(true);
    toast({ title: 'Starting Backup', description: 'Fetching data from all collections...' });

    const backupData: Record<string, any[]> = {};
    let totalDocs = 0;

    try {
      for (const collectionName of collectionsToBackup) {
        const querySnapshot = await getDocs(collection(firestore, collectionName));
        const docs = querySnapshot.docs.map(d => ({ _id: d.id, ...d.data() }));
        if (docs.length > 0) {
            backupData[collectionName] = docs;
            totalDocs += docs.length;
        }
      }

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `firebase-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Download Complete',
        description: `Successfully backed up ${totalDocs} documents from ${Object.keys(backupData).length} collections.`,
      });
    } catch (error) {
      console.error("Backup failed:", error);
      toast({
        variant: 'destructive',
        title: 'Backup Failed',
        description: 'Could not download data. Check the console for errors.',
      });
    } finally {
      setIsDownloading(false);
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/json') {
        toast({ variant: 'destructive', title: 'Invalid File Type', description: 'Please select a valid JSON backup file.' });
        return;
      }
      setUploadFile(file);
    }
  };

  const handleRestoreBackup = async () => {
    if (!uploadFile) {
        toast({ variant: 'destructive', title: 'No File Selected' });
        return;
    }
    setIsUploading(true);
    toast({ title: 'Starting Restore', description: 'Please do not close this window.' });

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const backupData = JSON.parse(event.target?.result as string);
            const collectionsInBackup = Object.keys(backupData);

            for (const collectionName of collectionsInBackup) {
                // Clear existing collection
                const querySnapshot = await getDocs(collection(firestore, collectionName));
                const deleteBatch = writeBatch(firestore);
                querySnapshot.docs.forEach(d => deleteBatch.delete(d.ref));
                await deleteBatch.commit();
                
                // Write new data
                const restoreBatch = writeBatch(firestore);
                const docsToRestore = backupData[collectionName];
                docsToRestore.forEach((docData: { _id: string }) => {
                    const { _id, ...data } = docData;
                    const docRef = doc(firestore, collectionName, _id);
                    restoreBatch.set(docRef, data);
                });
                await restoreBatch.commit();
            }

            toast({ title: 'Restore Complete', description: 'All data has been restored from the backup file.' });
        } catch (error) {
            console.error("Restore failed:", error);
            toast({ variant: 'destructive', title: 'Restore Failed', description: 'Invalid JSON file or error writing to database.' });
        } finally {
            setIsUploading(false);
            setUploadFile(null);
        }
    };
    reader.readAsText(uploadFile);
  };


  return (
    <>
      <PageHeader title="Backup & Restore" />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Download Backup</CardTitle>
            <CardDescription>
              Download a complete JSON backup of your entire Firestore database.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              This will fetch all documents from all known collections and compile them into a single JSON file. This process may take a few moments depending on the size of your database.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={handleDownloadBackup} disabled={isDownloading}>
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download All Data
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload & Restore Backup</CardTitle>
            <CardDescription>
              Restore the database from a previously downloaded JSON backup file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-destructive mr-3 mt-1" />
                    <div>
                        <h4 className="font-bold text-destructive">Warning</h4>
                        <p className="text-sm text-destructive/80">This is a destructive action. Restoring a backup will first **delete all current data** in the database before uploading the new data. Proceed with caution.</p>
                    </div>
                </div>
            </div>
            <div>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                <FileJson className="mr-2 h-4 w-4" /> {uploadFile ? uploadFile.name : 'Select Backup File (.json)'}
              </Button>
            </div>
          </CardContent>
          <CardFooter>
             <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!uploadFile || isUploading}>
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Restore from Backup
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all current data and replace it with the data from the file <span className="font-medium">{uploadFile?.name}</span>. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRestoreBackup}>
                    Yes, Restore Database
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Database Seeding</CardTitle>
                <CardDescription>
                Populate a clean database with essential starting data.
                </CardDescription>
            </CardHeader>
            <CardContent>
                 <p className="text-sm text-muted-foreground mb-4">
                 Use this if you have an empty database. It will create the default Chart of Accounts and other necessary master data to make the app functional. This is a one-time action.
                </p>
            </CardContent>
            <CardFooter>
                <SeedDatabaseButton />
            </CardFooter>
        </Card>
      </div>
    </>
  );
}

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, RefreshCw, AlertCircle, Clock, Package } from "lucide-react";

interface SyncStatusNotificationProps {
  vendorId?: number;
  enabled?: boolean;
}

export function SyncStatusNotification({ vendorId, enabled = true }: SyncStatusNotificationProps) {
  const { toast } = useToast();
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [lastCompletedJob, setLastCompletedJob] = useState<any>(null);

  // Query sync jobs
  const { data: syncJobs = [] } = useQuery({
    queryKey: ["/api/sync/jobs"],
    enabled: enabled,
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Filter jobs for specific vendor if provided
  const relevantJobs = vendorId 
    ? syncJobs.filter((job: any) => job.vendorId === vendorId)
    : syncJobs;

  // Get current running job
  const runningJob = relevantJobs.find((job: any) => job.status === 'running');

  // Check for newly completed jobs
  useEffect(() => {
    const completedJobs = relevantJobs.filter((job: any) => 
      job.status === 'completed' || job.status === 'failed'
    );
    
    if (completedJobs.length > 0) {
      const latestCompleted = completedJobs.sort((a: any, b: any) => 
        new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime()
      )[0];

      // Show notification for newly completed job
      if (lastCompletedJob?.id !== latestCompleted.id) {
        setLastCompletedJob(latestCompleted);
        
        if (latestCompleted.status === 'completed') {
          toast({
            title: "Sync Completed",
            description: `Successfully synced products for vendor. Click to view details.`,
            action: (
              <Button size="sm" onClick={() => setShowDetailsDialog(true)}>
                View Details
              </Button>
            ),
          });
        } else if (latestCompleted.status === 'failed') {
          toast({
            title: "Sync Failed",
            description: "There was an error syncing products. Click to view details.",
            variant: "destructive",
            action: (
              <Button size="sm" variant="outline" onClick={() => setShowDetailsDialog(true)}>
                View Details
              </Button>
            ),
          });
        }
      }
    }
  }, [relevantJobs, lastCompletedJob, toast]);

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.round(duration / 60)}m`;
    return `${Math.round(duration / 3600)}h`;
  };

  const getJobStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <>
      {/* Running sync progress (floating notification) */}
      {runningJob && (
        <div className="fixed bottom-4 right-4 z-50">
          <Card className="w-80 shadow-lg border-blue-200 bg-blue-50">
            <CardHeader className="pb-2">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <CardTitle className="text-sm">Syncing Products</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Progress value={runningJob.progress || 0} className="h-2" />
                <div className="flex justify-between text-xs text-gray-600">
                  <span>{runningJob.processedItems || 0} processed</span>
                  <span>{runningJob.progress || 0}%</span>
                </div>
                <div className="text-xs text-gray-500">
                  Started {formatDuration(runningJob.startedAt || runningJob.createdAt)} ago
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sync results dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              {lastCompletedJob && getJobStatusIcon(lastCompletedJob.status)}
              <span>Sync {lastCompletedJob?.status === 'completed' ? 'Complete' : 'Failed'}</span>
            </DialogTitle>
            <DialogDescription>
              Sync results for vendor products
            </DialogDescription>
          </DialogHeader>

          {lastCompletedJob && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">
                    {lastCompletedJob.processedItems || 0}
                  </div>
                  <div className="text-xs text-green-600">Processed</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-700">
                    {formatDuration(
                      lastCompletedJob.startedAt || lastCompletedJob.createdAt,
                      lastCompletedJob.completedAt
                    )}
                  </div>
                  <div className="text-xs text-blue-600">Duration</div>
                </div>
              </div>

              {/* Status Details */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Status</span>
                  <Badge variant={lastCompletedJob.status === 'completed' ? 'default' : 'destructive'}>
                    {lastCompletedJob.status}
                  </Badge>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Progress</span>
                  <span className="text-sm font-medium">{lastCompletedJob.progress || 0}%</span>
                </div>

                {lastCompletedJob.completedAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Completed</span>
                    <span className="text-sm">{new Date(lastCompletedJob.completedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Error Details */}
              {lastCompletedJob.status === 'failed' && lastCompletedJob.errors && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium text-red-800">Errors</span>
                  </div>
                  <div className="text-xs text-red-700">
                    {Array.isArray(lastCompletedJob.errors) 
                      ? lastCompletedJob.errors.join(', ')
                      : lastCompletedJob.errors}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex space-x-2 pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowDetailsDialog(false)}
                  className="flex-1"
                >
                  Close
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => {
                    window.location.href = '/products';
                  }}
                  className="flex-1"
                >
                  <Package className="w-4 h-4 mr-1" />
                  View Products
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
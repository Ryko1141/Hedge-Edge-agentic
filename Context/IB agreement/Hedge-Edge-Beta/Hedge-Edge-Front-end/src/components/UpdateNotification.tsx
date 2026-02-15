import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download, RotateCcw } from 'lucide-react';

interface UpdateInfo {
    version: string;
    releaseDate?: string;
    releaseNotes?: string;
}

export function UpdateNotification() {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateVersion, setUpdateVersion] = useState('');
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [downloaded, setDownloaded] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const bridge = (window as any).electronAPI?.updater;

    useEffect(() => {
        if (!bridge) return;

        bridge.onUpdateAvailable?.((info: UpdateInfo) => {
            setUpdateAvailable(true);
            setUpdateVersion(info.version);
            setDismissed(false);
        });

        bridge.onDownloadProgress?.((prog: { percent: number }) => {
            setProgress(Math.round(prog.percent));
        });

        bridge.onUpdateDownloaded?.(() => {
            setDownloaded(true);
            setDownloading(false);
        });
    }, [bridge]);

    if (!updateAvailable || !bridge || dismissed) return null;

    const handleDownload = async () => {
        setDownloading(true);
        await bridge.downloadUpdate();
    };

    const handleInstall = () => {
        bridge.installUpdate();
    };

    return (
        <div className="fixed bottom-4 right-4 bg-background border border-border rounded-lg shadow-lg p-4 max-w-sm z-50">
            <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-sm">
                    Update Available — v{updateVersion}
                </h4>
                <button
                    onClick={() => setDismissed(true)}
                    className="text-muted-foreground hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-3">
                {downloaded ? (
                    <Button size="sm" onClick={handleInstall} className="w-full">
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Restart & Install
                    </Button>
                ) : downloading ? (
                    <div className="space-y-2">
                        <div className="w-full bg-muted rounded-full h-2">
                            <div
                                className="bg-primary h-2 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                            Downloading... {progress}%
                        </p>
                    </div>
                ) : (
                    <Button size="sm" variant="outline" onClick={handleDownload} className="w-full">
                        <Download className="h-4 w-4 mr-2" />
                        Download Update
                    </Button>
                )}
            </div>
        </div>
    );
}

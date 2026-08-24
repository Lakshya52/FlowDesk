import * as React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
  }
}

declare module 'lucide-react';
declare module 'recharts';
declare module 'socket.io-client';
declare module 'react-router-dom';

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      reload: () => void;
      restartAndInstall: () => void;
      dismissUpdate: () => void;
      onDownloadProgress: (callback: (progress: any) => void) => void;
      onUpdateDownloaded: (callback: (info: any) => void) => void;
      focusApp: () => void;
      showNotification: (data: any) => void;
      onNavigate: (callback: (link: string) => void) => void;
      onGoogleAuthSuccess: (callback: () => void) => void;
      removeGoogleAuthListener: () => void;
      /** E2EE: OS-keychain-encrypted storage (Electron safeStorage). */
      secureSave?: (key: string, value: string) => Promise<boolean>;
      secureRead?: (key: string) => Promise<string | null>;
    };
  }
}

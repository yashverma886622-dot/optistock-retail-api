import { useState } from 'react';
import { Database, RefreshCw, AlertCircle, CheckCircle2, Terminal } from 'lucide-react';
import { DbHealth } from '../types/index.ts';

export function DatabaseSetupGate({
  dbHealth,
  onRetry,
}: {
  dbHealth: DbHealth;
  onRetry: () => Promise<DbHealth>;
}) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
            <Database className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900">
              MongoDB Atlas Connection Required
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              OptiStock Retail requires a live MongoDB Atlas database via <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">MONGODB_URI</code>. No simulated or localStorage database fallback is used.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Current Status: {dbHealth.status.toUpperCase()}</p>
            <p className="mt-0.5 text-amber-800">{dbHealth.message}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4 text-sm text-slate-700">
          <h2 className="text-sm font-semibold text-slate-900">Setup Instructions</h2>
          <ol className="list-decimal list-inside space-y-2.5 text-xs leading-relaxed text-slate-600">
            <li>
              Create a free or dedicated cluster in <strong>MongoDB Atlas</strong> and whitelist network access (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">0.0.0.0/0</code> for cloud preview environments).
            </li>
            <li>
              Copy your connection string:
              <div className="mt-1.5 rounded-lg bg-slate-900 text-slate-100 p-3 font-mono text-xs overflow-x-auto">
                MONGODB_URI="mongodb+srv://&lt;username&gt;:&lt;password&gt;@cluster0.xxxxx.mongodb.net/optistock_retail?retryWrites=true&amp;w=majority"
              </div>
            </li>
            <li>
              Add <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">MONGODB_URI</code> and <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">JWT_SECRET</code> to your environment secrets (or <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">.env</code> locally) and restart or retry connection.
            </li>
            <li>
              Once connected, seed the 55-product Indian retail dataset via the in-app bootstrap button or run:
              <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800">
                <Terminal className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <span>npm run seed</span>
              </div>
            </li>
          </ol>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-slate-400" />
            <span>Last checked: {new Date(dbHealth.lastCheckedAt).toLocaleTimeString('en-IN')}</span>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Checking Connection...' : 'Retry MongoDB Connection'}
          </button>
        </div>
      </div>
    </div>
  );
}

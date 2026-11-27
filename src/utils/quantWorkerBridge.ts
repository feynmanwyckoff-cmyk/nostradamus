import {
  QuantWorkerInputPayload,
  QuantWorkerOutputPayload,
  executeQuantRimAndStatArbKernel
} from '../workers/quantValuationWorker';

let sharedQuantWorker: Worker | null = null;
let workerUnavailable = false;
const pendingCallbacks = new Map<string, (res: QuantWorkerOutputPayload) => void>();

function getOrInitQuantWorker(): Worker | null {
  if (
    typeof window === 'undefined' ||
    typeof Worker === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    workerUnavailable
  ) {
    return null;
  }
  if (sharedQuantWorker) {
    return sharedQuantWorker;
  }
  try {
    const inlineWorkerSource = `
      function roundToIdxTickWorker(rawPrice) {
        const safe = Math.max(50, Math.round(Number(rawPrice) || 50));
        if (safe < 200) return safe;
        if (safe < 500) return Math.round(safe / 2) * 2;
        if (safe < 2000) return Math.round(safe / 5) * 5;
        if (safe < 5000) return Math.round(safe / 10) * 10;
        return Math.round(safe / 25) * 25;
      }
      const kernelFn = ${executeQuantRimAndStatArbKernel.toString()};
      self.onmessage = function(event) {
        try {
          const payload = event.data;
          if (payload && payload.requestId) {
            const result = kernelFn(payload);
            self.postMessage(result);
          }
        } catch (err) {
          // ignore
        }
      };
    `;
    const blob = new Blob([inlineWorkerSource], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    sharedQuantWorker = new Worker(blobUrl);
    sharedQuantWorker.onmessage = (e: MessageEvent<QuantWorkerOutputPayload>) => {
      const data = e.data;
      if (data && data.requestId) {
        const cb = pendingCallbacks.get(data.requestId);
        if (cb) {
          pendingCallbacks.delete(data.requestId);
          cb(data);
        }
      }
    };
    sharedQuantWorker.onerror = () => {
      workerUnavailable = true;
      sharedQuantWorker = null;
    };
    return sharedQuantWorker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

/**
 * Dispatches Multi-Stage RIM & StatArb regression to the background Web Worker
 * so DOM rendering remains at 60fps, with an automatic synchronous fallback if Workers are blocked.
 */
export function runQuantValuationInWorkerAsync(
  payload: Omit<QuantWorkerInputPayload, 'requestId'>
): Promise<QuantWorkerOutputPayload> {
  const requestId = `${payload.ticker}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const fullPayload: QuantWorkerInputPayload = { ...payload, requestId };
  const worker = getOrInitQuantWorker();

  if (!worker) {
    return Promise.resolve(executeQuantRimAndStatArbKernel(fullPayload));
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      if (pendingCallbacks.has(requestId)) {
        pendingCallbacks.delete(requestId);
        resolve(executeQuantRimAndStatArbKernel(fullPayload));
      }
    }, 350);

    pendingCallbacks.set(requestId, (result) => {
      window.clearTimeout(timeoutId);
      resolve(result);
    });

    try {
      worker.postMessage(fullPayload);
    } catch {
      window.clearTimeout(timeoutId);
      pendingCallbacks.delete(requestId);
      resolve(executeQuantRimAndStatArbKernel(fullPayload));
    }
  });
}

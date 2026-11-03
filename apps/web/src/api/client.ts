import type {
  ApiError,
  Network,
  RouteRequest,
  RouteResponse,
  UploadResponse,
} from '@netsim/shared';

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Cannot reach the simulator API. Is it running?');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? res.statusText,
    );
  }
  return body as T;
}

/**
 * Streams a file to `POST /api/upload` as raw bytes. Uses XHR (not fetch) so upload progress can
 * be shown. The server hashes the bytes and discards them.
 */
function upload(file: Blob, fileName: string, onProgress?: (f: number) => void) {
  return new Promise<UploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/api/upload`);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.setRequestHeader('x-file-name', encodeURIComponent(fileName));
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () =>
      reject(new ApiRequestError(0, 'NETWORK_ERROR', 'Cannot reach the upload service.'));
    xhr.onload = () => {
      const body = xhr.response as UploadResponse | ApiError | null;
      if (xhr.status >= 200 && xhr.status < 300 && body && !('error' in body)) resolve(body);
      else {
        const err = body && 'error' in body ? body.error : null;
        reject(
          new ApiRequestError(
            xhr.status,
            err?.code ?? 'HTTP_ERROR',
            err?.message ?? (xhr.statusText || 'Upload failed.'),
          ),
        );
      }
    };
    xhr.send(file);
  });
}

export const api = {
  getNetwork: () => request<Network>('/network'),
  upload,
  route: (req: RouteRequest) =>
    request<RouteResponse>('/route', { method: 'POST', body: JSON.stringify(req) }),
};

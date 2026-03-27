import { Router, Request, Response } from 'express';
import http from 'http';

const router = Router();
const DROIDCAM_URL = process.env.DROIDCAM_URL || 'http://192.168.x.x:4747';

// GET /api/stream/status — check if DroidCam is reachable
router.get('/status', (_req: Request, res: Response) => {
  const url = new URL(DROIDCAM_URL);
  const port = parseInt(url.port || '4747');
  let responded = false;

  const options = {
    hostname: url.hostname,
    port,
    path: '/',
    timeout: 4000,
    method: 'GET',
  };

  const probe = http.request(options, (r) => {
    if (responded) return;
    responded = true;
    r.resume(); // drain
    res.json({ connected: true, url: DROIDCAM_URL, statusCode: r.statusCode });
  });

  probe.on('error', () => {
    if (responded) return;
    responded = true;
    res.json({ connected: false, url: DROIDCAM_URL, error: 'Cannot reach DroidCam' });
  });

  probe.on('timeout', () => {
    probe.destroy();
    if (responded) return;
    responded = true;
    res.json({ connected: false, url: DROIDCAM_URL, error: 'Connection timed out' });
  });

  probe.end();
});

// GET /api/stream/mjpeg — proxy the MJPEG stream from DroidCam
// DroidCam serves MJPEG at /videofeed (most versions) or /video
router.get('/mjpeg', (req: Request, res: Response) => {
  const url = new URL(DROIDCAM_URL);
  const port = parseInt(url.port || '4747');

  // Try /videofeed first (default on most DroidCam versions), fall back to /video
  const STREAM_PATHS = ['/videofeed', '/video'];

  function tryPath(pathIndex: number) {
    if (pathIndex >= STREAM_PATHS.length) {
      if (!res.writableEnded) {
        res.status(502).json({ error: 'Cannot find DroidCam stream on /videofeed or /video' });
      }
      return;
    }

    const streamPath = STREAM_PATHS[pathIndex];
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port,
      path: streamPath,
      method: 'GET',
      headers: { 'Connection': 'keep-alive', 'Cache-Control': 'no-cache' },
      timeout: 5000,
    };

    let headersSent = false;

    const proxyReq = http.request(options, (proxyRes) => {
      // If DroidCam returns a non-stream response (e.g. 404), try next path
      if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
        console.warn(`[stream] ${streamPath} returned ${proxyRes.statusCode}, trying next path`);
        proxyRes.resume();
        return tryPath(pathIndex + 1);
      }

      if (res.writableEnded) return;
      const contentType = proxyRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=--BoundaryString';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-cache, no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.writeHead(200);
      headersSent = true;
      console.log(`[stream] Streaming from DroidCam at ${streamPath}`);

      proxyRes.pipe(res, { end: true });
      proxyRes.on('error', () => { if (!res.writableEnded) res.end(); });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!headersSent) tryPath(pathIndex + 1);
    });

    proxyReq.on('error', (err) => {
      console.error(`[stream] Error on ${streamPath}:`, err.message);
      if (!headersSent && !res.writableEnded) {
        tryPath(pathIndex + 1);
      } else if (!res.writableEnded) {
        res.end();
      }
    });

    req.on('close', () => proxyReq.destroy());
    res.on('close', () => proxyReq.destroy());
    proxyReq.end();
  }

  tryPath(0);
});

export default router;

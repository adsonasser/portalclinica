import { createApp } from '../src/main';
import type { Request, Response } from 'express';

let cachedApp: any;
let initError: any;

async function init() {
  try {
    cachedApp = await createApp();
  } catch (e) {
    initError = e;
    console.error('Init error:', e);
  }
}

const initPromise = init();

export default async function handler(req: Request, res: Response) {
  await initPromise;
  if (initError) {
    return res.status(500).json({
      message: 'Initialization failed',
      error: initError.message,
      stack: initError.stack,
    });
  }
  cachedApp.getHttpAdapter().getInstance()(req, res);
}

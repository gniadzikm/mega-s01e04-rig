import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './types.js';

export function createDigestApi(config: RigConfig) {
  const api = new Hono();

  api.get('/:night', (c) => {
    const night = c.req.param('night');
    const result = readNight(config.runsDir, night);
    if (!result.found) {
      return c.notFound();
    }
    return c.json(result.rows);
  });

  return api;
}

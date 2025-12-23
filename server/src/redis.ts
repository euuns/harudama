import { createClient, RedisClientType } from 'redis';

type RedisClient = RedisClientType<any, any, any>;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient> | null = null;

export async function getRedis(): Promise<RedisClient> {
  if (client) return client;
  if (connecting) return connecting;

  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  const c: RedisClient = createClient({ url });

  c.on('error', (err) => {
    console.error('[Redis] error:', err);
  });

  connecting = (async () => {
    await c.connect();
    client = c;
    connecting = null;
    console.log('[Redis] connected:', url);
    return c;
  })();

  return connecting;
}

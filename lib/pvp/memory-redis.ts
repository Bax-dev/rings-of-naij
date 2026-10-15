// Development only: a tiny in-memory stand-in for the Redis calls the online fights use, so two
// browser tabs can fight locally without a database. Never used in production.

type Val = unknown
interface Entry {
  v: Val
  exp: number | null
}

const kv = new Map<string, Entry>()

function live(key: string) {
  const e = kv.get(key)
  if (e && e.exp !== null && e.exp < Date.now()) {
    kv.delete(key)
    return undefined
  }
  return e
}

const list = (key: string) => (live(key)?.v as Val[] | undefined) ?? []
const zset = (key: string) => (live(key)?.v as Map<string, number> | undefined) ?? new Map<string, number>()
const num = (x: number | string) => (x === "+inf" ? Number.POSITIVE_INFINITY : x === "-inf" ? Number.NEGATIVE_INFINITY : Number(x))

const ops = {
  async get<T>(key: string) {
    return (live(key)?.v as T) ?? null
  },
  async set(key: string, v: Val, opts?: { ex?: number; nx?: boolean }) {
    if (opts?.nx && live(key)) return null
    kv.set(key, { v, exp: opts?.ex ? Date.now() + opts.ex * 1000 : null })
    return "OK"
  },
  async getdel<T>(key: string) {
    const v = (live(key)?.v as T) ?? null
    kv.delete(key)
    return v
  },
  async rpush(key: string, ...vals: Val[]) {
    const l = [...list(key), ...vals]
    kv.set(key, { v: l, exp: live(key)?.exp ?? null })
    return l.length
  },
  async lrange(key: string, start: number, stop: number) {
    const l = list(key)
    return l.slice(start, stop === -1 ? undefined : stop + 1)
  },
  async ltrim(key: string, start: number, stop: number) {
    const l = list(key)
    const from = start < 0 ? Math.max(0, l.length + start) : start
    const to = stop < 0 ? l.length + stop + 1 : stop + 1
    kv.set(key, { v: l.slice(from, to), exp: live(key)?.exp ?? null })
    return "OK"
  },
  async expire(key: string, s: number) {
    const e = live(key)
    if (e) e.exp = Date.now() + s * 1000
    return e ? 1 : 0
  },
  async zadd(key: string, m: { score: number; member: string }) {
    const z = zset(key)
    z.set(m.member, m.score)
    kv.set(key, { v: z, exp: live(key)?.exp ?? null })
    return 1
  },
  async zcount(key: string, min: number | string, max: number | string) {
    let n = 0
    for (const s of zset(key).values()) if (s >= num(min) && s <= num(max)) n++
    return n
  },
  async zrange<T>(key: string, min: number, max: number) {
    return [...zset(key).entries()]
      .filter(([, s]) => s >= min && s <= max)
      .sort((a, b) => a[1] - b[1])
      .map(([m]) => m) as T
  },
  async zremrangebyscore(key: string, min: number, max: number) {
    const z = zset(key)
    for (const [m, s] of z) if (s >= min && s <= max) z.delete(m)
    return 0
  },
  async zrem(key: string, member: string) {
    zset(key).delete(member)
    return 1
  },
}

type Ops = typeof ops

function pipeline() {
  const queue: (() => Promise<unknown>)[] = []
  const p = new Proxy({} as Record<string, unknown>, {
    get(_t, name: string) {
      if (name === "exec") return async () => Promise.all(queue.map((f) => f()))
      return (...args: unknown[]) => {
        queue.push(() => (ops[name as keyof Ops] as (...a: unknown[]) => Promise<unknown>)(...args))
        return p
      }
    },
  })
  return p
}

export const memoryRedis = { ...ops, pipeline }

/**
 * Minimal in-memory stand-in for the Prisma client, for tests and local
 * previews where the Prisma engines cannot be downloaded. Supports only what
 * the newsletter code uses: equality / null / lt / gt filters, unique lookups
 * (including the subscriberId_slug compound key), single-field orderBy,
 * and cascade-delete of deliveries when a subscriber is deleted.
 */
const DEFAULTS = {
  subscriber: () => ({ status: 'pending', requestedAt: new Date(), confirmedAt: null, unsubscribedAt: null, source: null }),
  newsletterDelivery: () => ({ error: null, sentAt: new Date() }),
  unsubscribeFeedback: () => ({ reason: null, comment: null, createdAt: new Date() }),
  message: () => ({ createdAt: new Date(), notified: false, notifiedAt: null, notifyVia: null, notifyError: null }),
  analytics: () => ({ createdAt: new Date() }),
};

function matches(row, where = {}) {
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'subscriberId_slug') {
      if (row.subscriberId !== cond.subscriberId || row.slug !== cond.slug) return false;
      continue;
    }
    const v = row[k];
    if (cond === null) { if (v !== null && v !== undefined) return false; continue; }
    if (cond instanceof Date) { if (!(v instanceof Date) || v.getTime() !== cond.getTime()) return false; continue; }
    if (typeof cond === 'object') {
      const val = v instanceof Date ? v.getTime() : v;
      const n = (x) => (x instanceof Date ? x.getTime() : x);
      if ('lt' in cond && !(val != null && val < n(cond.lt))) return false;
      if ('lte' in cond && !(val != null && val <= n(cond.lte))) return false;
      if ('gt' in cond && !(val != null && val > n(cond.gt))) return false;
      if ('gte' in cond && !(val != null && val >= n(cond.gte))) return false;
      if ('in' in cond && !cond.in.includes(v)) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

const UNIQUE = {
  subscriber: ['email', 'confirmToken', 'unsubToken'],
  unsubscribeFeedback: ['token'],
};

export function createFakePrisma() {
  const tables = {};
  const ids = {};
  const clone = (r) => (r ? { ...r } : null);
  const model = (name) => {
    tables[name] ??= [];
    ids[name] ??= 0;
    const rows = tables[name];
    const checkUnique = (row, selfId) => {
      for (const f of UNIQUE[name] || []) {
        if (rows.some(r => r.id !== selfId && r[f] === row[f])) throw new Error(`Unique constraint failed on ${name}.${f}`);
      }
      if (name === 'newsletterDelivery' && rows.some(r => r.id !== selfId && r.subscriberId === row.subscriberId && r.slug === row.slug)) {
        throw new Error('Unique constraint failed on subscriberId_slug');
      }
    };
    const api = {
      async findUnique({ where }) { return clone(rows.find(r => matches(r, where))); },
      async findFirst({ where } = {}) { return clone(rows.find(r => matches(r, where))); },
      async findMany({ where, orderBy, take } = {}) {
        let out = rows.filter(r => matches(r, where)).map(clone);
        if (orderBy) {
          const [[f, dir]] = Object.entries(orderBy);
          out.sort((a, b) => ((a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0) * (dir === 'desc' ? -1 : 1)));
        }
        return take ? out.slice(0, take) : out;
      },
      async count({ where } = {}) { return rows.filter(r => matches(r, where)).length; },
      async create({ data }) {
        const row = { ...(DEFAULTS[name]?.() || {}), ...data, id: ++ids[name] };
        checkUnique(row, row.id);
        rows.push(row);
        return clone(row);
      },
      async update({ where, data }) {
        const row = rows.find(r => matches(r, where));
        if (!row) throw new Error(`${name} not found`);
        const next = { ...row, ...data };
        checkUnique(next, row.id);
        Object.assign(row, data);
        return clone(row);
      },
      async updateMany({ where, data }) {
        const hit = rows.filter(r => matches(r, where));
        hit.forEach(r => Object.assign(r, data));
        return { count: hit.length };
      },
      async upsert({ where, create, update }) {
        const row = rows.find(r => matches(r, where));
        return row ? api.update({ where: { id: row.id }, data: update }) : api.create({ data: create });
      },
      async delete({ where }) {
        const i = rows.findIndex(r => matches(r, where));
        if (i < 0) throw new Error(`${name} not found`);
        const [row] = rows.splice(i, 1);
        if (name === 'subscriber') {
          const d = model('newsletterDelivery');
          for (const x of await d.findMany({ where: { subscriberId: row.id } })) await d.delete({ where: { id: x.id } });
        }
        return row;
      },
      async deleteMany({ where } = {}) {
        const hit = rows.filter(r => matches(r, where));
        for (const r of hit) await api.delete({ where: { id: r.id } });
        return { count: hit.length };
      },
      async groupBy() { return []; },
    };
    return api;
  };
  return new Proxy({ $tables: tables, $connect: async () => {}, $disconnect: async () => {} }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      return model(prop);
    },
  });
}

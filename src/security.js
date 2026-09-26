const crypto = require('crypto');

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const right = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
}

const buckets = new Map();

function bucketFor(name) {
  if (!buckets.has(name)) buckets.set(name, new Map());
  return buckets.get(name);
}

function prune(map, now) {
  if (map.size < 2000) return;
  for (const [key, entry] of map) {
    if (entry.resetAt <= now) map.delete(key);
  }
}

function loginState(ip) {
  const now = Date.now();
  const map = bucketFor('login');
  prune(map, now);
  const entry = map.get(ip);
  if (!entry || entry.resetAt <= now) return { blocked: false };
  return { blocked: entry.count >= 8 };
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const map = bucketFor('login');
  const entry = map.get(ip);
  if (!entry || entry.resetAt <= now) {
    map.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return;
  }
  entry.count += 1;
}

function clearLoginFailures(ip) {
  bucketFor('login').delete(ip);
}

function allowAction(name, key, max, windowMs) {
  const now = Date.now();
  const map = bucketFor(name);
  prune(map, now);
  const entry = map.get(key);
  if (!entry || entry.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

function resetSecurityState() {
  buckets.clear();
}

module.exports = {
  safeEqual,
  loginState,
  recordLoginFailure,
  clearLoginFailures,
  allowAction,
  resetSecurityState,
};

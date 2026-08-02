export function acquireBrowserCapability(acquire, fallback = null) {
  if (typeof acquire !== 'function') throw new TypeError('Browser capability acquisition requires a function.');
  try {
    const value = acquire();
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function acquireBrowserStorage(windowTarget, fallback = null) {
  return acquireBrowserCapability(() => {
    const storage = windowTarget?.localStorage;
    if (!storage) return fallback;
    void storage.length;
    return storage;
  }, fallback);
}

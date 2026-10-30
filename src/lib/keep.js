// A small app-wide cache for expensive drawings that outlive a view's mount: keep(key, deps, make) returns the
// value made for `key`, remade only when one of `deps` changed (compared by identity — plans' item arrays
// are new arrays whenever they are edited). Views use it so a drawing built once (or ahead of time, while the
// app is idle: see App) is there at once when the view opens again.
const store = new Map();

export function keep(key, deps, make) {
  const c = store.get(key);
  if (c && c.deps.length === deps.length && c.deps.every((d, i) => d === deps[i])) return c.value;
  const value = make();
  store.set(key, { deps, value });
  return value;
}

/** Run jobs one by one in the browser's idle time (a few per idle slice), so warming up never blocks it. */
export function whenIdle(jobs) {
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 60));
  const queue = [...jobs];
  const run = (deadline) => {
    while (queue.length && deadline.timeRemaining() > 4) queue.shift()();
    if (queue.length) idle(run);
  };
  if (queue.length) idle(run);
}

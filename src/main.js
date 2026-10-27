// The normal website build must never publish the prototype or engine.
// The existing regression UI is available locally at demo.html or --mode demo.
if (import.meta.env.MODE === 'demo') {
  import('./prototype.js');
} else {
  import('./live/app.js');
}

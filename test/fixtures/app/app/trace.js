/** Shared helper for fixture middleware: append a step to req.trace. */
export default function trace(req, step) {
  if (!req.trace) req.trace = [];
  req.trace.push(step);
}

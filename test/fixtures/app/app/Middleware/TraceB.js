import trace from '../trace.js';

class TraceB {
  handle(req, res, next) {
    trace(req, 'TraceB');
    next();
  }

  run(req, res, next) {
    trace(req, 'TraceB.run');
    next();
  }
}

export default new TraceB();

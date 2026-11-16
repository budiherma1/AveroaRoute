import trace from '../trace.js';

class TraceA {
  handle(req, res, next) {
    trace(req, 'TraceA');
    next();
  }

  run(req, res, next) {
    trace(req, 'TraceA.run');
    next();
  }
}

export default new TraceA();

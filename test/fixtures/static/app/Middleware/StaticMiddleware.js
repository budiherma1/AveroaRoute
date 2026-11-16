import trace from '../trace.js';

// Middleware class with a static handle(): used as is, `this` = the class.
export default class StaticMiddleware {
  static constructed = 0;

  static step = 'StaticMiddleware';

  constructor() {
    StaticMiddleware.constructed += 1;
  }

  static handle(req, res, next) {
    trace(req, this.step);
    next();
  }
}

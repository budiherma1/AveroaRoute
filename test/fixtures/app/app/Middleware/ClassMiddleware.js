import trace from '../trace.js';

// Exported as a class: instantiated once, `this` bound.
export default class ClassMiddleware {
  constructor() {
    this.name = 'ClassMiddleware';
  }

  async handle(req, res, next) {
    trace(req, this.name);
    next();
  }
}

import trace from '../trace.js';

class GlobalBegin {
  handle(req, res, next) {
    trace(req, `global.begin(files=${Array.isArray(req.files)})`);
    next();
  }
}

class MiddlewareProvider {
  constructor() {
    this.calls = { beginning: 0, end: 0 };
  }

  beginning() {
    this.calls.beginning += 1;
    return [new GlobalBegin()];
  }

  end() {
    this.calls.end += 1;
    return [(req, res, next) => { trace(req, 'global.end'); next(); }];
  }
}

export default new MiddlewareProvider();

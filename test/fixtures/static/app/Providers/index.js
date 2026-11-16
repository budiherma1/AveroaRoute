import trace from '../trace.js';

class StaticGlobal {
  static step = 'static.global';

  static handle(req, res, next) {
    trace(req, this.step);
    next();
  }
}

// Provider class with static beginning()/end(), entries are classes with static handle().
export class MiddlewareProvider {
  static constructed = 0;

  constructor() {
    MiddlewareProvider.constructed += 1;
  }

  static beginning() {
    return [StaticGlobal];
  }

  static end() {
    return [(req, res, next) => { trace(req, 'static.end'); next(); }];
  }
}

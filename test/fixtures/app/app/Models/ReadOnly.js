import trace from '../trace.js';

// Model without validationRouter: enough for get/delete/all routes (3.0.1).
export default class ReadOnly {
  static checkParamId(req, res, next) {
    trace(req, 'readonly.checkParamId');
    next();
  }

  static mapRequest(req, res, next) {
    trace(req, 'readonly.mapRequest');
    next();
  }
}

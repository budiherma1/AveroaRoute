import trace from '../trace.js';

// Fake model exposing the crud hooks the router calls.
function record(model, hook, req, additional) {
  if (!req.hooks) req.hooks = [];
  req.hooks.push({ hook, additional, thisIsModel: model === Teacher });
  trace(req, `model.${hook}`);
}

export default class Teacher {
  static checkParamId(req, res, next, additional) {
    record(this, 'checkParamId', req, additional);
    if (req.params.id === '404') {
      return res.status(404).json({ status: false, message: `ID ${req.params.id} doesn't exist` });
    }
    return next();
  }

  static async validationRouter(req, res, next, additional) {
    record(this, 'validationRouter', req, additional);
    return next();
  }

  static mapRequest(req, res, next, additional) {
    record(this, 'mapRequest', req, additional);
    return next();
  }
}

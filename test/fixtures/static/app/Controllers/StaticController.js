// 1.x style: default export is a class with STATIC methods. It must not be instantiated.
export default class StaticController {
  static constructed = 0;

  static label = 'StaticController';

  constructor() {
    StaticController.constructed += 1;
  }

  static async index(req, res) {
    res.json({ controller: this.label, constructed: StaticController.constructed, trace: req.trace ?? [] });
  }
}

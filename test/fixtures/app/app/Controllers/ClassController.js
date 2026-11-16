// Default export is a class: the router must instantiate it exactly once.
export default class ClassController {
  static instances = 0;

  constructor() {
    ClassController.instances += 1;
    this.greeting = 'hello from class';
  }

  hello(req, res) {
    res.json({ greeting: this.greeting, instances: ClassController.instances });
  }

  other(req, res) {
    res.json({ instances: ClassController.instances });
  }
}

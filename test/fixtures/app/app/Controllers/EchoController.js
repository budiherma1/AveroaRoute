// Default export is an instance (the boilerplate style).
class EchoController {
  label() {
    return 'EchoController';
  }

  show(req, res) {
    res.json({
      controller: this.label(),
      method: req.method,
      path: req.path,
      params: req.params,
      trace: req.trace ?? [],
      hooks: req.hooks ?? [],
      files: (req.files ?? []).map((f) => ({ field: f.fieldname, size: f.size })),
      body: req.body ?? null,
    });
  }
}

export default new EchoController();

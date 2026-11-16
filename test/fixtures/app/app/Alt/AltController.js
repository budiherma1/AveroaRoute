export default {
  ping(req, res) {
    res.json({ alt: true, trace: req.trace ?? [] });
  },
};

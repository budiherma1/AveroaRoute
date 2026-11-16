export default {
  index(req, res) {
    res.json({ fixture: 'asyncprovider', trace: req.trace ?? [] });
  },
};

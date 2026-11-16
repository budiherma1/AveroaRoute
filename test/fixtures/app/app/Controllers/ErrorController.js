export default {
  async boom() {
    await new Promise((r) => setTimeout(r, 5));
    const err = new Error('async boom');
    err.status = 418;
    throw err;
  },
  syncBoom() {
    throw new Error('sync boom');
  },
};

export default {
  async handle() {
    const err = new Error('middleware rejected');
    err.status = 401;
    throw err;
  },
};

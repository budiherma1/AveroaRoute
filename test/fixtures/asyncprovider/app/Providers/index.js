// MiddlewareProvider with async beginning()/end() (supported since 3.0.1)
export const MiddlewareProvider = {
  async beginning() {
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    return [(req, res, next) => { (req.trace ??= []).push('async-begin'); next(); }];
  },
  async end() {
    return [(req, res, next) => { (req.trace ??= []).push('async-end'); next(); }];
  },
};

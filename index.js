
import express from 'express'
import { MiddlewareProvider } from '@averoa/providers';
const router = express.Router()
// import {Auth} from '@averoa/utilities';

class aveRoute {

	constructor() {
		this.c_path = "/app/Controllers/";
		this.m_path = "/app/Middleware/";
		this.m_met = "handle";
	}

	async config({controller, middleware}) {
		this.c_path = controller.path ? ('/' + controller.path + '/').replace('//', '/') : this.c_path;
		this.m_path = middleware.path ? ('/' + middleware.path + '/').replace('//', '/') : this.m_path;
		this.m_met = middleware.method ? middleware.method : this.m_met;
	}
	
	async get(pt, ct, mid) {
		return this.proceed('get', pt, ct, mid);
	}

	async post(pt, ct, mid) {
		return this.proceed('post', pt, ct, mid);
	}

	async put(pt, ct, mid) {
		return this.proceed('put', pt, ct, mid);
	}

	async delete(pt, ct, mid) {
		return this.proceed('delete', pt, ct, mid);
	}

	async patch(pt, ct, mid) {
		return this.proceed('patch', pt, ct, mid);
	}

	async match(rt, pt, ct, mid) {
		for (let i of rt) {
			this.proceed(i, pt, ct, mid);
		}
	}

	async any(pt, ct, mid) {
		this.proceed('get', pt, ct, mid);
		this.proceed('post', pt, ct, mid);
		this.proceed('put', pt, ct, mid);
		this.proceed('delete', pt, ct, mid);
		this.proceed('patch', pt, ct, mid);
	}

	async middleware(mid = [], cb) {
		this.mid = mid;
		cb();
		this.mid = '';
	}

	async prefix(pref, cb) {
		this.pref = ('/' + pref).replace('//', '/');
		cb();
		this.pref = '';
	}

	async group({ middleware, prefix }, cb) {
		if (middleware) {
			this.mid = middleware;
		}
		if (prefix) {
			this.pref = ('/' + prefix).replace('//', '/');
		}

		cb();

		if (middleware) {
			this.mid = '';
		}
		if (prefix) {
			this.pref = '';
		}
	}

	async proceed(ty, pt, ct, mid) {
		let p = ('/' + pt).replace('//', '/');
		let ctm = ct.split('@');
		let pref = this.pref ?? '';

		if (this.mid) {
			mid = this.mid;
		}

		let c = (await import(`./../../..${this.c_path}${ctm[0]}.js`)).default
		let midd = [];
		let midn = "";
		let mid_beg = "";
		let mid_end = "";
		// let aut = `(req, res, next) => {Auth.init(req); next();}, `;
		for (let aa in MiddlewareProvider.beginning()) {
			mid_beg += ` (req, res, next) => MiddlewareProvider.beginning()[${aa}].handle(req, res, next),`;
		}
		for (let ee in MiddlewareProvider.end()) {
			mid_end += ` (req, res, next) => MiddlewareProvider.end()[${ee}].handle(req, res, next),`;
		}

		if (mid) {
			midn = `[`;

			for (let a in mid) {
				midd.push(
					(await import(`./../../..${this.m_path}${mid[a]}.js`)).default
				)
				midn += ` (req, res, next) => midd[${a}].${this.m_met}(req, res, next),`;
			}
			midn += "], ";
		}
		
		// let route = `router.${ty}('${pref}${p}',${aut}${mid_beg}${mid ? midn : ''}${mid_end} (req, res) => c.${ctm[1]}(req, res))`;
		// let route = `router.${ty}('${pref}${p}',${aut}${mid_beg}${mid ? midn : ''}${mid_end} c.${ctm[1]})`;
		let route = `router.${ty}('${pref}${p}',${mid_beg}${mid ? midn : ''}${mid_end} c.${ctm[1]})`;
		return eval(route);
	}
}
export default new aveRoute;
export {router};
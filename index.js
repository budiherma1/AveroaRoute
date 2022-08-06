
import express from 'express'
import { MiddlewareProvider } from '@averoa/providers';
import Multer from 'multer';
// import {Auth} from '@averoa/utilities';

class aveRoute {

	constructor() {
		this.c_path = "/app/Controllers/";
		this.m_path = "/app/Middleware/";
		this.mod_path = "/app/Models/";
		this.m_met = "handle";
		this.router = express.Router();
	}

	static Router() {
		return new this;
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

	async postForm(pt, ct, mid) {
		const multer = Multer();
		return this.proceed('post', pt, ct, mid, {multer: multer.any()});
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
	async patchForm(pt, ct, mid) {
		const multer = Multer();
		return this.proceed('patch', pt, ct, mid, {multer: multer.any()});
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

	async set(vmodel = '', pref, cb) {
		this.vmodel = vmodel;
		this.prefix(pref, cb)
		this.vmodel = '';
	}

	// async set({model, path}, cb) {
	// 	this.vmodel = model;
	// 	this.prefix(path, cb)
	// 	this.vmodel = '';
	// }

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

	async proceed(ty, pt, ct, mid, additional) {
		let p = ('/' + pt).replace('//', '/');
		let ctm = ct.split('@');
		let pref = this.pref ?? '';
		let multer = additional?.multer === undefined ? '' : 'additional.multer, ';

		if (this.mid) {
			mid = this.mid;
		}
		let vmodel = '';
		let model = ''
		if (this.vmodel) {
			model = (await import(`./../../..${this.mod_path}${this.vmodel}.js`)).default
			if (['post', 'patch'].includes(ty)) {

				let sParams = '';

				if (multer) {
					sParams = ", {type: 'multipart'}";
				}

				if (ty == 'post') {
					sParams = ", {type: 'multipart', post: true}"
				}

				vmodel = `(req, res, next) => model.checkParamId.call(model, req, res, next), (req, res, next) => model.sanitizeRequest.call(model, req, res, next${sParams}), (req, res, next) => model.validationRouter.call(model, req, res, next${sParams}), (req, res, next) => model.mapRequest.call(model, req, res, next${sParams}),`;
			}

			if (ty == 'get') {
				vmodel = `(req, res, next) => model.checkParamId.call(model, req, res, next), (req, res, next) => model.mapRequest.call(model, req, res, next), `;
			}
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
		let route = `this.router.${ty}('${pref}${p}',${multer}${mid_beg}${mid ? midn : ''}${mid_end} ${vmodel} c.${ctm[1]})`;
		return eval(route);
	}
}
export default aveRoute.Router.bind(aveRoute);

import express from 'express'
import { MiddlewareProvider } from '@averoa/providers';
import Multer from 'multer';

class aveRoute {

	constructor() {
		this.c_path = "/app/Controllers/";
		this.m_path = "/app/Middleware/";
		this.mod_path = "/app/Models/";
		this.m_met = "handle";
		this.router = express.Router();
		this.mid = [];
		this.iteration = 0;
		this.importControllers = {};
		this.importMiddlewares = {};
		this.importControllersModel = {};
		this.allRoutes = [];
	}

	static Router() {
		return new this;
	}

	config({ controller, middleware }) {
		this.c_path = controller.path ? ('/' + controller.path + '/').replace('//', '/') : this.c_path;
		this.m_path = middleware.path ? ('/' + middleware.path + '/').replace('//', '/') : this.m_path;
		this.m_met = middleware.method ? middleware.method : this.m_met;
	}

	get(pt, ct, mid) {
		return this.proceed('get', pt, ct, mid);
	}

	post(pt, ct, mid) {
		return this.proceed('post', pt, ct, mid);
	}

	postForm(pt, ct, mid) {
		const multer = Multer();
		return this.proceed('post', pt, ct, mid, { multer: multer.any() });
	}

	put(pt, ct, mid) {
		return this.proceed('put', pt, ct, mid);
	}

	putForm(pt, ct, mid) {
		const multer = Multer();
		return this.proceed('put', pt, ct, mid, { multer: multer.any() });
	}

	delete(pt, ct, mid) {
		return this.proceed('delete', pt, ct, mid);
	}

	patch(pt, ct, mid) {
		return this.proceed('patch', pt, ct, mid);
	}

	patchForm(pt, ct, mid) {
		const multer = Multer();
		return this.proceed('patch', pt, ct, mid, { multer: multer.any() });
	}

	match(rt, pt, ct, mid) {
		for (let i of rt) {
			this.proceed(i, pt, ct, mid);
		}
	}

	any(pt, ct, mid) {
		this.proceed('get', pt, ct, mid);
		this.proceed('post', pt, ct, mid);
		this.proceed('put', pt, ct, mid);
		this.proceed('delete', pt, ct, mid);
		this.proceed('patch', pt, ct, mid);
	}

	all(pt, ct, mid) {
		this.proceed('all', pt, ct, mid);
	}

	middleware(mid = [], cb) {
		this.mid = [...this.mid, ...mid];
		cb();
		this.mid = this.mid.filter(function (item) {
			return !(mid.includes(item))
		});
	}

	set(vmodel = '', pref, cb) {
		this.vmodel = vmodel;
		this.prefix(pref, cb)
		this.vmodel = '';
	}

	crud(vmodel = '', pref, cb) {
		this.vmodel = vmodel;
		this.prefix(pref, cb)
		this.vmodel = '';
	}

	prefix(pref, cb) {
		let filteredPref = ('/' + pref).replace('//', '/');
		this.pref = (this.pref ?? '') + filteredPref;
		cb();
		this.pref = this.pref.replace(filteredPref, '');
	}

	group({ middleware, prefix }, cb) {
		let filteredPref = '';
		if (middleware) {
			this.mid = [...this.mid, ...middleware];
		}
		if (prefix) {
			filteredPref = ('/' + prefix).replace('//', '/');
			this.pref = (this.pref ?? '') + filteredPref;
		}

		cb();

		if (middleware) {
			this.mid = this.mid.filter(function (item) {
				return !(middleware.includes(item))
			});
		}
		if (prefix) {
			this.pref = this.pref.replace(filteredPref, '');
		}
	}

	proceed(ty, pt, ct, mid, additional) {
		let p = ('/' + pt).replace('//', '/');
		let ctm = ct.split('@');
		let pref = this.pref ?? '';
		let multer = additional?.multer === undefined ? '' : 'multer.any(), ';

		if (this.mid.length) {
			mid = this.mid;
		}
		let vmodel = '';
		if (this.vmodel) {
			this.importControllersModel[this.vmodel] = `./../../..${this.mod_path}${this.vmodel}.js`;
			if (['post', 'patch', 'put'].includes(ty)) {

				let sParams = '';

				if (multer) {
					sParams = `, {type: 'multipart', pref: '${pref.split('/').join('')}'}`;
				}

				if (ty == 'post') {
					sParams = `, {type: 'multipart', create: true, pref: '${pref.split('/').join('')}'}`
				}

				vmodel = `(req, res, next) => model.${this.vmodel}.checkParamId.call(model.${this.vmodel}, req, res, next), (req, res, next) => model.${this.vmodel}.validationRouter.call(model.${this.vmodel}, req, res, next${sParams}), (req, res, next) => model.${this.vmodel}.mapRequest.call(model.${this.vmodel}, req, res, next${sParams}),`;
			}

			if (['get', 'delete'].includes(ty)) {
				vmodel = `(req, res, next) => model.${this.vmodel}.checkParamId.call(model.${this.vmodel}, req, res, next), (req, res, next) => model.${this.vmodel}.mapRequest.call(model.${this.vmodel}, req, res, next), `;
			}
		}

		this.importControllers[ctm[0]] = `./../../..${this.c_path}${ctm[0]}.js`;

		let midn = "";
		let mid_beg = "";
		let mid_end = "";
		for (let aa in MiddlewareProvider.beginning()) {
			mid_beg += ` (req, res, next) => MiddlewareProvider.beginning()[${aa}].handle(req, res, next),`;
		}
		for (let ee in MiddlewareProvider.end()) {
			mid_end += ` (req, res, next) => MiddlewareProvider.end()[${ee}].handle(req, res, next),`;
		}

		if (mid) {
			midn = `[`;

			for (let a in mid) {
				this.importMiddlewares[mid[a]] = `./../../..${this.m_path}${mid[a]}.js`;
				midn += ` (req, res, next) => middleware.${mid[a]}.${this.m_met}(req, res, next),`;
			}
			midn += "], ";
		}

		let route = `this.router.${ty}('${pref}${p}',${multer}${mid_beg}${mid ? midn : ''}${mid_end} ${vmodel} controller.${ctm[0]}.${ctm[1]})`;
		this.allRoutes.push(route);
	}

	async init() {
		const multer = Multer();
		let controller = {}
		let middleware = {}
		let model = {}
		for (let key in this.importControllers) {
			controller[key] = (await import(this.importControllers[key])).default
		}
		for (let key1 in this.importMiddlewares) {
			middleware[key1] = (await import(this.importMiddlewares[key1])).default
		}
		for (let key2 in this.importControllersModel) {
			model[key2] = (await import(this.importControllersModel[key2])).default
		}

		Promise.all(this.allRoutes.map((v, i) => {
			return eval(v);
		}))

		return this.router;
	}
}
export default aveRoute.Router.bind(aveRoute);

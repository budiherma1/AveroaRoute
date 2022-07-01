# aveRoute (Route for AveroaJS)
## Router like laravel for expressjs

Sample usage:

routes/index.js
```
const averoute = require('@averoa/route');
const router = averoute.router;

// default directories for controller and middleware are 'app/Controllers/' and 'app/Middleware/'
// default method for middleware is 'handle'
// you can set to another directories and method using function below
averoute.config({
	controller: {path: 'sample_dir/Controller/'},
	middleware: {path: 'sample_dir/sample_dir/Middleware/', method: 'handle'}
});

// averoute
averoute.get('/', 'UserController@getData');
averoute.get('/aa/', 'UserController@aa');
averoute.post('/middleware', 'UserController@getData', ['AuthMiddleware', 'AuthMiddleware1']);
averoute.put('/about', 'AboutController@getData');

averoute.delete('/ab*cd', 'AboutController@getData');
averoute.get('/user/:address/:user_id', 'AboutController@getDataParams');
// see on https://expressjs.com/en/guide/routing.html for another variation

averoute.get('/user', 'AboutController@getDataQuery');
averoute.any('/anymenthod', 'AboutController@getDataQuery');
averoute.match(['get', 'post'], '/multimethod', 'AboutController@getDataQuery');

averoute.middleware(['AuthMiddleware2', 'AuthMiddleware1', 'AuthMiddleware1'], () => {
	averoute.prefix('middleware-prefix', () => {
		averoute.get('sample-route', 'UserController@getData')
	});
	averoute.get('/aboutmid', 'AboutController@getData');
});

averoute.group({ middleware: ['AuthMiddleware', 'AuthMiddleware1'], prefix: 'group-middleware-prefix' }, () => {
	averoute.get('/route', 'AboutController@getData');
});

averoute.prefix('prefix', function () {
	averoute.middleware(['AuthMiddleware2', 'AuthMiddleware1', 'AuthMiddleware1'], function () {
		averoute.get('middleware-route', 'UserController@getData');
	});
});

averoute.get('1', 'UserController@getData');

// Original express route
router.get('/11', function (req, res) {
    res.send('Birds home page');
})

router.get('/22', function (req, res) {
    res.send('About birds');
})

module.exports = router
```

index.js
```
const express = require('express');
const app = express()
const port = 3000
const router = require('./routes/index.js');

app.use('/', router)

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
```

sample Controller

```
class HomeController {

	async getDataTest(req, res) {
		res.send('hello world')
	}
	
	async getData(req, res) {
		res.send('hello world')
	}

	async real(req, res) {
		res.send('hello world')
	}

}

module.exports = new HomeController;
```

sample Middleware

```
class AuthMiddleware {
	handle (req, res, next) {
		console.log('middleware')
		next()
	}
}

module.exports = new AuthMiddleware
```
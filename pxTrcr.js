/*
* Copyright (c) 2012, Leon Sorokin
* All rights reserved. (MIT Licensed)
*
* pxTrcr.js - pixel tracer for pXY.js
*/

function pxTrcr(w, h, ctnr) {
	this.w = w;
	this.h = h;
	this.record = false;
	this.timeout = 1000/60;
	this.queue = null;
	this.ctnr = ctnr;

	// layer stack
	this.lyrs = {};
	// state stack
	this.hist = [];

	// init layer 0 and trans pixel
	this.push([0,0,0,0], 0);
}

(function() {
	function q() {
		var self = this;
		this.items = [];

		this.enq = function enq(fn) {
			this.items.push(fn);
		};

		this.deq = function deq() {
			this.items.length && (this.items.shift()).call(self);
		};
	}

	function lyr(w, h, id) {
		this.id = id;

		this.can = document.createElement('canvas');
		this.can.id = "trclyr-" + id;
		this.can.className = "trclyr";
		this.can.width = w;
		this.can.height = h;
		this.can.style.position = "absolute";
		this.can.style.left = 0;
		this.can.style.top = 0;
		this.can.style.background = "transparent";

		this.ctx = this.can.getContext('2d');
		this.imgd = this.ctx.createImageData(w, h);
		this.pxls = this.imgd.data;
		this.dirty = false;

		this.setPx = function setPxLyr(i,px) {
			i *= 4;		// subpixel index

			this.pxls[i]	= px[0];
			this.pxls[++i]	= px[1];
			this.pxls[++i]	= px[2];
			this.pxls[++i]	= px[3] || 255;

			this.dirty = true;
		};

		this.upd = function updLyr() {
			this.dirty && this.ctx.putImageData(this.imgd, 0, 0);
			this.dirty = false;
		};

		this.clr = function clrLyr() {
			this.ctx.clearRect(0, 0, this.can.width, this.can.height);
			this.imgd = this.ctx.getImageData(0, 0, this.can.width, this.can.height);
			this.pxls = this.imgd.data;
			this.dirty = false;
		};
	}

	// get and/or make a layer
	function lyrProduce(id) {
		if (this.lyrs[id])
			return this.lyrs[id];

		this.lyrs[id] = new lyr(this.w, this.h, id);
		this.ctnr.appendChild(this.lyrs[id].can);

		return this.lyrs[id];
	}

	// one-shot (single move or scan)
	function One() {
		this.fired = true;

		this.chk = function(type, id) {
			var ret;
			switch (type) {
				case 0: ret = !this.fired; break;
				case 1: ret = true; this.id = id; break;
				case 2: ret = this.id == id ? false : true; break;
			}
			this.fired && (this.fired = false);
			return ret;
		};
	}

	// sticky
	function Set() {
		this.chk = function(type, id) {
			return true;
		}
	}

	// modules
	var mods = {
		queue: {
			// enable recording
			rec: function rec() {
				this.record = true;
				this.queue = new q;
			},
			// queues or executes functions
			exec: function exec(fn, args, timeout) {
				if (!this.record)
					return fn.apply(this, args);

				var self = this;
				self.queue.enq(function() {
					window.setTimeout(function() {
						fn.apply(self, args);
						self.queue.deq();
					}, timeout || timeout === 0 ? timeout : self.timeout);
				});
			},
		},
		stack: {
			set: function set(pxl, lyrId) {
				function go(pxl, lyrId) {
					var pxLyr = this.pxLyrPair.apply(this, arguments);
					this.hist[0] = [new Set].concat(pxLyr);
				}

				this.exec(go, arguments, 0);

				return this;
			},
			push: function push(pxl, lyrId) {
				function go(pxl, lyrId) {
					var pxLyr = this.pxLyrPair.apply(this, arguments);
					this.hist.unshift([new Set].concat(pxLyr));
				}

				this.exec(go, arguments, 0);

				return this;
			},
			pop: function pop(now) {
				if (now)
					this.hist.shift();
				else
					this.exec(this.pop, [true], 0);

				return this;
			},
			one: function one(pxl, lyrId) {
				function go(pxl, lyrId) {
					var pxLyr = this.pxLyrPair.apply(this, arguments);
					this.hist.unshift([new One].concat(pxLyr));
				}

				this.exec(go, arguments, 0);

				return this;
			},
			// takes 1 or 2 args, layer id and/or pixel, in any order
			pxLyrPair: function(a1, a2) {
				function isLyrId(v) {
					return typeof v == "string" || typeof v == "number";
				}

				switch (arguments.length) {
					case 0:
						return [this.hist[0][1], this.hist[0][2]];	// inherits both
					case 1:
						if (isLyrId(a1))
							return [this.hist[0][1], this.lyr(a1)];	// get/make layer, inherit px
						return [a1, this.hist[0][2]];				// use px, inherit layer
					case 2:
						if (isLyrId(a1))
							return [a2, this.lyr(a1)];				// get/make layer, use px
						return [a1, this.lyr(a2)];					// use px, get/make layer
				}
			},
		},
		layer: {
			lyr: function lyr(id) {
				return this.exec(lyrProduce, arguments);
			},
			clr: function clr(lyrId) {
				if (lyrId && this.lyrs[lyrId])
					this.lyrs[lyrId].clr();
				else {
					for (var i in this.lyrs)
						this.lyrs[i].clr();
				}
			},
			// draw pixel to layer at idx
			setPx: function setPx(i) {
				var top = this.hist[0];
				top[2].setPx(i, top[1]);
			},
			// output pixels to canvas(es)
			upd: function upd(lyrId) {
				for (var i in this.lyrs) {
					if (lyrId && i !== lyrId) continue;
					this.lyrs[i].upd();
				}
			},
			// returns array with layer canvas(es)
			cans: function get(lyrId) {
				var lyrs = [];
				for (var i in this.lyrs) {
					if (lyrId && i != lyrId) continue;
					lyrs.push(this.lyrs[i].can);
				}

				return lyrs;
			},
			// .upd() + .cans()
			rend: function rend(lyrId) {
				this.upd.apply(this, arguments);
				return this.cans.apply(this, arguments);
			},
			draw: function draw(timeout) {
				if (this.queue && this.queue.items.length) {
					if (timeout)
						this.timeout = timeout;
					this.queue.deq();
				}
				else {
					var cans = this.rend();
					for (var i in cans)
						this.ctnr.appendChild(cans[i]);
				}

				return this;
			},
		},
		pubsub: {
			sub: function sub(pxy) {
				pxy.sub(this.notify, this);
				return this;
			},
			unsub: function unsub(pxy) {
				pxy.unsub(this.notify, this);
				return this;
			},
			handle: function handle(evt) {
				evt.type == 0 && this.setPx(evt.i);

				this.record && this.upd();		// throttle?

				if (!this.hist[0][0].chk(evt.type, evt.id || null))
					this.pop(true);
			},
			notify: function notify(evt) {
				evt.i = evt.pxy.absIdx();
				this.exec(this.handle, [evt]);
			},
		},
	};

	// combine modules into proto
	for (var i in mods) {
		for (var j in mods[i]) {
			pxTrcr.prototype[j] = mods[i][j];
		}
	}
})();
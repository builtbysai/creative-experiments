/* Minimal module shim for the standalone demo.
   The chunks call (globalThis.TURBOPACK||[]).push([script, id, factory]).
   This captures the factories; __requireModule(id) instantiates a module on demand,
   resolving e.i(dep) imports and collecting e.s([name, type, value, ...]) exports. */
(function () {
  var store = {};
  globalThis.TURBOPACK = {
    push: function (entry) {
      var id = entry[1], factory = entry[2];
      if (typeof id === "number" && typeof factory === "function") {
        store[id] = { factory: factory, inst: null };
      }
    }
  };
  globalThis.__requireModule = function (id) {
    var rec = store[id];
    if (!rec) throw new Error("module not registered: " + id);
    if (rec.inst) return rec.inst.exports;
    var inst = (rec.inst = { exports: {} });
    var e = {
      i: function (dep) { return globalThis.__requireModule(dep); },
      s: function (list) {
        for (var k = 0; k + 2 < list.length; k += 3) inst.exports[list[k]] = list[k + 2];
      }
    };
    rec.factory(e);
    return inst.exports;
  };
})();

function pushExploreRoute(routes, route) {
  const filtered = routes.filter((entry) => entry.type !== route.type);
  return [...filtered, route];
}

const state = [{ type: "overview" }];
let queued = null;
function setRoutes(action) {
  if (typeof action === "function") {
    queued = action(queued !== null ? queued : state);
  } else {
    queued = action;
  }
}

setRoutes([]);
setRoutes((c) => pushExploreRoute(c, { type: "overview", id: "overview" }));
setRoutes((c) => pushExploreRoute(c, { type: "list", id: "list" }));
setRoutes((c) => pushExploreRoute(c, { type: "detail", id: "detail" }));

console.log(queued);
